"use strict";

const { Document } = require("flexsearch");
const Fuse = require("fuse.js");

// Подставь свои логгеры как раньше
let logStep = () => {};
let logDebug = () => {};
let logError = () => {};

class SemanticSearchEngine {
  constructor(knowledgeBase = [], options = {}) {
    this.knowledgeBase = Array.isArray(knowledgeBase) ? knowledgeBase : [];

    // логгеры (совместимо с твоим utils/logger)
    if (options.logger) {
      logStep = options.logger.logStep || logStep;
      logDebug = options.logger.logDebug || logDebug;
      logError = options.logger.logError || logError;
    }

    this.embeddingRuntime = options.embeddingRuntime;
    this.externalSemanticClient = options.externalSemanticClient;

    this.synonyms = this.loadSynonyms();
    this.stopWords = new Set([
      "и", "в", "на", "с", "по", "для", "от", "до", "при", "про", "под", "над",
      "через", "между", "без", "против", "вместо", "кроме", "около", "возле"
    ]);

    this.stemmer = new RussianStemmer();
    this.fuzzyMatcher = new FuzzyMatcher(); // оставил на всякий случай
    this.semanticAnalyzer = new SemanticAnalyzer({ embeddingRuntime: this.embeddingRuntime });

    // --- КЭШИ/ИНДЕКСЫ (главная оптимизация) ---
    this.docById = new Map();
    this.flex = null;

    // Fuse создаём лениво на shortlist’е (чтобы не держать 1ГБ в Fuse)
    this._lastFuseKey = "";
    this._lastFuse = null;

    // Подготовка документов: id, нормализованные поля, склейка
    this._prepareDocs();

    // Индекс FlexSearch (Exact stage)
    this._buildFlexIndex();

    // Если есть embeddingRuntime с indexKnowledgeBase — запускаем как раньше
    this.embeddingReady = this.embeddingRuntime?.indexKnowledgeBase
      ? Promise.resolve(this.embeddingRuntime.indexKnowledgeBase(this.knowledgeBase))
          .catch((error) =>
            logError("SemanticSearch", "Ошибка индексации эмбеддингов", { error: error?.message || String(error) })
          )
      : Promise.resolve();
  }

  // ------------------ PUBLIC API ------------------

  async search(query, context = {}, options = {}) {
    const searchOptions = {
      maxResults: 15,
      minScore: 0.08,
      fuzzyThreshold: 0.7,

      hallucinationMinScore: 1.2,
      hallucinationMinCoverage: 0.35,

      // сколько кандидатов берём из exact перед fuzzy/semantic
      semanticCandidateLimit: 300, // можно 200-2000
      semanticSearchTimeout: 3000,

      // сколько кандидатов отдаёт FlexSearch
      lexicalCandidateLimit: 800,

      // сколько документов отдаём в Fuse (fuzzy работает по shortlist'у)
      fuzzyCandidateLimit: 300,

      boostFactors: {
        title: 4.0,
        aliases: 2.5,
        content: 1.0,
        tags: 2.0,
        exactMatch: 5.0,
        fuzzyMatch: 0.6
      },
      contextBoost: true,
      semanticSimilarity: true,
      ...options
    };

    const startTime = Date.now();
    logStep("search:semantic:start", { query: String(query || "").slice(0, 100) });

    try {
      // 1) preprocess
      const preprocessStart = Date.now();
      const processedQuery = this.preprocessQuery(String(query || ""), context);

      logDebug("SemanticSearch", "Предобработка завершена", {
        durationMs: Date.now() - preprocessStart,
        totalDurationMs: Date.now() - startTime,
        tokens: processedQuery.tokens.length,
        expandedTokens: processedQuery.expandedTokens.length
      });

      let results = [];

      // 2) exact (FlexSearch)
      const exactStart = Date.now();
      const exactResults = this.performExactSearch(processedQuery, searchOptions);
      logStep("search:semantic:exact", { durationMs: Date.now() - exactStart, results: exactResults.length });
      results.push(...exactResults);

      // 3) fuzzy (Fuse) — только если мало результатов
      if (results.length < 5) {
        const fuzzyStart = Date.now();
        const fuzzyResults = this.performFuzzySearch(processedQuery, searchOptions, exactResults);
        logStep("search:semantic:fuzzy", { durationMs: Date.now() - fuzzyStart, results: fuzzyResults.length });
        results.push(...fuzzyResults);
      }

      // 4) semantic (embeddingRuntime или fallback)
      if (searchOptions.semanticSimilarity && results.length < 8) {
        const semanticStart = Date.now();
        const semanticResults = await this.performSemanticSearch(processedQuery, {
          ...searchOptions,
          semanticDeadline: startTime + searchOptions.semanticSearchTimeout
        }, results);
        logStep("search:semantic:semantic", { durationMs: Date.now() - semanticStart, results: semanticResults.length });
        results.push(...semanticResults);
      }

      // 5) dedupe
      results = this.removeDuplicates(results);

      // 6) context boost
      if (searchOptions.contextBoost && context?.recentEntities) {
        this.applyAdvancedContextBoost(results, context);
      }

      // 7) final ranking
      results = this.finalRanking(results, processedQuery, context);

      // 8) filter & limit
      let finalResults = results
        .filter((r) => r.score >= searchOptions.minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, searchOptions.maxResults);

      // 9) hallucination guard
      finalResults = this.applyHallucinationGuard(finalResults, processedQuery, searchOptions);

      logStep("search:semantic:completed", {
        durationMs: Date.now() - startTime,
        totalCandidates: results.length,
        returned: finalResults.length
      });

      // 10) metadata
      finalResults.forEach((result) => {
        result.searchMetadata = {
          processingTime: Date.now() - startTime,
          searchMethods: result.methods || ["standard"],
          confidence: this.calculateResultConfidence(result, processedQuery)
        };
      });

      return finalResults;
    } catch (error) {
      logError("SemanticSearch", "Ошибка во время поиска", { error: error?.message || String(error) });
      return [];
    }
  }

  // ------------------ INDEX BUILD ------------------

  _prepareDocs() {
    for (let i = 0; i < this.knowledgeBase.length; i++) {
      const d = this.knowledgeBase[i] || {};
      d.id = d.id || `doc_${i}`;

      // гарантируем массивы
      d.aliases = Array.isArray(d.aliases) ? d.aliases : [];
      d.tags = Array.isArray(d.tags) ? d.tags : [];

      // кэшируем для быстрых стадий/guard
      d.__norm = {
        title: this.normalizeText(d.title || ""),
        aliases: this.normalizeText(d.aliases.join(" ")),
        content: this.normalizeText(d.content || ""),
        tags: this.normalizeText(d.tags.join(" "))
      };
      d.__allText = `${d.__norm.title} ${d.__norm.aliases} ${d.__norm.content} ${d.__norm.tags}`.trim();

      // токены один раз (для guard/quality/completeness)
      d.__tokens = this.tokenize(d.__allText);
      d.__tokenSet = new Set(d.__tokens);

      this.docById.set(d.id, d);
    }
  }

  _buildFlexIndex() {
    const totalDocs = this.knowledgeBase.length;
    if (!totalDocs) return;

    // FlexSearch Document index: индексируем поля отдельно, но без тяжёлых фич
    this.flex = new Document({
      tokenize: "forward",
      cache: true,
      document: {
        id: "id",
        // индексируем строки
        index: ["title", "aliases", "content", "tags"],
        store: ["id"]
      }
    });

    for (const d of this.knowledgeBase) {
      this.flex.add({
        id: d.id,
        title: d.__norm.title,
        aliases: d.__norm.aliases,
        content: d.__norm.content,
        tags: d.__norm.tags
      });
    }
  }

  // ------------------ STAGES ------------------

  preprocessQuery(query, context) {
    const processed = {
      originalQuery: query,
      normalizedQuery: this.normalizeText(query),
      tokens: [],
      expandedTokens: [],
      entities: context?.entities || [],
      bigramTokens: [],
      trigramTokens: []
    };

    processed.tokens = this.tokenize(processed.normalizedQuery);
    processed.expandedTokens = this.expandTokens(processed.tokens);
    processed.bigramTokens = this.generateNGrams(processed.tokens, 2);
    processed.trigramTokens = this.generateNGrams(processed.tokens, 3);

    return processed;
  }

  performExactSearch(processedQuery, options) {
    if (!this.flex) return [];

    const q = processedQuery.normalizedQuery || processedQuery.originalQuery;
    if (!q) return [];

    const t0 = Date.now();

    // FlexSearch Document.search возвращает массив по полям: [{field, result:[ids]}]
    const res = this.flex.search(q, { limit: options.lexicalCandidateLimit, enrich: false });
    const ids = new Set();
    for (const r of res) {
      for (const id of r.result) ids.add(id);
    }

    // Скорим твоим scoring’ом, но ТОЛЬКО по кандидатам
    const results = [];
    for (const id of ids) {
      const doc = this.docById.get(id);
      if (!doc) continue;

      const score = this.calculateExactMatchScore(doc, processedQuery, options);
      if (score > 0.1) {
        results.push({
          document: doc,
          score,
          methods: ["exact"],
          scoreBreakdown: this.getDetailedScoreBreakdown(doc, processedQuery, options, "exact")
        });
      }
    }

    logDebug("SemanticSearch", "Exact кандидаты из FlexSearch", {
      durationMs: Date.now() - t0,
      candidates: ids.size,
      returned: results.length
    });

    return results;
  }

  performFuzzySearch(processedQuery, options, seededExactResults = []) {
    const query = processedQuery.originalQuery;
    if (!query) return [];

    // shortlist: если exact дал кандидатов — берём их документы, иначе берём top из FlexSearch
    let candidates = [];
    if (seededExactResults.length) {
      candidates = seededExactResults
        .slice(0, options.fuzzyCandidateLimit)
        .map((r) => r.document);
    } else {
      // fallback shortlist из FlexSearch
      const ids = this._lexicalCandidateIds(processedQuery, options.fuzzyCandidateLimit);
      candidates = ids.map((id) => this.docById.get(id)).filter(Boolean);
    }

    if (!candidates.length) return [];

    // Fuse делаем/кешируем по ключу состава кандидатов (чтобы не собирать заново постоянно)
    const fuseKey = candidates.map((d) => d.id).join("|");
    let fuse = this._lastFuseKey === fuseKey ? this._lastFuse : null;

    if (!fuse) {
      fuse = new Fuse(
        candidates.map((d) => ({
          id: d.id,
          title: d.title || "",
          aliases: (d.aliases || []).join(" "),
          content: d.content || "",
          tags: (d.tags || []).join(" ")
        })),
        {
          includeScore: true,
          threshold: 0.35, // можно 0.25-0.45
          ignoreLocation: true,
          keys: ["title", "aliases", "content", "tags"]
        }
      );
      this._lastFuseKey = fuseKey;
      this._lastFuse = fuse;
    }

    const fuseRes = fuse.search(query, { limit: options.fuzzyCandidateLimit });

    // Fuse score: 0 (лучше) -> 1 (хуже). Преобразуем в “больше=лучше”
    const results = [];
    for (const r of fuseRes) {
      const doc = this.docById.get(r.item.id);
      if (!doc) continue;

      const sim = 1 - (typeof r.score === "number" ? r.score : 1);
      // сопоставим с твоими порогами: у тебя fuzzyThreshold похож на similarity
      if (sim < (options.fuzzyThreshold || 0.7)) continue;

      results.push({
        document: doc,
        score: sim * options.boostFactors.fuzzyMatch,
        methods: ["fuzzy"],
        scoreBreakdown: { fuse: sim }
      });
    }

    return results;
  }

  async performSemanticSearch(processedQuery, options, seededResults = []) {
    const deadline = options.semanticDeadline || (Date.now() + 3000);
    const results = [];

    await this.embeddingReady;

    // candidates: берём shortlist из уже найденных + lexical candidates
    const candidateIds = new Set();

    for (const r of seededResults.slice(0, options.semanticCandidateLimit)) {
      if (r?.document?.id) candidateIds.add(r.document.id);
    }

    if (candidateIds.size < options.semanticCandidateLimit) {
      const moreIds = this._lexicalCandidateIds(processedQuery, options.semanticCandidateLimit);
      for (const id of moreIds) {
        candidateIds.add(id);
        if (candidateIds.size >= options.semanticCandidateLimit) break;
      }
    }

    const candidates = [...candidateIds].map((id) => this.docById.get(id)).filter(Boolean);
    if (!candidates.length) return [];

    // 1) внешний сервис (если есть)
    if (this.externalSemanticClient?.isEnabled?.()) {
      const externalStart = Date.now();
      try {
        const externalResults = await this.externalSemanticClient.scoreQuery(
          processedQuery.originalQuery,
          candidates,
          { limit: options.semanticCandidateLimit, timeoutMs: options.semanticSearchTimeout }
        );

        const mapped = (externalResults || [])
          .map((x) => {
            const doc = this.docById.get(x.id);
            if (!doc || typeof x.score !== "number") return null;
            return {
              document: doc,
              score: x.score,
              methods: ["semantic", "external-service"],
              scoreBreakdown: { external: x.score }
            };
          })
          .filter(Boolean);

        logStep("search:semantic:external", {
          durationMs: Date.now() - externalStart,
          results: mapped.length,
          candidates: candidates.length
        });

        if (mapped.length) return mapped;
      } catch (e) {
        logError("SemanticSearch", "External semantic failed", { error: e?.message || String(e) });
      }
    }

    // 2) embeddingRuntime, если есть
    let queryEmbedding;
    const embedStart = Date.now();
    try {
      queryEmbedding = this.embeddingRuntime?.buildQueryEmbedding
        ? await this.embeddingRuntime.buildQueryEmbedding(processedQuery.originalQuery)
        : undefined;
    } catch (e) {
      logError("SemanticSearch", "buildQueryEmbedding failed", { error: e?.message || String(e) });
      queryEmbedding = undefined;
    }

    logDebug("SemanticSearch", "Эмбеддинг запроса получен", {
      durationMs: Date.now() - embedStart,
      usedRuntime: Boolean(queryEmbedding)
    });

    let processedCount = 0;
    for (const doc of candidates) {
      if (Date.now() > deadline) {
        logStep("search:semantic:timeout", {
          processed: processedCount,
          deadlineMs: options.semanticSearchTimeout
        });
        break;
      }

      let semanticScore = 0;
      try {
        if (queryEmbedding && this.embeddingRuntime?.calculateSimilarityWithEmbedding) {
          semanticScore = await this.embeddingRuntime.calculateSimilarityWithEmbedding(queryEmbedding, doc);
        } else {
          // fallback (лёгкий)
          semanticScore = await this.semanticAnalyzer.calculateSimilarity(processedQuery.originalQuery, doc.content || "");
        }
      } catch (e) {
        continue;
      }

      processedCount++;

      if (semanticScore > 0.2) {
        results.push({
          document: doc,
          score: semanticScore * 0.8,
          methods: ["semantic", queryEmbedding ? "neural-embedding" : "lexical"],
          scoreBreakdown: { semantic: semanticScore }
        });
      }
    }

    return results;
  }

  _lexicalCandidateIds(processedQuery, limit) {
    if (!this.flex) return [];
    const q = processedQuery.normalizedQuery || processedQuery.originalQuery;
    const res = this.flex.search(q, { limit, enrich: false });
    const ids = new Set();
    for (const r of res) for (const id of r.result) ids.add(id);
    return [...ids];
  }

  // ------------------ SCORING (оставлено как у тебя, но без тяжёлого IDF) ------------------

  calculateExactMatchScore(document, processedQuery, options) {
    let totalScore = 0;
    const breakdown = {};

    const titleScore = this.calculateFieldScore(document.title || "", document, processedQuery, options.boostFactors.title, "title");
    totalScore += titleScore;
    breakdown.title = titleScore;

    if ((document.title || "").toLowerCase() === processedQuery.normalizedQuery.toLowerCase()) {
      const exactBonus = options.boostFactors.exactMatch;
      totalScore += exactBonus;
      breakdown.exactTitleMatch = exactBonus;
    }

    let aliasScore = 0;
    for (const alias of (document.aliases || [])) {
      const s = this.calculateFieldScore(alias, document, processedQuery, options.boostFactors.aliases, "alias");
      aliasScore += s;

      if (String(alias || "").toLowerCase() === processedQuery.normalizedQuery.toLowerCase()) {
        aliasScore += options.boostFactors.exactMatch * 0.8;
      }
    }
    totalScore += aliasScore;
    breakdown.aliases = aliasScore;

    const contentScore = this.calculateFieldScore(document.content || "", document, processedQuery, options.boostFactors.content, "content");
    totalScore += contentScore;
    breakdown.content = contentScore;

    let tagsScore = 0;
    for (const tag of (document.tags || [])) {
      tagsScore += this.calculateFieldScore(tag, document, processedQuery, options.boostFactors.tags, "tag");
    }
    totalScore += tagsScore;
    breakdown.tags = tagsScore;

    const phraseBonus = this.calculatePhraseMatchBonus(document, processedQuery);
    totalScore += phraseBonus;
    breakdown.phraseMatch = phraseBonus;

    return totalScore;
  }

  // ⚠️ ВАЖНО: убрали настоящий IDF (он был О(N) на каждый term).
  // Здесь — лёгкая эвристика: чаще встречающийся токен в документе = больше TF,
  // а “idf” заменяем на 1.0 (или можно сделать простую penalization).
  calculateFieldScore(fieldText, document, processedQuery, boostFactor, fieldType) {
    const norm = this.normalizeText(fieldText || "");
    const fieldTokens = this.tokenize(norm);
    if (!fieldTokens.length) return 0;

    let score = 0;

    for (const qt of processedQuery.tokens) {
      const tf = this.calculateTF(qt, fieldTokens);
      score += tf; // idf ~ 1
    }

    for (const et of processedQuery.expandedTokens) {
      if (processedQuery.tokens.includes(et)) continue;
      const tf = this.calculateTF(et, fieldTokens);
      score += tf * 0.7;
    }

    if (fieldType === "title" || fieldType === "alias") {
      score += this.calculatePositionBonus(fieldText || "", processedQuery.originalQuery || "");
    }

    return score * boostFactor;
  }

  calculatePhraseMatchBonus(document, processedQuery) {
    let bonus = 0;
    const docText = (document.__allText || `${document.title || ""} ${document.content || ""}`).toLowerCase();

    for (const bigram of processedQuery.bigramTokens) {
      if (docText.includes(bigram.join(" "))) bonus += 0.3;
    }
    for (const trigram of processedQuery.trigramTokens) {
      if (docText.includes(trigram.join(" "))) bonus += 0.5;
    }
    return Math.min(bonus, 2.0);
  }

  // ------------------ POST-PROCESS ------------------

  removeDuplicates(results) {
    const seen = new Set();
    return results.filter((r) => {
      const key = r?.document?.id || r?.document?.title;
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  applyAdvancedContextBoost(results, context) {
    const { recentEntities, currentTopic, emotionalContext } = context || {};

    for (const r of results) {
      let boost = 0;
      const doc = r.document;
      const docText = doc.__allText || `${doc.title || ""} ${(doc.aliases || []).join(" ")} ${doc.content || ""}`.toLowerCase();

      if (recentEntities) {
        for (const e of recentEntities) {
          const name = (e?.name || "").toLowerCase();
          if (!name) continue;
          if (docText.includes(name)) {
            boost += ((e.frequency || 1) * 0.1) + this.calculateRecencyBonus(e.lastMention || 0);
          }
        }
      }

      if (currentTopic && doc.title === currentTopic) boost += 0.4;

      if (emotionalContext?.currentState === "confused") {
        if ((doc.content || "").length < 500) boost += 0.2;
      }

      r.score += boost;
      r.contextBoost = boost;
    }
  }

  finalRanking(results, processedQuery, context) {
    for (const r of results) {
      const doc = r.document;
      const qualityBonus = this.calculateContentQualityScore(doc);
      const lengthPenalty = (doc.content || "").length > 2000 ? -0.1 : 0;
      const completenessBonus = this.calculateCompletenessScore(doc, processedQuery);

      r.score += qualityBonus + lengthPenalty + completenessBonus;
      r.score = Math.max(0, Math.min(r.score, 10.0));
    }
    return results;
  }

  applyHallucinationGuard(results, processedQuery, options) {
    const minScore = options.hallucinationMinScore || 1.2;
    const minCoverage = options.hallucinationMinCoverage || 0.35;
    const uniqueQueryTokens = [...new Set(processedQuery.tokens)];

    return results.filter((r) => {
      const doc = r?.document;
      if (!doc) return false;
      if (r.score < minScore) return false;

      // используем кэшированные токены документа
      const tokenSet = doc.__tokenSet || new Set(this.tokenize(this.normalizeText(doc.__allText || "")));
      const matched = uniqueQueryTokens.filter((t) => tokenSet.has(t));
      const coverage = matched.length / Math.max(uniqueQueryTokens.length, 1);

      const docText = (doc.__allText || "").toLowerCase();
      const phraseHit =
        processedQuery.bigramTokens.some((ng) => docText.includes(ng.join(" "))) ||
        processedQuery.trigramTokens.some((ng) => docText.includes(ng.join(" ")));

      const ok = coverage >= minCoverage || phraseHit;
      if (!ok) {
        r.searchMetadata = { ...(r.searchMetadata || {}), filteredBy: "hallucination_guard", coverage };
      }
      return ok;
    });
  }

  // ------------------ SMALL HELPERS ------------------

  calculateTF(term, tokens) {
    if (!tokens.length) return 0;
    let c = 0;
    for (const t of tokens) if (t === term) c++;
    return c / tokens.length;
  }

  calculatePositionBonus(fieldText, originalQuery) {
    const fieldLC = String(fieldText || "").toLowerCase();
    const queryLC = String(originalQuery || "").toLowerCase();

    if (!queryLC) return 0;
    if (fieldLC.startsWith(queryLC)) return 0.3;
    if (fieldLC.endsWith(queryLC)) return 0.2;
    if (fieldLC.includes(queryLC)) return 0.1;
    return 0;
  }

  calculateRecencyBonus(lastMention) {
    if (!lastMention) return 0;
    const timeDiff = Date.now() - lastMention;
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    if (hoursDiff < 1) return 0.3;
    if (hoursDiff < 24) return 0.2;
    if (hoursDiff < 168) return 0.1;
    return 0;
  }

  calculateContentQualityScore(document) {
    let score = 0;
    const content = document.content || "";

    if (content.includes("\n") || content.includes(".")) score += 0.1;

    const len = content.length;
    if (len >= 100 && len <= 1000) score += 0.15;

    if (document.tags && document.tags.length > 0) score += 0.1;
    if (document.aliases && document.aliases.length > 0) score += 0.05;

    return score;
  }

  calculateCompletenessScore(document, processedQuery) {
    const tokenSet = document.__tokenSet || new Set();
    const hits = processedQuery.tokens.filter((t) => tokenSet.has(t));
    return (hits.length / Math.max(processedQuery.tokens.length, 1)) * 0.2;
  }

  calculateResultConfidence(result, processedQuery) {
    let confidence = Math.min(result.score / 5.0, 1.0);

    if (result.scoreBreakdown?.exactTitleMatch > 0) {
      confidence = Math.min(confidence + 0.2, 0.98);
    }
    if (result.methods?.includes("fuzzy")) confidence *= 0.8;

    return Math.max(0.1, confidence);
  }

  normalizeText(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^\wа-яё\s\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  tokenize(text) {
    return String(text || "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .filter((w) => !this.stopWords.has(w))
      .map((w) => this.stemmer.stem(w))
      .filter((w) => w.length > 1);
  }

  expandTokens(tokens) {
    const expanded = [...tokens];
    for (const t of tokens) {
      if (this.synonyms.has(t)) expanded.push(...this.synonyms.get(t));
    }
    return [...new Set(expanded)];
  }

  generateNGrams(tokens, n) {
    const ngrams = [];
    for (let i = 0; i <= tokens.length - n; i++) ngrams.push(tokens.slice(i, i + n));
    return ngrams;
  }

  getDetailedScoreBreakdown(document, processedQuery, options, method) {
    return {
      method,
      title: this.calculateFieldScore(document.title || "", document, processedQuery, options.boostFactors.title, "title"),
      aliases: (document.aliases || []).reduce(
        (sum, a) => sum + this.calculateFieldScore(a || "", document, processedQuery, options.boostFactors.aliases, "alias"),
        0
      ),
      content: this.calculateFieldScore(document.content || "", document, processedQuery, options.boostFactors.content, "content"),
      tags: (document.tags || []).reduce(
        (sum, t) => sum + this.calculateFieldScore(t || "", document, processedQuery, options.boostFactors.tags, "tag"),
        0
      ),
      phraseMatch: this.calculatePhraseMatchBonus(document, processedQuery)
    };
  }

  loadSynonyms() {
    return new Map([
      ["компания", ["фирма", "организация", "предприятие", "бизнес", "корпорация"]],
      ["сервис", ["служба", "услуга", "обслуживание"]],
      ["система", ["механизм", "комплекс", "структура", "схема"]],
      ["процесс", ["процедура", "операция", "ход", "течение"]],
      ["пользователь", ["клиент", "юзер", "потребитель", "заказчик"]],
      ["технология", ["техника", "метод", "способ", "подход"]],
      ["программа", ["приложение", "софт", "ПО", "утилита"]],
      ["интерфейс", ["оболочка", "среда", "панель"]],
      ["данные", ["информация", "сведения", "материалы"]],
      ["безопасность", ["защита", "секьюрити", "охрана"]],
      ["решение", ["способ", "метод", "вариант", "подход"]],
      ["проблема", ["трудность", "вопрос", "задача", "сложность"]],
      ["функция", ["возможность", "опция", "характеристика"]],
      ["настройка", ["конфигурация", "параметр", "установка"]],
      ["ошибка", ["сбой", "баг", "неисправность", "проблема"]],
      ["версия", ["вариант", "редакция", "релиз"]],
      ["документ", ["файл", "бумага", "материал"]],
      ["отчет", ["доклад", "сводка", "сообщение"]],
      ["анализ", ["разбор", "исследование", "изучение"]],
      ["результат", ["итог", "вывод", "следствие"]],
      ["поиск", ["розыск", "поиски", "нахождение"]],
      ["работа", ["деятельность", "труд", "функционирование"]],
      ["управление", ["контроль", "руководство", "регулирование"]],
      ["развитие", ["рост", "прогресс", "эволюция"]],
      ["изменение", ["модификация", "корректировка", "правка"]]
    ]);
  }
}

class RussianStemmer {
  stem(word) {
    const endings = [
      "ными", "овой", "евой", "ской", "цкой", "ицкой",
      "ами", "ах", "ем", "ов", "ам", "ми", "ой", "ем",
      "ых", "ие", "ая", "ое", "ые", "ий", "ый", "ая",
      "ами", "ах", "ов", "ей", "ям", "ями", "ях",
      "ость", "ение", "ание", "ство", "ция", "сия",
      "ать", "еть", "ить", "оть", "уть", "ють", "ишь", "ешь",
      "ала", "ила", "ела", "ула", "ыла",
      "ы", "и", "а", "е", "о", "у", "я", "ь", "й"
    ];

    let s = String(word || "").toLowerCase();
    for (const end of endings) {
      if (s.endsWith(end) && s.length > end.length + 2) {
        s = s.slice(0, -end.length);
        break;
      }
    }
    return s;
  }
}

class FuzzyMatcher {
  similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    return this.levenshteinSimilarity(a, b);
  }
  levenshteinSimilarity(a, b) {
    const d = this.levenshteinDistance(a, b);
    const m = Math.max(a.length, b.length);
    return m === 0 ? 1 : 1 - d / m;
  }
  levenshteinDistance(a, b) {
    const m = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) m[0][i] = i;
    for (let j = 0; j <= b.length; j++) m[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        m[j][i] = Math.min(
          m[j][i - 1] + 1,
          m[j - 1][i] + 1,
          m[j - 1][i - 1] + cost
        );
      }
    }
    return m[b.length][a.length];
  }
}

class SemanticAnalyzer {
  constructor({ embeddingRuntime } = {}) {
    this.embeddingRuntime = embeddingRuntime;
  }

  async calculateSimilarity(text1, text2) {
    // лёгкий fallback: пересечение “концептов”
    const c1 = this.extractConcepts(text1);
    const c2 = this.extractConcepts(text2);
    const inter = c1.filter((x) => c2.includes(x));
    const union = [...new Set([...c1, ...c2])];
    return union.length ? inter.length / union.length : 0;
  }

  extractConcepts(text) {
    return String(text || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .filter((w) => !this.isCommonWord(w))
      .slice(0, 10);
  }

  isCommonWord(word) {
    const common = new Set([
      "который", "которая", "которое", "является", "может", "должен",
      "необходимо", "возможно", "например", "также", "кроме", "более"
    ]);
    return common.has(word);
  }
}

module.exports = { SemanticSearchEngine, RussianStemmer };
