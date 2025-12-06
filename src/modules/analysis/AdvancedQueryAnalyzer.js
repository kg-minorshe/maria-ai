const { AmbiguityResolver } = require("../clarification/AmbiguityResolver");

class AdvancedQueryAnalyzer {
  constructor() {
    this.questionWords = [
      "что",
      "как",
      "где",
      "когда",
      "почему",
      "зачем",
      "какой",
      "какая",
      "какое",
      "какие",
      "сколько",
      "кто",
      "чей",
      "чья",
      "чьё",
      "откуда",
      "куда",
      "отчего",
    ];

    this.conjunctions = [
      "и",
      "а",
      "но",
      "или",
      "либо",
      "также",
      "ещё",
      "тоже",
      "при этом",
      "кроме того",
      "помимо",
      "вдобавок",
      "дополнительно",
    ];

    this.relationWords = [
      "связан",
      "связана",
      "связано",
      "относится",
      "принадлежит",
      "входит",
      "является",
      "представляет",
      "включает",
      "содержит",
      "состоит",
    ];

    this.ambiguityResolver = new AmbiguityResolver();
    this.sentimentAnalyzer = new SentimentAnalyzer();
    this.complexityClassifier = new ComplexityClassifier();
  }

  analyzeComplexQuery(message, context = {}) {
    const startTime = Date.now();

    const analysis = {
      originalMessage: message,
      normalizedMessage: this.normalizeMessage(message),
      isComplex: false,
      complexity: "simple",
      subqueries: [],
      queryTypes: [],
      entities: [],
      relations: [],
      intent: null,
      confidence: 0,
      sentiment: "neutral",
      ambiguity: null,
      temporalContext: null,
      spatialContext: null,
      processingTime: 0,
    };

    try {
      // 1. Нормализация и исправление опечаток
      analysis.normalizedMessage = this.normalizeAndCorrect(message);

      // 2. Анализ сентимента
      analysis.sentiment = this.sentimentAnalyzer.analyze(message);

      // 3. Определение сложности запроса
      analysis.complexity = this.complexityClassifier.classify(
        analysis.normalizedMessage
      );
      analysis.isComplex = analysis.complexity !== "simple";

      // 4. Разбиение на подзапросы
      analysis.subqueries = this.smartSplitIntoSubqueries(
        analysis.normalizedMessage,
        context
      );

      // 5. Извлечение сущностей с улучшенным алгоритмом
      analysis.entities = this.extractEntitiesAdvanced(
        analysis.normalizedMessage,
        context
      );

      // 6. Анализ отношений между сущностями
      analysis.relations = this.analyzeRelations(
        analysis.normalizedMessage,
        analysis.entities,
        context
      );

      // 7. Определение основного интента
      analysis.intent = this.identifyPrimaryIntent(
        analysis.normalizedMessage,
        analysis.subqueries
      );

      // 8. Классификация типов подзапросов
      analysis.queryTypes = analysis.subqueries.map((sq) =>
        this.classifyQueryTypeAdvanced(sq.query, sq.context)
      );

      // 9. Проверка на неоднозначность
      analysis.ambiguity = this.ambiguityResolver.detectAmbiguity(
        analysis.normalizedMessage,
        analysis.entities
      );

      // 10. Извлечение временного и пространственного контекста
      analysis.temporalContext = this.extractTemporalContext(
        analysis.normalizedMessage
      );
      analysis.spatialContext = this.extractSpatialContext(
        analysis.normalizedMessage
      );

      // 11. Расчет финальной уверенности
      analysis.confidence = this.calculateAdvancedConfidence(analysis, context);

      analysis.processingTime = Date.now() - startTime;
    } catch (error) {
      console.error("Ошибка в анализе запроса:", error);
      analysis.confidence = 0.2;
    }

    return analysis;
  }

  normalizeAndCorrect(message) {
    let normalized = message;

    // Исправляем распространенные опечатки
    const corrections = {
      "что то": "что-то",
      "как то": "как-то",
      "где то": "где-то",
      "когда то": "когда-то",
      "что нибудь": "что-нибудь",
      "как нибудь": "как-нибудь",
      "что либо": "что-либо",
      "где либо": "где-либо",
    };

    for (const [wrong, correct] of Object.entries(corrections)) {
      const regex = new RegExp(`\\b${wrong}\\b`, "gi");
      normalized = normalized.replace(regex, correct);
    }

    // Нормализуем пунктуацию
    normalized = normalized
      .replace(/\s*([.!?])\s*/g, "$1 ")
      .replace(/\s*([,;:])\s*/g, "$1 ")
      .replace(/\s+/g, " ")
      .trim();

    // Добавляем вопросительный знак если это явно вопрос
    if (!normalized.match(/[.!?]$/) && this.isQuestion(normalized)) {
      normalized += "?";
    }

    return normalized;
  }

  normalizeMessage(message) {
    return message
      .toLowerCase()
      .replace(/[^\wа-яё\s\-.,!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  smartSplitIntoSubqueries(message, context) {
    const subqueries = [];

    // Улучшенные паттерны для разделения
    const splitPatterns = [
      // Явные разделители вопросов
      /\?\s*(?:и|а|также|ещё|тоже|кроме того)\s+(?=\w)/gi,
      /\?\s*(?:а что|а как|а где|а когда)\s+/gi,

      // Разделители утверждений
      /\.\s*(?:и|а|также|кроме того|помимо этого)\s+(?=\w)/gi,
      /\.\s*(?:ещё|тоже|дополнительно)\s+(?=\w)/gi,

      // Точка с запятой
      /;\s*(?=\w)/gi,

      // Составные вопросы
      /\s+(?:и что|а что|и как|а как|и где|а где)\s+/gi,
    ];

    let currentText = message;
    let foundSplits = false;

    for (const pattern of splitPatterns) {
      const matches = [...currentText.matchAll(pattern)];
      if (matches.length > 0) {
        const parts = currentText.split(pattern);
        if (parts.length > 1) {
          currentText = parts;
          foundSplits = true;
          break;
        }
      }
    }

    if (!foundSplits) {
      // Если не нашли явных разделителей, ищем семантические границы
      currentText = this.findSemanticBoundaries(message);
    }

    // Нормализуем и обрабатываем каждую часть
    const textParts = Array.isArray(currentText) ? currentText : [currentText];

    textParts.forEach((part, index) => {
      const cleanPart = this.cleanSubquery(part);
      if (cleanPart.length > 8) {
        // минимальная длина подзапроса
        subqueries.push({
          query: cleanPart,
          index: index,
          context: this.buildSubqueryContext(cleanPart, context, index),
          type: this.classifyQueryTypeAdvanced(cleanPart),
          entities: this.extractQuickEntities(cleanPart),
        });
      }
    });

    return subqueries.length > 0
      ? subqueries
      : [
          {
            query: message,
            index: 0,
            context: context,
            type: this.classifyQueryTypeAdvanced(message),
            entities: [],
          },
        ];
  }

  findSemanticBoundaries(message) {
    // Ищем семантические границы по ключевым фразам
    const boundaryIndicators = [
      /\b(?:кроме того|помимо этого|также|ещё|тоже)\b/gi,
      /\b(?:с другой стороны|в то же время|однако)\b/gi,
      /\b(?:во-первых|во-вторых|в-третьих|далее|затем)\b/gi,
    ];

    for (const indicator of boundaryIndicators) {
      const matches = [...message.matchAll(indicator)];
      if (matches.length > 0) {
        return message.split(indicator);
      }
    }

    return [message];
  }

  cleanSubquery(subquery) {
    let cleaned = subquery.trim();

    // Убираем лишние союзы в начале
    cleaned = cleaned.replace(/^(?:и|а|но|также|ещё|тоже|кроме того)\s+/i, "");

    // Убираем незаконченные предложения
    if (cleaned.length < 5) return "";

    // Нормализуем окончание
    if (!cleaned.match(/[.?!]$/)) {
      if (this.isQuestion(cleaned)) {
        cleaned += "?";
      } else {
        cleaned += ".";
      }
    }

    return cleaned;
  }

  extractEntitiesAdvanced(message, context) {
    const entities = [];
    const messageLC = message.toLowerCase();

    // 1. Извлекаем из базы знаний
    if (global.knowledgeBase) {
      global.knowledgeBase.forEach((item) => {
        const title = item.title.toLowerCase();

        // Точное совпадение
        if (messageLC.includes(title)) {
          entities.push(
            this.createEntityInfo(item, title, messageLC, "exact_match")
          );
        }

        // Частичное совпадение
        const titleWords = title.split(/\s+/);
        if (titleWords.length > 1) {
          const partialMatch = titleWords.some(
            (word) => word.length > 3 && messageLC.includes(word)
          );
          if (partialMatch && !entities.find((e) => e.name === item.title)) {
            entities.push(
              this.createEntityInfo(item, title, messageLC, "partial_match")
            );
          }
        }

        // Алиасы
        item.aliases.forEach((alias) => {
          const aliasLC = alias.toLowerCase();
          if (
            messageLC.includes(aliasLC) &&
            !entities.find((e) => e.name === item.title)
          ) {
            entities.push(
              this.createEntityInfo(item, aliasLC, messageLC, "alias_match")
            );
          }
        });
      });
    }

    // 2. Извлекаем из контекста
    if (context.recentEntities) {
      context.recentEntities.forEach((entity) => {
        if (
          messageLC.includes(entity.name.toLowerCase()) &&
          !entities.find((e) => e.name === entity.name)
        ) {
          entities.push({
            ...entity,
            type: "context_entity",
            confidence: Math.min(entity.confidence * 0.8, 0.9),
            matchType: "context",
          });
        }
      });
    }

    // 3. Ищем именованные сущности
    const namedEntities = this.extractNamedEntities(message);
    entities.push(...namedEntities);

    // 4. Сортируем по важности и уверенности
    return this.rankEntities(entities);
  }

  createEntityInfo(item, matchedText, messageLC, matchType) {
    const position = messageLC.indexOf(matchedText);
    let confidence = 0.5;

    switch (matchType) {
      case "exact_match":
        confidence = 0.95;
        break;
      case "alias_match":
        confidence = 0.85;
        break;
      case "partial_match":
        confidence = 0.65;
        break;
    }

    // Дополнительные факторы уверенности
    if (matchedText.length > 10) confidence += 0.05;
    if (position < messageLC.length / 3) confidence += 0.05; // в начале сообщения

    return {
      name: item.title,
      originalMention: matchedText,
      type: "knowledge_entity",
      aliases: item.aliases,
      tags: item.tags,
      position: position,
      confidence: Math.min(confidence, 0.98),
      matchType: matchType,
      contextRelevance: this.calculateContextRelevance(item, messageLC),
    };
  }

  extractNamedEntities(message) {
    const entities = [];

    // Простые паттерны для извлечения именованных сущностей
    const patterns = {
      dates: /\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b/g,
      numbers:
        /\b\d+(?:[.,]\d+)?\s*(?:штук|процент|рубл|доллар|евро|метр|килограмм|литр)\b/g,
      emails: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phones:
        /\b(?:\+7|8)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}\b/g,
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      const matches = [...message.matchAll(pattern)];
      matches.forEach((match) => {
        entities.push({
          name: match[0],
          type: type,
          position: match.index,
          confidence: 0.9,
          matchType: "pattern",
        });
      });
    }

    return entities;
  }

  analyzeRelations(message, entities, context) {
    const relations = [];
    const messageLC = message.toLowerCase();

    // 1. Явные отношения через relation words
    this.relationWords.forEach((relationWord) => {
      if (messageLC.includes(relationWord)) {
        const relatedEntities = this.findEntitiesNearRelation(
          messageLC,
          relationWord,
          entities
        );
        if (relatedEntities.length >= 2) {
          relations.push({
            type: "explicit",
            relation: relationWord,
            entities: relatedEntities.slice(0, 2),
            confidence: 0.85,
            position: messageLC.indexOf(relationWord),
          });
        }
      }
    });

    // 2. Пространственная близость
    for (let i = 0; i < entities.length - 1; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entity1 = entities[i];
        const entity2 = entities[j];
        const distance = Math.abs(entity1.position - entity2.position);

        if (distance < 100) {
          // символы близко друг к другу
          const relation = this.inferRelationType(entity1, entity2, messageLC);
          relations.push({
            type: "proximity",
            entities: [entity1, entity2],
            distance: distance,
            confidence: Math.max(0.3, 0.8 - distance * 0.005),
            inferredRelation: relation,
          });
        }
      }
    }

    // 3. Контекстуальные связи
    if (context.currentTopic) {
      entities.forEach((entity) => {
        if (entity.name !== context.currentTopic) {
          relations.push({
            type: "contextual",
            entities: [{ name: context.currentTopic, type: "topic" }, entity],
            confidence: 0.4,
            relation: "topic_entity",
          });
        }
      });
    }

    return this.rankRelations(relations);
  }

  findEntitiesNearRelation(messageLC, relationWord, entities) {
    const relationPos = messageLC.indexOf(relationWord);
    const windowSize = 80; // символов до и после

    return entities
      .filter((entity) => {
        const distance = Math.abs(entity.position - relationPos);
        return distance < windowSize;
      })
      .sort((a, b) => {
        const distA = Math.abs(a.position - relationPos);
        const distB = Math.abs(b.position - relationPos);
        return distA - distB;
      });
  }

  identifyPrimaryIntent(message, subqueries) {
    const intents = {
      definition: {
        patterns: [
          /что такое/i,
          /что означает/i,
          /определение/i,
          /что это/i,
          /расскажи о/i,
        ],
        weight: 0.9,
      },
      comparison: {
        patterns: [
          /различие/i,
          /отличие/i,
          /сравни/i,
          /чем отличается/i,
          /разница/i,
          /vs/i,
          /против/i,
        ],
        weight: 0.85,
      },
      process: {
        patterns: [
          /как происходит/i,
          /как работает/i,
          /процесс/i,
          /алгоритм/i,
          /как сделать/i,
          /как получить/i,
        ],
        weight: 0.8,
      },
      location: {
        patterns: [
          /где находится/i,
          /где расположен/i,
          /местонахождение/i,
          /адрес/i,
        ],
        weight: 0.8,
      },
      time: {
        patterns: [/когда/i, /время/i, /дата/i, /срок/i, /период/i],
        weight: 0.75,
      },
      reason: {
        patterns: [/почему/i, /зачем/i, /причина/i, /из-за чего/i, /отчего/i],
        weight: 0.75,
      },
      list: {
        patterns: [
          /список/i,
          /перечисли/i,
          /какие/i,
          /виды/i,
          /типы/i,
          /варианты/i,
        ],
        weight: 0.7,
      },
      instruction: {
        patterns: [
          /как/i,
          /инструкция/i,
          /руководство/i,
          /пошагово/i,
          /этапы/i,
        ],
        weight: 0.7,
      },
      confirmation: {
        patterns: [/правда ли/i, /верно ли/i, /так ли/i, /действительно ли/i],
        weight: 0.65,
      },
    };

    let maxScore = 0;
    let primaryIntent = "general";

    // Анализируем основное сообщение
    for (const [intent, config] of Object.entries(intents)) {
      const score = config.patterns.reduce((acc, pattern) => {
        return acc + (pattern.test(message) ? config.weight : 0);
      }, 0);

      if (score > maxScore) {
        maxScore = score;
        primaryIntent = intent;
      }
    }

    // Дополнительный анализ подзапросов
    if (subqueries.length > 1) {
      const subIntents = subqueries.map((sq) => {
        for (const [intent, config] of Object.entries(intents)) {
          if (config.patterns.some((p) => p.test(sq.query))) {
            return intent;
          }
        }
        return "general";
      });

      // Если есть микс интентов, это может быть сравнение
      const uniqueIntents = [...new Set(subIntents)];
      if (uniqueIntents.length > 1 && uniqueIntents.includes("definition")) {
        primaryIntent = "comparison";
        maxScore = 0.8;
      }
    }

    return { intent: primaryIntent, confidence: Math.min(maxScore, 1.0) };
  }

  classifyQueryTypeAdvanced(query, context = {}) {
    const types = [];
    const queryLC = query.toLowerCase();

    // Вопросительные слова
    const questionMap = {
      что: ["definition", "explanation"],
      как: ["process", "instruction"],
      где: ["location", "place"],
      когда: ["time", "temporal"],
      почему: ["reason", "cause"],
      зачем: ["purpose", "goal"],
      сколько: ["quantity", "amount"],
      какой: ["description", "property"],
      кто: ["person", "agent"],
    };

    // Проверяем вопросительные слова
    for (const [word, wordTypes] of Object.entries(questionMap)) {
      if (queryLC.includes(word)) {
        types.push(...wordTypes);
      }
    }

    // Дополнительная классификация
    if (queryLC.includes("сравни") || queryLC.includes("отличие")) {
      types.push("comparison");
    }

    if (queryLC.includes("список") || queryLC.includes("перечисли")) {
      types.push("enumeration");
    }

    if (queryLC.match(/\?$/)) {
      types.push("question");
    } else {
      types.push("statement");
    }

    return types.length > 0 ? [...new Set(types)] : ["general"];
  }

  calculateAdvancedConfidence(analysis, context) {
    let confidence = 0.4; // базовая уверенность

    // Факторы повышения уверенности
    if (analysis.entities.length > 0) {
      const avgEntityConfidence =
        analysis.entities.reduce((sum, e) => sum + e.confidence, 0) /
        analysis.entities.length;
      confidence += avgEntityConfidence * 0.3;
    }

    if (analysis.relations.length > 0) {
      confidence += Math.min(analysis.relations.length * 0.1, 0.2);
    }

    if (analysis.intent.confidence > 0.7) {
      confidence += 0.15;
    }

    if (analysis.normalizedMessage !== analysis.originalMessage) {
      confidence += 0.05; // бонус за нормализацию
    }

    // Штрафы
    if (analysis.ambiguity && analysis.ambiguity.isAmbiguous) {
      confidence -= 0.2;
    }

    if (analysis.complexity === "high") {
      confidence -= 0.1;
    }

    // Контекстуальный бонус
    if (
      context.currentTopic &&
      analysis.entities.some((e) => e.name === context.currentTopic)
    ) {
      confidence += 0.1;
    }

    return Math.max(0.1, Math.min(confidence, 0.98));
  }

  // Вспомогательные методы

  isQuestion(text) {
    return (
      this.questionWords.some((qw) => text.toLowerCase().includes(qw)) ||
      text.includes("?")
    );
  }

  calculateContextRelevance(item, messageLC) {
    let relevance = 0;

    // Проверяем теги
    if (item.tags) {
      item.tags.forEach((tag) => {
        if (messageLC.includes(tag.toLowerCase())) {
          relevance += 0.1;
        }
      });
    }

    return Math.min(relevance, 0.5);
  }

  rankEntities(entities) {
    return entities
      .sort((a, b) => {
        const scoreA = a.confidence + (a.contextRelevance || 0);
        const scoreB = b.confidence + (b.contextRelevance || 0);
        return scoreB - scoreA;
      })
      .slice(0, 15); // топ-15 сущностей
  }

  rankRelations(relations) {
    return relations.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  }

  buildSubqueryContext(subquery, originalContext, index) {
    return {
      ...originalContext,
      subqueryIndex: index,
      isSubquery: true,
      parentQuery:
        originalContext.originalMessage || originalContext.resolvedMessage,
    };
  }

  extractQuickEntities(text) {
    // Быстрое извлечение сущностей для подзапросов
    const entities = [];
    const textLC = text.toLowerCase();

    if (global.knowledgeBase) {
      global.knowledgeBase.slice(0, 100).forEach((item) => {
        if (textLC.includes(item.title.toLowerCase())) {
          entities.push({
            name: item.title,
            type: "knowledge_entity",
            confidence: 0.8,
          });
        }
      });
    }

    return entities.slice(0, 5);
  }

  extractTemporalContext(message) {
    const temporalPatterns = [
      /\b(?:сегодня|вчера|завтра|сейчас|теперь|недавно|скоро)\b/gi,
      /\b(?:в прошлом|в будущем|в настоящем|до|после|во время)\b/gi,
      /\b\d{4}\s*год/gi,
      /\b(?:январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)\b/gi,
    ];

    const matches = [];
    temporalPatterns.forEach((pattern) => {
      const found = [...message.matchAll(pattern)];
      matches.push(...found.map((m) => m[0]));
    });

    return matches.length > 0
      ? {
          hasTemporalContext: true,
          indicators: matches,
          type: this.classifyTemporalType(matches),
        }
      : null;
  }

  extractSpatialContext(message) {
    const spatialPatterns = [
      /\b(?:здесь|там|тут|везде|нигде|дома|на работе)\b/gi,
      /\b(?:в|на|под|над|рядом с|около|возле|недалеко от)\s+\w+/gi,
      /\b(?:север|юг|восток|запад|центр)\b/gi,
    ];

    const matches = [];
    spatialPatterns.forEach((pattern) => {
      const found = [...message.matchAll(pattern)];
      matches.push(...found.map((m) => m[0]));
    });

    return matches.length > 0
      ? {
          hasSpatialContext: true,
          indicators: matches,
        }
      : null;
  }

  classifyTemporalType(indicators) {
    const past = ["вчера", "недавно", "в прошлом", "до"];
    const present = ["сегодня", "сейчас", "теперь", "в настоящем"];
    const future = ["завтра", "скоро", "в будущем", "после"];

    const pastScore = indicators.filter((i) =>
      past.some((p) => i.includes(p))
    ).length;
    const presentScore = indicators.filter((i) =>
      present.some((p) => i.includes(p))
    ).length;
    const futureScore = indicators.filter((i) =>
      future.some((p) => i.includes(p))
    ).length;

    if (pastScore > presentScore && pastScore > futureScore) return "past";
    if (futureScore > presentScore && futureScore > pastScore) return "future";
    return "present";
  }

  inferRelationType(entity1, entity2, messageLC) {
    // Простая логика определения типа отношения
    if (
      entity1.type === "knowledge_entity" &&
      entity2.type === "knowledge_entity"
    ) {
      return "conceptual_relation";
    }
    if (messageLC.includes("част") && messageLC.includes("цело")) {
      return "part_whole";
    }
    if (messageLC.includes("причин") || messageLC.includes("следств")) {
      return "cause_effect";
    }
    return "generic_relation";
  }
}

class SentimentAnalyzer {
  constructor() {
    this.positiveWords = [
      "хорош",
      "отличн",
      "класс",
      "супер",
      "здорово",
      "круто",
      "замечательн",
      "прекрасн",
      "великолепн",
      "спасибо",
      "благодар",
    ];

    this.negativeWords = [
      "плох",
      "ужас",
      "отврат",
      "глуп",
      "тупо",
      "дура",
      "идиот",
      "не работа",
      "не понима",
      "бесполезн",
      "провал",
    ];

    this.neutralWords = ["нормальн", "обычн", "средн", "неплох", "сойдет"];
  }

  analyze(message) {
    const messageLC = message.toLowerCase();
    let positiveScore = 0;
    let negativeScore = 0;
    let neutralScore = 0;

    this.positiveWords.forEach((word) => {
      if (messageLC.includes(word)) positiveScore += 1;
    });

    this.negativeWords.forEach((word) => {
      if (messageLC.includes(word)) negativeScore += 1;
    });

    this.neutralWords.forEach((word) => {
      if (messageLC.includes(word)) neutralScore += 1;
    });

    if (positiveScore > negativeScore && positiveScore > 0) return "positive";
    if (negativeScore > positiveScore && negativeScore > 0) return "negative";
    if (neutralScore > 0) return "neutral";

    // Дополнительные индикаторы
    if (message.includes("!") && positiveScore === 0 && negativeScore === 0) {
      return messageLC.includes("не") ? "negative" : "positive";
    }

    return "neutral";
  }
}

class ComplexityClassifier {
  classify(message) {
    const indicators = {
      simple: 0,
      medium: 0,
      high: 0,
    };

    // Длина сообщения
    if (message.length < 50) indicators.simple += 1;
    else if (message.length < 150) indicators.medium += 1;
    else indicators.high += 1;

    // Количество вопросительных знаков
    const questionMarks = (message.match(/\?/g) || []).length;
    if (questionMarks > 2) indicators.high += 1;
    else if (questionMarks === 2) indicators.medium += 1;
    else indicators.simple += 1;

    // Количество союзов
    const conjunctions = (
      message.match(/\b(?:и|а|но|или|также|кроме того)\b/gi) || []
    ).length;
    if (conjunctions > 3) indicators.high += 1;
    else if (conjunctions > 1) indicators.medium += 1;
    else indicators.simple += 1;

    // Количество запятых (сложность структуры)
    const commas = (message.match(/,/g) || []).length;
    if (commas > 4) indicators.high += 1;
    else if (commas > 2) indicators.medium += 1;
    else indicators.simple += 1;

    // Находим максимальный показатель
    const maxIndicator = Object.entries(indicators).reduce(
      (max, [key, value]) => {
        return value > max.value ? { key, value } : max;
      },
      { key: "simple", value: 0 }
    );

    return maxIndicator.key;
  }
}

module.exports = { AdvancedQueryAnalyzer };
