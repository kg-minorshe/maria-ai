const { LRUCache } = require("lru-cache");
const emojiRegex = require("emoji-regex");
const { clamp, sortBy, sumBy, takeRight, uniqBy, words } = require("lodash");
const { nanoid } = require("nanoid");

class DialogContextManager {
  constructor() {
    this.maxHistoryLength = clamp(
      Number(process.env.MAX_HISTORY_LENGTH) || 25,
      10,
      100
    );
    this.contextTimeout = Number(process.env.CONTEXT_TTL_MS) || 45 * 60 * 1000; // 45 минут
    this.maxSessions = Number(process.env.MAX_SESSION_CONTEXTS) || 2000;
    this.sessions = new LRUCache({
      max: this.maxSessions,
      ttl: this.contextTimeout,
      updateAgeOnGet: true,
      ttlAutopurge: true,
    });
    this.emotionalStates = new Map(); // Отслеживание эмоционального состояния
  }

  getOrCreateSession(sessionId) {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = new SessionContext(sessionId);
    }

    // Обновляем TTL сессии и фиксируем активность, чтобы LRU-буфер не разрастался бесконтрольно
    session.updateActivity();
    this.sessions.set(sessionId, session, { ttl: this.contextTimeout });

    return session;
  }

  addUserMessage(sessionId, message, entities = []) {
    const session = this.getOrCreateSession(sessionId);
    const emotionalState = this.analyzeEmotionalState(message);
    session.addUserMessage(message, entities, emotionalState);
    this.cleanupOldSessions();
  }

  addAssistantResponse(sessionId, response, sources = [], metadata = {}) {
    const session = this.getOrCreateSession(sessionId);
    session.addAssistantResponse(response, sources, metadata);
  }

  resolveReferences(sessionId, message) {
    const session = this.getOrCreateSession(sessionId);
    return session.resolveReferences(message);
  }

  getRelevantContext(sessionId, currentMessage) {
    const session = this.getOrCreateSession(sessionId);
    return session.getRelevantContext(currentMessage);
  }

  analyzeEmotionalState(message) {
    const emojis = message.match(emojiRegex()) || [];
    const emojiScore = sumBy(emojis, (emoji) => {
      if (["😊", "😀", "😃", "🥳", "👍", "🔥"].includes(emoji)) return 2;
      if (["😢", "😭", "😡", "👎", "🤦", "💔"].includes(emoji)) return -2;
      return 0;
    });

    const lexical = words(message.toLowerCase());
    const lexicon = {
      спасибо: 2,
      благодарю: 2,
      отлично: 2,
      хорошо: 1,
      классно: 2,
      понравилось: 2,
      плохо: -2,
      ужасно: -3,
      непонятно: -2,
      сложно: -1,
      "не работает": -3,
      глупо: -2,
      тупо: -2,
      ошибка: -2,
      подскажи: 1,
      помоги: 1,
    };

    const lexicalScore = sumBy(lexical, (word) => lexicon[word] || 0);
    const frictionPenalty =
      /не\s*(ясно|понятно|разобраться|разобрался|работает)/i.test(message)
        ? -2
        : 0;
    const combinedScore = clamp(
      lexicalScore + emojiScore + frictionPenalty,
      -10,
      10
    );

    if (combinedScore >= 3) return "positive";
    if (combinedScore <= -3) return "negative";
    if (/не\s*(ясно|понятно|разобраться|разобрался|работает)/i.test(message)) {
      return "confused";
    }
    return "neutral";
  }

  cleanupOldSessions() {
    const now = Date.now();
    this.sessions.forEach((session, sessionId) => {
      if (now - session.lastActivity > this.contextTimeout) {
        this.sessions.delete(sessionId);
      }
    });
  }
}

class SessionContext {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.history = [];
    this.entities = new Map();
    this.currentTopic = null;
    this.lastActivity = Date.now();
    this.referenceResolver = new ReferenceResolver();
    this.topicTracker = new TopicTracker();
    this.userPreferences = new UserPreferences();
    this.conversationFlow = new ConversationFlow();
    this.emotionalHistory = [];
  }

  addUserMessage(message, entities = [], emotionalState = "neutral") {
    this.lastActivity = Date.now();

    const interaction = {
      type: "user",
      message,
      originalMessage: message,
      timestamp: Date.now(),
      entities: entities,
      emotionalState,
      id: this.generateId(),
    };

    this.history.push(interaction);
    this.emotionalHistory.push({
      state: emotionalState,
      timestamp: Date.now(),
    });

    // Обновляем тему разговора
    this.topicTracker.updateTopic(message, entities);
    this.currentTopic = this.topicTracker.getCurrentTopic();

    this.updateEntities(entities, interaction.id);
    this.conversationFlow.addUserTurn(message, entities);
    this.limitHistory();
  }

  addAssistantResponse(response, sources = [], metadata = {}) {
    this.lastActivity = Date.now();

    const interaction = {
      type: "assistant",
      message: response,
      timestamp: Date.now(),
      sources: sources,
      metadata: metadata,
      id: this.generateId(),
    };

    this.history.push(interaction);
    this.conversationFlow.addAssistantTurn(response, sources);
    this.limitHistory();
  }

  resolveReferences(message) {
    const resolved = this.referenceResolver.resolve(
      message,
      this.getRecentEntities(7),
      this.currentTopic,
      this.history.slice(-5)
    );
    return resolved;
  }

  getRelevantContext(currentMessage) {
    const resolved = this.resolveReferences(currentMessage);
    const recentEmotions = this.emotionalHistory.slice(-3);

    return {
      resolvedMessage: resolved,
      originalMessage: currentMessage,
      currentTopic: this.currentTopic,
      topicHistory: this.topicTracker.getTopicHistory(),
      recentEntities: this.getRecentEntities(8),
      previousInteractions: this.history.slice(-4),
      conversationFlow: this.conversationFlow.getFlowSummary(),
      emotionalContext: {
        currentState:
          recentEmotions[recentEmotions.length - 1]?.state || "neutral",
        history: recentEmotions,
      },
      userPreferences: this.userPreferences.getPreferences(),
      sessionInfo: {
        totalInteractions: this.history.length,
        duration: Date.now() - (this.history[0]?.timestamp || Date.now()),
        sessionAge: Date.now() - this.history[0]?.timestamp,
      },
    };
  }

  updateEntities(entities, interactionId) {
    entities.forEach((entity) => {
      if (!this.entities.has(entity.name)) {
        this.entities.set(entity.name, new EntityContext(entity.name));
      }

      const entityContext = this.entities.get(entity.name);
      entityContext.addMention(interactionId, entity);
    });
  }

  getRecentEntities(limit = 8) {
    const recentInteractions = this.history.slice(-limit);
    const entities = new Map();

    recentInteractions.forEach((interaction) => {
      if (interaction.entities) {
        interaction.entities.forEach((entity) => {
          entities.set(entity.name, {
            ...entity,
            lastMention: interaction.timestamp,
            frequency: (entities.get(entity.name)?.frequency || 0) + 1,
          });
        });
      }
      if (interaction.sources) {
        interaction.sources.forEach((source) => {
          entities.set(source.title, {
            name: source.title,
            type: "topic",
            lastMention: interaction.timestamp,
            frequency: (entities.get(source.title)?.frequency || 0) + 1,
          });
        });
      }
    });

    return Array.from(entities.values())
      .sort((a, b) => {
        // Сортируем по частоте упоминаний и актуальности
        const scoreA =
          a.frequency * 0.7 + (Date.now() - a.lastMention) * -0.0001;
        const scoreB =
          b.frequency * 0.7 + (Date.now() - b.lastMention) * -0.0001;
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  limitHistory() {
    if (this.history.length > this.maxHistoryLength) {
      const important = this.history.filter(
        (h) => h.important || h.emotionalState === "negative"
      );
      const recent = takeRight(this.history, 18);

      // Убираем дубли на готовой библиотеке, чтобы не городить велосипеды
      const deduped = uniqBy([...important, ...recent], "id");
      const sorted = takeRight(
        sortBy(deduped, "timestamp"),
        this.maxHistoryLength
      );
      this.history = sorted;
    }

    // Ограничиваем эмоциональную историю
    if (this.emotionalHistory.length > 20) {
      this.emotionalHistory = this.emotionalHistory.slice(-20);
    }
  }

  generateId() {
    return nanoid();
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }
}

class EntityContext {
  constructor(name) {
    this.name = name;
    this.mentions = [];
    this.attributes = new Map();
    this.relations = new Set();
    this.importance = 0;
  }

  addMention(interactionId, entityData) {
    this.mentions.push({
      interactionId,
      timestamp: Date.now(),
      ...entityData,
    });

    this.importance = this.mentions.length * 0.1;

    if (this.mentions.length > 15) {
      this.mentions = this.mentions.slice(-15);
    }
  }
}

class ReferenceResolver {
  constructor() {
    this.pronounPatterns = {
      он: { type: "masculine", candidates: ["person", "object"] },
      она: { type: "feminine", candidates: ["person", "object"] },
      оно: { type: "neuter", candidates: ["object", "concept"] },
      они: { type: "plural", candidates: ["any"] },
      это: { type: "demonstrative", candidates: ["any"] },
      этот: { type: "demonstrative_m", candidates: ["masculine"] },
      эта: { type: "demonstrative_f", candidates: ["feminine"] },
      то: { type: "demonstrative_distant", candidates: ["any"] },
      та: { type: "demonstrative_f_distant", candidates: ["feminine"] },
      тот: { type: "demonstrative_m_distant", candidates: ["masculine"] },
    };

    this.contextualReferences = {
      выше: "previous_mention",
      ранее: "previous_mention",
      раньше: "previous_mention",
      "до этого": "previous_mention",
      предыдущий: "previous_interaction",
    };
  }

  resolve(message, recentEntities, currentTopic, conversationHistory = []) {
    let resolvedMessage = message;
    const words = message.toLowerCase().split(/\s+/);

    // Разрешаем местоимения
    for (let i = 0; i < words.length; i++) {
      const word = this.cleanWord(words[i]);

      if (this.pronounPatterns[word]) {
        const pattern = this.pronounPatterns[word];
        const candidate = this.findBestCandidate(
          pattern,
          recentEntities,
          currentTopic,
          i,
          words
        );

        if (candidate) {
          const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, "gi");
          resolvedMessage = resolvedMessage.replace(regex, candidate.name);
        }
      }
    }

    // Разрешаем контекстуальные ссылки
    for (const [reference, type] of Object.entries(this.contextualReferences)) {
      if (resolvedMessage.toLowerCase().includes(reference)) {
        const contextualInfo = this.resolveContextualReference(
          type,
          conversationHistory
        );
        if (contextualInfo) {
          resolvedMessage += ` [Контекст: ${contextualInfo}]`;
        }
      }
    }

    return resolvedMessage;
  }

  findBestCandidate(
    pattern,
    recentEntities,
    currentTopic,
    wordIndex,
    allWords
  ) {
    const scoredCandidates = recentEntities
      .filter((entity) => this.matchesPattern(entity, pattern))
      .map((entity) => ({
        ...entity,
        score: this.calculateCandidateScore(
          entity,
          currentTopic,
          wordIndex,
          allWords,
          pattern
        ),
      }))
      .sort((a, b) => b.score - a.score);

    return scoredCandidates[0] || null;
  }

  calculateCandidateScore(entity, currentTopic, wordIndex, allWords, pattern) {
    let score = 0;

    // Бонус за текущую тему
    if (entity.name === currentTopic) score += 0.5;

    // Бонус за частоту упоминаний
    score += (entity.frequency || 1) * 0.1;

    // Бонус за недавность упоминания
    const timeSinceLastMention = Date.now() - (entity.lastMention || 0);
    score += Math.max(0, 0.3 - timeSinceLastMention * 0.0001);

    // Контекстуальный бонус (близость к связанным словам)
    const contextWords = allWords.slice(
      Math.max(0, wordIndex - 3),
      wordIndex + 3
    );
    if (contextWords.some((w) => entity.name.toLowerCase().includes(w))) {
      score += 0.2;
    }

    // Бонус за соответствие грамматического рода
    if (pattern.type.includes("masculine") && this.isMasculine(entity.name))
      score += 0.1;
    if (pattern.type.includes("feminine") && this.isFeminine(entity.name))
      score += 0.1;

    return score;
  }

  matchesPattern(entity, pattern) {
    if (pattern.candidates.includes("any")) return true;

    if (pattern.candidates.includes("person") && entity.type === "person")
      return true;
    if (
      pattern.candidates.includes("object") &&
      ["object", "concept", "topic"].includes(entity.type)
    )
      return true;

    return pattern.candidates.includes(entity.type);
  }

  resolveContextualReference(type, history) {
    switch (type) {
      case "previous_mention":
        if (history.length > 1) {
          const previous = history[history.length - 2];
          return previous.type === "assistant"
            ? `упоминалось в предыдущем ответе`
            : `упоминалось в предыдущем вопросе`;
        }
        break;
      case "previous_interaction":
        return history.length > 0 ? `ссылка на предыдущий обмен` : null;
    }
    return null;
  }

  isMasculine(word) {
    return /[ъьй]$|[^аеиоуыэюя]$/.test(word.toLowerCase());
  }

  isFeminine(word) {
    return /[аяь]$/.test(word.toLowerCase());
  }

  cleanWord(word) {
    return word.replace(/[^\wа-яё]/gi, "").toLowerCase();
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

class TopicTracker {
  constructor() {
    this.topicHistory = [];
    this.currentTopic = null;
    this.topicWeights = new Map();
  }

  updateTopic(message, entities) {
    const messageParts = message.toLowerCase().split(/[.!?]/);
    let dominantTopic = null;
    let maxWeight = 0;

    entities.forEach((entity) => {
      const weight = this.calculateTopicWeight(entity, messageParts);
      this.topicWeights.set(
        entity.name,
        (this.topicWeights.get(entity.name) || 0) + weight
      );

      if (weight > maxWeight) {
        maxWeight = weight;
        dominantTopic = entity.name;
      }
    });

    if (dominantTopic && maxWeight > 0.3) {
      this.setCurrentTopic(dominantTopic);
    }

    this.decayTopicWeights();
  }

  calculateTopicWeight(entity, messageParts) {
    let weight = 0.1; // базовый вес

    messageParts.forEach((part) => {
      if (part.includes(entity.name.toLowerCase())) {
        weight += 0.4;
      }
    });

    if (entity.type === "knowledge_entity") weight += 0.2;
    if (entity.confidence > 0.7) weight += 0.1;

    return weight;
  }

  setCurrentTopic(topic) {
    if (this.currentTopic !== topic) {
      this.topicHistory.push({
        topic: this.currentTopic,
        endTime: Date.now(),
      });

      this.currentTopic = topic;
    }
  }

  getCurrentTopic() {
    return this.currentTopic;
  }

  getTopicHistory() {
    return this.topicHistory.slice(-5);
  }

  decayTopicWeights() {
    for (const [topic, weight] of this.topicWeights.entries()) {
      this.topicWeights.set(topic, weight * 0.95);
      if (weight < 0.05) {
        this.topicWeights.delete(topic);
      }
    }
  }
}

class UserPreferences {
  constructor() {
    this.preferences = {
      detailLevel: "medium", // brief, medium, detailed
      responseStyle: "friendly", // formal, friendly, casual
      preferredSources: [],
      topics: new Map(),
    };
  }

  updatePreferences(interaction) {
    // Анализируем предпочтения пользователя на основе его сообщений
    if (interaction.message.includes("подробн")) {
      this.preferences.detailLevel = "detailed";
    } else if (
      interaction.message.includes("коротк") ||
      interaction.message.includes("кратк")
    ) {
      this.preferences.detailLevel = "brief";
    }
  }

  getPreferences() {
    return this.preferences;
  }
}

class ConversationFlow {
  constructor() {
    this.flow = [];
    this.patterns = new Map();
  }

  addUserTurn(message, entities) {
    this.flow.push({
      type: "user",
      timestamp: Date.now(),
      messageType: this.classifyMessageType(message),
      entities: entities.length,
    });
  }

  addAssistantTurn(response, sources) {
    this.flow.push({
      type: "assistant",
      timestamp: Date.now(),
      hasResponse: response.length > 0,
      sourcesCount: sources.length,
    });
  }

  classifyMessageType(message) {
    if (message.includes("?")) return "question";
    if (/спасибо|благодар/i.test(message)) return "gratitude";
    if (/да|нет|конечно|разумеется/i.test(message)) return "confirmation";
    return "statement";
  }

  getFlowSummary() {
    const recent = this.flow.slice(-6);
    return {
      totalTurns: this.flow.length,
      recentPattern: recent.map((turn) => turn.type).join("-"),
      lastMessageType: recent[recent.length - 1]?.messageType || "unknown",
    };
  }
}

module.exports = {
  DialogContextManager,
  SessionContext,
  EntityContext,
  ReferenceResolver,
};
