const { logStep, logDebug, logError } = require("../../utils/logger");

class SemanticSearchEngine {
    constructor(knowledgeBase = [], options = {}) {
        this.knowledgeBase = knowledgeBase;
        this.embeddingRuntime = options.embeddingRuntime;
        this.externalSemanticClient = options.externalSemanticClient;
        this.indexCache = new Map();
        this.synonyms = this.loadSynonyms();
        this.stopWords = new Set([
            'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'при', 'про', 'под', 'над',
            'через', 'между', 'без', 'против', 'вместо', 'кроме', 'около', 'возле'
        ]);
        this.stemmer = new RussianStemmer();
        this.fuzzyMatcher = new FuzzyMatcher();
        this.semanticAnalyzer = new SemanticAnalyzer({ embeddingRuntime: this.embeddingRuntime });
        
        // Предварительная индексация
        this.buildSearchIndex();

        this.embeddingReady = this.embeddingRuntime?.indexKnowledgeBase
            ? Promise.resolve(this.embeddingRuntime.indexKnowledgeBase(this.knowledgeBase))
                .catch(error => logError("SemanticSearch", "Ошибка индексации эмбеддингов", { error: error.message }))
            : Promise.resolve();
    }

    async search(query, context = {}, options = {}) {
        const searchOptions = {
            maxResults: 15,
            minScore: 0.08,
            fuzzyThreshold: 0.7,
            // Строгие пороги, чтобы не поднимать нерелевантные документы
            hallucinationMinScore: 1.2,
            hallucinationMinCoverage: 0.35,
            semanticCandidateLimit: 200,
            semanticSearchTimeout: 3000,
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
        logStep("search:semantic:start", { query: query?.slice(0, 100) });

        try {
            // 1. Предобработка запроса
            const preprocessStart = Date.now();
            const processedQuery = this.preprocessQuery(query, context);
            logDebug("SemanticSearch", "Предобработка завершена", {
                durationMs: Date.now() - preprocessStart,
                totalDurationMs: Date.now() - startTime,
                tokens: processedQuery.tokens.length,
                expandedTokens: processedQuery.expandedTokens.length,
            });

            // 2. Многоэтапный поиск
            let results = [];

            // Этап 1: Точный поиск
            const exactStart = Date.now();
            const exactResults = this.performExactSearch(processedQuery, searchOptions);
            logStep("search:semantic:exact", {
                durationMs: Date.now() - exactStart,
                results: exactResults.length,
            });
            results.push(...exactResults);
            logDebug("SemanticSearch", "Точный поиск", {
                durationMs: Date.now() - startTime,
                results: exactResults.length,
            });

            // Этап 2: Нечеткий поиск (если недостаточно результатов)
            if (results.length < 5) {
                const fuzzyStart = Date.now();
                const fuzzyResults = this.performFuzzySearch(processedQuery, searchOptions);
                logStep("search:semantic:fuzzy", {
                    durationMs: Date.now() - fuzzyStart,
                    results: fuzzyResults.length,
                    seededResults: results.length,
                });
                results.push(...fuzzyResults);
                logDebug("SemanticSearch", "Нечеткий поиск", {
                    durationMs: Date.now() - startTime,
                    results: fuzzyResults.length,
                });
            }

            // Этап 3: Семантический поиск
            if (searchOptions.semanticSimilarity && results.length < 8) {
                const semanticStart = Date.now();
                const semanticResults = await this.performSemanticSearch(processedQuery, {
                    ...searchOptions,
                    semanticDeadline: startTime + searchOptions.semanticSearchTimeout
                });
                logStep("search:semantic:semantic", {
                    durationMs: Date.now() - semanticStart,
                    results: semanticResults.length,
                });
                results.push(...semanticResults);
                logDebug("SemanticSearch", "Семантический поиск", {
                    durationMs: Date.now() - startTime,
                    results: semanticResults.length,
                });
            }
            
            // 3. Убираем дубликаты
            results = this.removeDuplicates(results);
            
            // 4. Контекстное усиление
            if (searchOptions.contextBoost && context.recentEntities) {
                this.applyAdvancedContextBoost(results, context);
            }
            
            // 5. Финальное ранжирование
            results = this.finalRanking(results, processedQuery, context);

            // 6. Фильтрация и ограничение результатов
            let finalResults = results
                .filter(result => result.score >= searchOptions.minScore)
                .sort((a, b) => b.score - a.score)
                .slice(0, searchOptions.maxResults);

            // 7. Отбрасываем нерелевантные совпадения (hallucination-guard)
            finalResults = this.applyHallucinationGuard(
                finalResults,
                processedQuery,
                searchOptions
            );

            logStep("search:semantic:completed", {
                durationMs: Date.now() - startTime,
                totalCandidates: results.length,
                returned: finalResults.length,
            });

            // Добавляем метаданные поиска
            finalResults.forEach(result => {
                result.searchMetadata = {
                    processingTime: Date.now() - startTime,
                    searchMethods: result.methods || ['standard'],
                    confidence: this.calculateResultConfidence(result, processedQuery)
                };
            });

            return finalResults;

        } catch (error) {
            console.error('Ошибка в поиске:', error);
            logError("SemanticSearch", "Ошибка во время поиска", error);
            return [];
        }
    }

    buildSearchIndex() {
        const totalDocs = this.knowledgeBase.length;
        const startTime = Date.now();

        if (totalDocs === 0) {
            console.log('Построение поискового индекса пропущено: база знаний пуста');
            return;
        }

        console.log(`Построение поискового индекса... (${totalDocs} документов)`);

        for (let index = 0; index < totalDocs; index++) {
            const document = this.knowledgeBase[index];
            document.id = document.id || `doc_${index}`;
            
            // Индексируем все текстовые поля
            const allText = [
                document.title,
                ...document.aliases,
                document.content,
                ...document.tags
            ].join(' ').toLowerCase();

            const tokens = this.tokenize(allText);
            
            // Создаем обратный индекс
            tokens.forEach(token => {
                if (!this.indexCache.has(token)) {
                    this.indexCache.set(token, []);
                }

                const docList = this.indexCache.get(token);
                if (!docList.find(d => d.id === document.id)) {
                    docList.push({
                        id: document.id,
                        document: document,
                        frequency: this.calculateTermFrequency(token, tokens)
                    });
                }
            });

            if ((index + 1) % 1000 === 0 || index + 1 === totalDocs) {
                const progress = (((index + 1) / totalDocs) * 100).toFixed(1);
                console.log(
                    `   Индексировано ${index + 1}/${totalDocs} документов (${progress}%), уникальных токенов: ${this.indexCache.size}`
                );
            }
        }

        console.log(
            `Индекс построен. Уникальных токенов: ${this.indexCache.size}. Время: ${Date.now() - startTime} мс`
        );
    }

    preprocessQuery(query, context) {
        const processed = {
            originalQuery: query,
            normalizedQuery: this.normalizeText(query),
            tokens: [],
            expandedTokens: [],
            entities: context.entities || [],
            bigramTokens: [],
            trigramTokens: []
        };

        // Токенизация с нормализацией
        processed.tokens = this.tokenize(processed.normalizedQuery);
        
        // Расширение синонимами и морфологическими формами
        processed.expandedTokens = this.expandTokens(processed.tokens);
        
        // N-граммы для фразового поиска
        processed.bigramTokens = this.generateNGrams(processed.tokens, 2);
        processed.trigramTokens = this.generateNGrams(processed.tokens, 3);

        return processed;
    }

    performExactSearch(processedQuery, options) {
        const results = [];

        this.knowledgeBase.forEach(document => {
            const score = this.calculateExactMatchScore(document, processedQuery, options);
            
            if (score > 0.1) {
                results.push({
                    document,
                    score,
                    methods: ['exact'],
                    scoreBreakdown: this.getDetailedScoreBreakdown(document, processedQuery, options, 'exact')
                });
            }
        });

        return results;
    }

    performFuzzySearch(processedQuery, options) {
        const results = [];
        const fuzzyThreshold = options.fuzzyThreshold;

        this.knowledgeBase.forEach(document => {
            const fuzzyScore = this.calculateFuzzyScore(document, processedQuery, fuzzyThreshold);
            
            if (fuzzyScore > 0.15) {
                results.push({
                    document,
                    score: fuzzyScore * options.boostFactors.fuzzyMatch,
                    methods: ['fuzzy'],
                    scoreBreakdown: { fuzzy: fuzzyScore }
                });
            }
        });

        return results;
    }

    async performSemanticSearch(processedQuery, options) {
        const results = [];
        const deadline = options.semanticDeadline || (Date.now() + 3000);
        const embedStart = Date.now();
        await this.embeddingReady;
        const queryEmbedding = this.embeddingRuntime
            ? await this.embeddingRuntime.buildQueryEmbedding(processedQuery.originalQuery)
            : undefined;
        const embedDuration = Date.now() - embedStart;
        logDebug("SemanticSearch", "Эмбеддинг запроса получен", {
            durationMs: embedDuration,
            usedRuntime: Boolean(this.embeddingRuntime),
            fallback: !this.embeddingRuntime,
        });

        const candidateStart = Date.now();
        const candidates = this.getSemanticCandidates(
            processedQuery,
            options.semanticCandidateLimit
        );
        const candidateDuration = Date.now() - candidateStart;
        logStep("search:semantic:candidates", {
            durationMs: candidateDuration,
            candidates: candidates.length,
            limit: options.semanticCandidateLimit,
        });

        if (this.externalSemanticClient?.isEnabled()) {
            const externalStart = Date.now();
            const externalResults = await this.externalSemanticClient.scoreQuery(
                processedQuery.originalQuery,
                candidates,
                { limit: options.semanticCandidateLimit, timeoutMs: options.semanticSearchTimeout }
            );

            const mappedResults = externalResults
                .map((result) => {
                    const document = candidates.find((doc) => doc.id === result.id) || this.knowledgeBase.find((doc) => doc.id === result.id);
                    if (!document || typeof result.score !== "number") return null;

                    return {
                        document,
                        score: result.score,
                        methods: ["semantic", "external-service"],
                        scoreBreakdown: { external: result.score },
                    };
                })
                .filter(Boolean);

            logStep("search:semantic:external", {
                durationMs: Date.now() - externalStart,
                results: mappedResults.length,
                candidates: candidates.length,
            });

            if (mappedResults.length) {
                return mappedResults;
            }
        }

        let processedCandidates = 0;
        let skippedCandidates = 0;
        let totalScoreTime = 0;
        let lastCheckpoint = Date.now();

        for (const document of candidates) {
            const perCandidateStart = Date.now();
            if (Date.now() > deadline) {
                logStep("search:semantic:timeout", {
                    processed: processedCandidates,
                    elapsedMs: Date.now() - embedStart,
                    deadlineMs: options.semanticSearchTimeout,
                });
                break;
            }

            const semanticScore = queryEmbedding
                ? await this.embeddingRuntime.calculateSimilarityWithEmbedding(queryEmbedding, document)
                : await this.semanticAnalyzer.calculateSimilarity(
                    processedQuery.originalQuery,
                    document.content
                );

            processedCandidates += 1;
            totalScoreTime += Date.now() - perCandidateStart;
            if (processedCandidates % 50 === 0 || Date.now() - lastCheckpoint > 500) {
                logDebug("SemanticSearch", "Прогресс оценки кандидатов", {
                    processed: processedCandidates,
                    total: candidates.length,
                    elapsedMs: Date.now() - embedStart,
                });
                lastCheckpoint = Date.now();
            }

            if (semanticScore > 0.2) {
                results.push({
                    document,
                    score: semanticScore * 0.8, // немного понижаем вес семантического поиска
                    methods: ['semantic', queryEmbedding ? 'neural-embedding' : 'lexical'],
                    scoreBreakdown: { semantic: semanticScore }
                });
            } else {
                skippedCandidates += 1;
            }
        }

        const scoringDuration = Date.now() - candidateStart - candidateDuration;
        logStep("search:semantic:scoring", {
            durationMs: scoringDuration,
            processed: processedCandidates,
            skipped: skippedCandidates,
            avgPerCandidateMs: processedCandidates ? Number((totalScoreTime / processedCandidates).toFixed(2)) : 0,
            embedMs: embedDuration,
            candidatePrepMs: candidateDuration,
        });

        return results;
    }

    getSemanticCandidates(processedQuery, limit = 200) {
        const candidateMap = new Map();

        const lookupTokens = [
            ...processedQuery.tokens,
            ...processedQuery.expandedTokens,
            ...processedQuery.bigramTokens,
            ...processedQuery.trigramTokens
        ];

        lookupTokens.forEach(token => {
            const entries = this.indexCache.get(token);
            if (!entries) return;

            entries.forEach(entry => {
                const current = candidateMap.get(entry.id) || { score: 0, document: entry.document };
                const score = current.score + 1 + (entry.frequency || 0);
                candidateMap.set(entry.id, { score, document: entry.document });
            });
        });

        let candidates = Array.from(candidateMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, Math.max(limit, 1))
            .map(entry => entry.document);

        if (!candidates.length) {
            // Фоллбэк: берём небольшой срез базы знаний, чтобы не обходить весь массив
            candidates = this.knowledgeBase.slice(0, Math.max(limit, 1));
        }

        return candidates;
    }

    calculateExactMatchScore(document, processedQuery, options) {
        let totalScore = 0;
        const breakdown = {};

        // Оценка по заголовку
        const titleScore = this.calculateFieldScore(
            document.title,
            processedQuery,
            options.boostFactors.title,
            'title'
        );
        totalScore += titleScore;
        breakdown.title = titleScore;

        // Точное совпадение заголовка (особый бонус)
        if (document.title.toLowerCase() === processedQuery.normalizedQuery.toLowerCase()) {
            const exactBonus = options.boostFactors.exactMatch;
            totalScore += exactBonus;
            breakdown.exactTitleMatch = exactBonus;
        }

        // Оценка по алиасам
        let aliasScore = 0;
        document.aliases.forEach(alias => {
            const score = this.calculateFieldScore(
                alias,
                processedQuery,
                options.boostFactors.aliases,
                'alias'
            );
            aliasScore += score;
            
            // Точное совпадение алиаса
            if (alias.toLowerCase() === processedQuery.normalizedQuery.toLowerCase()) {
                aliasScore += options.boostFactors.exactMatch * 0.8;
            }
        });
        totalScore += aliasScore;
        breakdown.aliases = aliasScore;

        // Оценка по содержимому
        const contentScore = this.calculateFieldScore(
            document.content,
            processedQuery,
            options.boostFactors.content,
            'content'
        );
        totalScore += contentScore;
        breakdown.content = contentScore;

        // Оценка по тегам
        let tagsScore = 0;
        document.tags.forEach(tag => {
            const score = this.calculateFieldScore(
                tag,
                processedQuery,
                options.boostFactors.tags,
                'tag'
            );
            tagsScore += score;
        });
        totalScore += tagsScore;
        breakdown.tags = tagsScore;

        // Бонус за фразовые совпадения
        const phraseBonus = this.calculatePhraseMatchBonus(document, processedQuery);
        totalScore += phraseBonus;
        breakdown.phraseMatch = phraseBonus;

        return totalScore;
    }

    calculateFieldScore(fieldText, processedQuery, boostFactor, fieldType) {
        const fieldTokens = this.tokenize(this.normalizeText(fieldText));
        let score = 0;

        // TF-IDF для основных токенов
        processedQuery.tokens.forEach(queryToken => {
            const tf = this.calculateTF(queryToken, fieldTokens);
            const idf = this.calculateIDF(queryToken);
            score += tf * idf;
        });

        // Бонус за расширенные токены (синонимы)
        processedQuery.expandedTokens.forEach(expandedToken => {
            if (processedQuery.tokens.includes(expandedToken)) return; // избегаем двойного учета
            
            const tf = this.calculateTF(expandedToken, fieldTokens);
            const idf = this.calculateIDF(expandedToken);
            score += (tf * idf) * 0.7; // пониженный вес для синонимов
        });

        // Позиционный бонус для заголовков и алиасов
        if (fieldType === 'title' || fieldType === 'alias') {
            const positionBonus = this.calculatePositionBonus(fieldText, processedQuery.originalQuery);
            score += positionBonus;
        }

        return score * boostFactor;
    }

    calculateFuzzyScore(document, processedQuery, threshold) {
        const documentText = `${document.title} ${document.aliases.join(' ')} ${document.content}`;
        
        let maxFuzzyScore = 0;
        
        processedQuery.tokens.forEach(queryToken => {
            const documentTokens = this.tokenize(this.normalizeText(documentText));
            
            documentTokens.forEach(docToken => {
                const similarity = this.fuzzyMatcher.similarity(queryToken, docToken);
                if (similarity >= threshold) {
                    maxFuzzyScore = Math.max(maxFuzzyScore, similarity);
                }
            });
        });

        // Дополнительная проверка на фразовую нечеткую схожесть
        const phraseSimilarity = this.fuzzyMatcher.phraseSimilarity(
            processedQuery.originalQuery, 
            documentText
        );

        return Math.max(maxFuzzyScore, phraseSimilarity * 0.8);
    }

    calculatePhraseMatchBonus(document, processedQuery) {
        let bonus = 0;
        const documentText = `${document.title} ${document.content}`.toLowerCase();
        
        // Проверяем биграммы
        processedQuery.bigramTokens.forEach(bigram => {
            if (documentText.includes(bigram.join(' '))) {
                bonus += 0.3;
            }
        });

        // Проверяем триграммы (больший бонус)
        processedQuery.trigramTokens.forEach(trigram => {
            if (documentText.includes(trigram.join(' '))) {
                bonus += 0.5;
            }
        });

        return Math.min(bonus, 2.0); // ограничиваем максимальный бонус
    }

    applyAdvancedContextBoost(results, context) {
        const { recentEntities, currentTopic, emotionalContext } = context;

        results.forEach(result => {
            let contextBoost = 0;
            
            // Бонус за недавние сущности
            if (recentEntities) {
                recentEntities.forEach(entity => {
                    const docText = `${result.document.title} ${result.document.aliases.join(' ')} ${result.document.content}`;
                    
                    if (docText.toLowerCase().includes(entity.name.toLowerCase())) {
                        // Учитываем частоту упоминаний и свежесть
                        const frequencyBonus = (entity.frequency || 1) * 0.1;
                        const recencyBonus = this.calculateRecencyBonus(entity.lastMention || 0);
                        contextBoost += frequencyBonus + recencyBonus;
                    }
                });
            }

            // Особый бонус для текущей темы
            if (currentTopic && result.document.title === currentTopic) {
                contextBoost += 0.4;
            }

            // Эмоциональный контекст
            if (emotionalContext && emotionalContext.currentState === 'confused') {
                // Для запутанных пользователей повышаем простые, короткие ответы
                if (result.document.content.length < 500) {
                    contextBoost += 0.2;
                }
            }

            result.score += contextBoost;
            result.contextBoost = contextBoost;
        });
    }

    finalRanking(results, processedQuery, context) {
        // Применяем дополнительные факторы ранжирования
        results.forEach(result => {
            // Бонус за качество контента
            const qualityBonus = this.calculateContentQualityScore(result.document);
            
            // Штраф за слишком длинные документы (может быть нерелевантным)
            const lengthPenalty = result.document.content.length > 2000 ? -0.1 : 0;
            
            // Бонус за полноту информации
            const completenessBonus = this.calculateCompletenessScore(result.document, processedQuery);
            
            result.score += qualityBonus + lengthPenalty + completenessBonus;
            
            // Нормализуем итоговый счет
            result.score = Math.max(0, Math.min(result.score, 10.0));
        });

        return results;
    }

    // Вспомогательные методы

    removeDuplicates(results) {
        const seen = new Set();
        return results.filter(result => {
            const key = result.document.id || result.document.title;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    calculateTF(term, tokens) {
        const count = tokens.filter(token => token === term).length;
        return count / tokens.length;
    }

    calculateIDF(term) {
        const docsWithTerm = this.knowledgeBase.filter(doc => {
            const allText = `${doc.title} ${doc.aliases.join(' ')} ${doc.content} ${doc.tags.join(' ')}`;
            const tokens = this.tokenize(this.normalizeText(allText));
            return tokens.includes(term);
        }).length;

        return Math.log(this.knowledgeBase.length / (docsWithTerm + 1));
    }

    calculateTermFrequency(term, tokens) {
        return tokens.filter(token => token === term).length;
    }

    calculatePositionBonus(fieldText, originalQuery) {
        const fieldLC = fieldText.toLowerCase();
        const queryLC = originalQuery.toLowerCase();
        
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
        if (hoursDiff < 168) return 0.1; // неделя
        
        return 0;
    }

    calculateContentQualityScore(document) {
        let score = 0;
        
        // Бонус за наличие структуры
        if (document.content.includes('\n') || document.content.includes('.')) {
            score += 0.1;
        }
        
        // Бонус за оптимальную длину
        const contentLength = document.content.length;
        if (contentLength >= 100 && contentLength <= 1000) {
            score += 0.15;
        }
        
        // Бонус за наличие тегов
        if (document.tags && document.tags.length > 0) {
            score += 0.1;
        }
        
        // Бонус за алиасы
        if (document.aliases && document.aliases.length > 0) {
            score += 0.05;
        }
        
        return score;
    }

    calculateCompletenessScore(document, processedQuery) {
        // Оценивает, насколько полно документ отвечает на запрос
        const queryTokensInDoc = processedQuery.tokens.filter(token => {
            const docText = `${document.title} ${document.content}`.toLowerCase();
            return this.tokenize(docText).includes(token);
        });
        
        return (queryTokensInDoc.length / processedQuery.tokens.length) * 0.2;
    }

    calculateResultConfidence(result, processedQuery) {
        let confidence = Math.min(result.score / 5.0, 1.0); // нормализуем к [0,1]
        
        // Повышаем уверенность за точные совпадения
        if (result.scoreBreakdown?.exactTitleMatch > 0) {
            confidence = Math.min(confidence + 0.2, 0.98);
        }
        
        // Понижаем за нечеткие совпадения
        if (result.methods?.includes('fuzzy')) {
            confidence *= 0.8;
        }
        
        return Math.max(0.1, confidence);
    }

    normalizeText(text) {
        return text
            .toLowerCase()
            .replace(/[^\wа-яё\s\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    tokenize(text) {
        return text
            .split(/\s+/)
            .filter(word => word.length > 2)
            .filter(word => !this.stopWords.has(word))
            .map(word => this.stemmer.stem(word))
            .filter(word => word.length > 1);
    }

    expandTokens(tokens) {
        const expanded = [...tokens];
        
        tokens.forEach(token => {
            if (this.synonyms.has(token)) {
                expanded.push(...this.synonyms.get(token));
            }
        });

        return [...new Set(expanded)]; // убираем дубликаты
    }

    generateNGrams(tokens, n) {
        const ngrams = [];
        for (let i = 0; i <= tokens.length - n; i++) {
            ngrams.push(tokens.slice(i, i + n));
        }
        return ngrams;
    }

    getDetailedScoreBreakdown(document, processedQuery, options, method) {
        return {
            method: method,
            title: this.calculateFieldScore(document.title, processedQuery, options.boostFactors.title, 'title'),
            aliases: document.aliases.reduce((sum, alias) => sum + this.calculateFieldScore(alias, processedQuery, options.boostFactors.aliases, 'alias'), 0),
            content: this.calculateFieldScore(document.content, processedQuery, options.boostFactors.content, 'content'),
            tags: document.tags.reduce((sum, tag) => sum + this.calculateFieldScore(tag, processedQuery, options.boostFactors.tags, 'tag'), 0),
            phraseMatch: this.calculatePhraseMatchBonus(document, processedQuery)
        };
    }

    loadSynonyms() {
        const synonyms = new Map([
            // Расширенный словарь синонимов
            ['компания', ['фирма', 'организация', 'предприятие', 'бизнес', 'корпорация']],
            ['сервис', ['служба', 'услуга', 'обслуживание']],
            ['система', ['механизм', 'комплекс', 'структура', 'схема']],
            ['процесс', ['процедура', 'операция', 'ход', 'течение']],
            ['пользователь', ['клиент', 'юзер', 'потребитель', 'заказчик']],
            ['технология', ['техника', 'метод', 'способ', 'подход']],
            ['программа', ['приложение', 'софт', 'ПО', 'утилита']],
            ['интерфейс', ['оболочка', 'среда', 'панель']],
            ['данные', ['информация', 'сведения', 'материалы']],
            ['безопасность', ['защита', 'секьюрити', 'охрана']],
            ['решение', ['способ', 'метод', 'вариант', 'подход']],
            ['проблема', ['трудность', 'вопрос', 'задача', 'сложность']],
            ['функция', ['возможность', 'опция', 'характеристика']],
            ['настройка', ['конфигурация', 'параметр', 'установка']],
            ['ошибка', ['сбой', 'баг', 'неисправность', 'проблема']],
            ['версия', ['вариант', 'редакция', 'релиз']],
            ['документ', ['файл', 'бумага', 'материал']],
            ['отчет', ['доклад', 'сводка', 'сообщение']],
            ['анализ', ['разбор', 'исследование', 'изучение']],
            ['результат', ['итог', 'вывод', 'следствие']],
            ['поиск', ['розыск', 'поиски', 'нахождение']],
            ['работа', ['деятельность', 'труд', 'функционирование']],
            ['управление', ['контроль', 'руководство', 'регулирование']],
            ['развитие', ['рост', 'прогресс', 'эволюция']],
            ['изменение', ['модификация', 'корректировка', 'правка']]
        ]);

        return synonyms;
    }

    applyHallucinationGuard(results, processedQuery, options) {
        const minScore = options.hallucinationMinScore || 1.2;
        const minCoverage = options.hallucinationMinCoverage || 0.35;

        const uniqueQueryTokens = [...new Set(processedQuery.tokens)];

        return results.filter(result => {
            if (!result?.document) return false;
            if (result.score < minScore) return false;

            const docText = `${result.document.title} ${result.document.aliases.join(' ')} ${result.document.content} ${result.document.tags.join(' ')}`;
            const docTokens = new Set(this.tokenize(this.normalizeText(docText)));

            const matchedTokens = uniqueQueryTokens.filter(token => docTokens.has(token));
            const coverage = matchedTokens.length / Math.max(uniqueQueryTokens.length, 1);

            // Дополнительный сигнал: хотя бы одна биграмма/триграмма встречается дословно
            const phraseHit =
                processedQuery.bigramTokens.some(ngram => docText.toLowerCase().includes(ngram.join(' '))) ||
                processedQuery.trigramTokens.some(ngram => docText.toLowerCase().includes(ngram.join(' ')));

            const passesGuard = coverage >= minCoverage || phraseHit;

            if (!passesGuard) {
                result.searchMetadata = {
                    ...(result.searchMetadata || {}),
                    filteredBy: 'hallucination_guard',
                    coverage
                };
            }

            return passesGuard;
        });
    }
}

class RussianStemmer {
    stem(word) {
        const endings = [
            // Прилагательные
            'ными', 'овой', 'евой', 'ской', 'цкой', 'ицкой',
            'ами', 'ах', 'ем', 'ов', 'ам', 'ми', 'ой', 'ем', 
            'ых', 'ие', 'ая', 'ое', 'ые', 'ий', 'ый', 'ая',
            // Существительные
            'ами', 'ах', 'ов', 'ей', 'ям', 'ями', 'ях',
            'ость', 'ение', 'ание', 'ство', 'ция', 'сия',
            // Глаголы
            'ать', 'еть', 'ить', 'оть', 'уть', 'ють', 'ишь', 'ешь',
            'ала', 'ила', 'ела', 'ула', 'ыла',
            // Простые окончания
            'ы', 'и', 'а', 'е', 'о', 'у', 'я', 'ь', 'й'
        ];

        let stemmed = word.toLowerCase();

        for (let ending of endings) {
            if (stemmed.endsWith(ending) && stemmed.length > ending.length + 2) {
                stemmed = stemmed.slice(0, -ending.length);
                break; // берем только первое подходящее окончание
            }
        }

        return stemmed;
    }
}

class FuzzyMatcher {
    similarity(str1, str2) {
        if (!str1 || !str2) return 0;
        if (str1 === str2) return 1;
        
        return this.levenshteinSimilarity(str1, str2);
    }

    levenshteinSimilarity(str1, str2) {
        const distance = this.levenshteinDistance(str1, str2);
        const maxLength = Math.max(str1.length, str2.length);
        
        if (maxLength === 0) return 1;
        return 1 - (distance / maxLength);
    }

    levenshteinDistance(str1, str2) {
        const matrix = Array(str2.length + 1).fill().map(() => Array(str1.length + 1).fill());

        for (let i = 0; i <= str1.length; i++) {
            matrix[0][i] = i;
        }

        for (let j = 0; j <= str2.length; j++) {
            matrix[j][0] = j;
        }

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + cost
                );
            }
        }

        return matrix[str2.length][str1.length];
    }

    phraseSimilarity(phrase1, phrase2) {
        const words1 = phrase1.toLowerCase().split(/\s+/);
        const words2 = phrase2.toLowerCase().split(/\s+/);
        
        let totalSimilarity = 0;
        let matches = 0;

        words1.forEach(word1 => {
            let bestMatch = 0;
            words2.forEach(word2 => {
                const sim = this.similarity(word1, word2);
                bestMatch = Math.max(bestMatch, sim);
            });
            
            if (bestMatch > 0.7) {
                totalSimilarity += bestMatch;
                matches++;
            }
        });

        return matches > 0 ? totalSimilarity / words1.length : 0;
    }
}

class SemanticAnalyzer {
    constructor({ embeddingRuntime } = {}) {
        this.embeddingRuntime = embeddingRuntime;
    }

    calculateSimilarity(text1, text2) {
        // Упрощенный семантический анализ на основе пересечения концептов
        const concepts1 = this.extractConcepts(text1);
        const concepts2 = this.extractConcepts(text2);
        
        const intersection = concepts1.filter(c => concepts2.includes(c));
        const union = [...new Set([...concepts1, ...concepts2])];
        
        return union.length > 0 ? intersection.length / union.length : 0;
    }

    extractConcepts(text) {
        // Извлекаем ключевые концепты из текста
        const conceptualWords = text.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 4)
            .filter(word => !this.isCommonWord(word))
            .slice(0, 10); // топ-10 концептов

        return conceptualWords;
    }

    isCommonWord(word) {
        const commonWords = new Set([
            'который', 'которая', 'которое', 'является', 'может', 'должен',
            'необходимо', 'возможно', 'например', 'также', 'кроме', 'более'
        ]);
        
        return commonWords.has(word);
    }
}

module.exports = { SemanticSearchEngine, RussianStemmer };