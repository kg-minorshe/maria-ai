require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");

// Импорт всех модулей
const {
  DialogContextManager,
} = require("./modules/dialog/DialogContextManager");
const {
  AdvancedQueryAnalyzer,
} = require("./modules/analysis/AdvancedQueryAnalyzer");
const {
  SemanticSearchEngine,
} = require("./modules/search/SemanticSearchEngine");
const { ResponseGenerator } = require("./modules/response/ResponseGenerator");
const {
  AmbiguityResolver,
} = require("./modules/clarification/AmbiguityResolver");
const {
  CognitiveUserModeling,
} = require("./modules/user/CognitiveUserModeling");
const {
  EmotionalIntelligence,
} = require("./modules/emotion/EmotionalIntelligence");
const { ReasoningEngine } = require("./modules/reasoning/ReasoningEngine");
const {
  loadKnowledgeBase: loadKnowledgeBaseService,
  reloadKnowledgeBase: reloadKnowledgeBaseService,
  getKnowledgeBaseCache,
  getKnowledgeBaseStatus,
  resetKnowledgeBaseCache,
  createEmptyKnowledgeBase,
} = require("./services/knowledgeBase");
const { LocalEmbeddingRuntime } = require("./services/localEmbeddingRuntime");
const {
  EnhancedEscalationService,
} = require("./services/enhancedEscalationService");
const { performSystemHealthCheck } = require("./services/systemHealth");
const { normalizeText } = require("./utils/text");
const { logStep, logError } = require("./utils/logger");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, "..");
const isDevelopment = process.env.NODE_ENV === "development";
const isFastDevMode = isDevelopment && process.env.FAST_DEV_MODE === "true";

const devLog = (...args) => {
  if (isDevelopment) {
    console.log("[DEV]", ...args);
  }
};

// Глобальные переменные
let knowledgeBase = [];
let contextManager;
let queryAnalyzer;
let searchEngine;
let responseGenerator;
let ambiguityResolver;
let cognitiveModeling;
let emotionalIntelligence;
let reasoningEngine;
let embeddingRuntime;

// Статистика работы системы
let systemStats = {
  totalQueries: 0,
  successfulResponses: 0,
  escalations: 0,
  averageResponseTime: 0,
  startTime: Date.now(),
};

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(ROOT_DIR, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "maria-enhanced-ai-secret-2024",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000, // 24 часа
      httpOnly: true,
    },
  })
);

// Логирование запросов
app.use((req, res, next) => {
  req.startTime = Date.now();
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip} - Session: ${
      req.session.id || "new"
    }`
  );
  next();
});

app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public/form.html"));
});
// Инициализация системы
async function initializeSystem() {
  console.log("🚀 Инициализация расширенной системы ИИ...");

  try {
    // Загрузка базы знаний
    await loadKnowledgeBase();

    // Инициализация компонентов
    contextManager = new DialogContextManager();
    queryAnalyzer = new AdvancedQueryAnalyzer();
    embeddingRuntime = new LocalEmbeddingRuntime({ knowledgeBase });
    searchEngine = new SemanticSearchEngine(knowledgeBase, {
      embeddingRuntime,
    });
    responseGenerator = new ResponseGenerator();
    ambiguityResolver = new AmbiguityResolver();
    cognitiveModeling = new CognitiveUserModeling();
    emotionalIntelligence = new EmotionalIntelligence();
    reasoningEngine = new ReasoningEngine();

    console.log("✅ Все компоненты системы инициализированы успешно");

    // Проверяем готовность системы
    performSystemHealthCheck({
      knowledgeBase,
      contextManager,
      queryAnalyzer,
      searchEngine,
      responseGenerator,
      ambiguityResolver,
    });
  } catch (error) {
    console.error("❌ Критическая ошибка инициализации:", error);
    process.exit(1);
  }
}

async function loadKnowledgeBase() {
  try {
    const {
      projectKnowledgeBase,
      generalKnowledgeBase,
      russianDataset,
    } = await loadKnowledgeBaseService({ rootDir: ROOT_DIR });

    knowledgeBase = getKnowledgeBaseCache();
    global.knowledgeBase = knowledgeBase;

    console.log(
      `📚 База знаний загружена: ${knowledgeBase.length} статей (проект: ${projectKnowledgeBase.length}, общие темы: ${generalKnowledgeBase.length}, русский датасет: ${russianDataset.length})`
    );
    console.log(`ℹ️  Статус кэша базы знаний: ${getKnowledgeBaseStatus()}`);
  } catch (error) {
    console.error("❌ Ошибка загрузки базы знаний:", error.message);
    resetKnowledgeBaseCache();
    knowledgeBase = createEmptyKnowledgeBase();
  }
}

console.log("✅ Система прошла проверку готовности");

// Расширенная система эскалации с более гибким распознаванием
app.post("/api/chat/query", async (req, res) => {
  const processingStart = Date.now();
  const performanceTrace = [];
  const trackStep = (name, duration) =>
    performanceTrace.push({ name, duration });
  logStep("request:received", { path: req.path, method: req.method });
  try {
    const { message } = req.body;
    devLog("Запрос получен", { message });
    logStep("request:payload", { messageLength: message?.length });

    systemStats.totalQueries++;

    // Валидация входных данных
    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return res.status(400).json({
        error: "Некорректное сообщение",
        message: 'Пожалуйста, отправьте текстовое сообщение в поле "message"',
        hint: "Сообщение должно содержать от 1 до 1000 символов",
      });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        error: "Сообщение слишком длинное",
        message: "Максимальная длина сообщения: 1000 символов",
        currentLength: message.length,
      });
    }

    devLog("Валидация пройдена", { length: message.length });

    // Получаем или создаем сессию
    const sessionId =
      req.session.id ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
    req.session.id = sessionId;
    devLog("Сессия активна", { sessionId });

    // Получаем историю сообщений для анализа эмоционального состояния
    const contextStart = Date.now();
    const dialogContext = contextManager.getRelevantContext(sessionId, message);
    const messageHistory =
      dialogContext.recentMessages?.map((m) => m.content) || [];
    devLog("Контекст получен", {
      recentMessages: messageHistory.length,
      currentTopic: dialogContext.currentTopic,
    });
    logStep("context:retrieved", {
      durationMs: Date.now() - contextStart,
      recentMessages: messageHistory.length,
      currentTopic: dialogContext.currentTopic,
    });
    trackStep("context:retrieved", Date.now() - contextStart);

    // Анализируем эмоциональное состояние
    const emotionalAnalysisStart = Date.now();
    const emotionalAnalysis = EnhancedEscalationService.analyzeEmotionalState(
      message,
      messageHistory
    );
    devLog("Эмоциональный анализ выполнен", emotionalAnalysis);
    logStep("emotion:analyzed", {
      durationMs: Date.now() - emotionalAnalysisStart,
      dominant: emotionalAnalysis.primaryEmotion,
    });
    trackStep("emotion:analyzed", Date.now() - emotionalAnalysisStart);

    // Проверка на эскалацию
    if (
      EnhancedEscalationService.isEscalationRequest(message) ||
      emotionalAnalysis.shouldEscalate
    ) {
      const escalationReason = EnhancedEscalationService.isEscalationRequest(
        message
      )
        ? "direct_human_request"
        : "accumulated_frustration";

      const escalationResult = await EnhancedEscalationService.escalateToHuman({
        sessionId,
        userMessage: message,
        context: dialogContext,
        reason: escalationReason,
        stats: systemStats,
      });

      const escalationResponse = {
        assistant: "Мария Enhanced AI",
        escalated: true,
        message: EnhancedEscalationService.getEscalationResponse(
          escalationReason,
          escalationResult.escalationId,
          escalationResult.estimatedWaitTime
        ),
        escalationId: escalationResult.escalationId,
        confidence: 1.0,
        processingTime: Date.now() - processingStart,
        emotionalAnalysis: emotionalAnalysis,
      };

      devLog("Эскалация выполнена", {
        escalationId: escalationResult.escalationId,
        reason: escalationReason,
      });
      logStep("escalation:completed", {
        escalationId: escalationResult.escalationId,
        reason: escalationReason,
      });

      // Сохраняем в контекст
      contextManager.addUserMessage(sessionId, message);
      contextManager.addAssistantResponse(
        sessionId,
        escalationResponse.message,
        [],
        {
          escalated: true,
          escalationId: escalationResult.escalationId,
          reason: escalationReason,
        }
      );

      logStep("request:completed", {
        type: "escalation",
        processingTime: Date.now() - processingStart,
      });

      return res.json(escalationResponse);
    }

    // Проверка на фрустрацию пользователя
    if (EnhancedEscalationService.detectFrustration(message)) {
      // Автоматически предлагаем помощь оператора
      const softEscalationResponse = {
        assistant: "Мария Enhanced AI",
        message:
          "Вижу, что возникли трудности. Могу предложить связать вас с живым оператором для персональной помощи. Хотите, чтобы я это сделала? Или попробуем решить вопрос вместе?",
        confidence: 0.9,
        suggestedActions: [
          "Связаться с оператором",
          "Продолжить с ИИ-помощником",
        ],
        processingTime: Date.now() - processingStart,
        emotionalAnalysis: emotionalAnalysis,
      };

      devLog("Обнаружена фрустрация, предложена мягкая эскалация");

      contextManager.addUserMessage(sessionId, message);
      contextManager.addAssistantResponse(
        sessionId,
        softEscalationResponse.message
      );

      logStep("request:completed", {
        type: "soft_escalation",
        processingTime: Date.now() - processingStart,
      });

      return res.json(softEscalationResponse);
    }

    // === ИСПРАВЛЕННАЯ КОГНИТИВНАЯ ОБРАБОТКА ===

    // 1. Получаем контекст
    const contextRetrievalStart = Date.now();
    const context = contextManager.getRelevantContext(sessionId, message);
    logStep("context:re-resolved", {
      durationMs: Date.now() - contextRetrievalStart,
      entities: context.recentEntities?.length,
    });
    trackStep("context:re-resolved", Date.now() - contextRetrievalStart);

    // 2. Строим когнитивную модель пользователя с защитой от ошибок
    let userProfile;
    try {
      const cognitiveStart = Date.now();
      userProfile = cognitiveModeling.buildUserModel(sessionId, [
        {
          message,
          entities: [],
          queryType: "unknown",
          complexity: "medium",
          mainTopic: null,
          emotionalState: "neutral",
        },
      ]);
      logStep("cognitive:built", { durationMs: Date.now() - cognitiveStart });
      trackStep("cognitive:built", Date.now() - cognitiveStart);
    } catch (error) {
      console.error("❌ Ошибка построения когнитивной модели:", error);
      userProfile = cognitiveModeling.buildUserModel(sessionId, []);
      logError("cognitive", "Fallback когнитивной модели", error);
    }
    devLog("Когнитивная модель пользователя сформирована", {
      cognitiveLoad: userProfile?.cognitiveLoad,
    });

    // 3. Анализируем эмоциональное состояние с защитой от ошибок
    let emotionalState;
    try {
      const emotionalStateStart = Date.now();
      emotionalState = emotionalIntelligence.analyzeEmotionalState(
        message,
        context
      );
      logStep("emotion:state", {
        durationMs: Date.now() - emotionalStateStart,
        primary: emotionalState.primaryEmotion?.type,
      });
      trackStep("emotion:state", Date.now() - emotionalStateStart);
    } catch (error) {
      console.error("❌ Ошибка анализа эмоционального состояния:", error);
      emotionalState = {
        primaryEmotion: { type: "neutral", confidence: 0.5 },
        secondaryEmotions: [],
        intensity: 0.5,
        suggestedTone: "neutral",
        triggers: [],
      };
      logError("emotion", "Fallback эмоционального состояния", error);
    }
    devLog("Эмоциональное состояние определено", {
      primaryEmotion: emotionalState.primaryEmotion?.type,
      intensity: emotionalState.intensity,
    });

    // 4. Предсказываем следующие вопросы с защитой от ошибок
    let predictedQuestions = [];
    try {
      const predictionStart = Date.now();
      predictedQuestions = cognitiveModeling.predictNextQuestion(
        userProfile,
        context
      );
      logStep("cognitive:predicted", {
        durationMs: Date.now() - predictionStart,
        questions: predictedQuestions.length,
      });
      trackStep("cognitive:predicted", Date.now() - predictionStart);
    } catch (error) {
      console.error("❌ Ошибка предсказания вопросов:", error);
      predictedQuestions = [];
      logError("cognitive", "Fallback predicted questions", error);
    }
    devLog("Предсказанные вопросы", predictedQuestions);

    // 5. Разрешаем ссылки
    const referenceStart = Date.now();
    const resolvedMessage = contextManager.resolveReferences(
      sessionId,
      message
    );
    logStep("context:references", {
      durationMs: Date.now() - referenceStart,
      changed: resolvedMessage !== message,
    });
    trackStep("context:references", Date.now() - referenceStart);
    devLog("Разрешенные ссылки в сообщении", { resolvedMessage });

    // 6. Анализ запроса с защитой от ошибок
    let queryAnalysis;
    try {
      const analysisStart = Date.now();
      queryAnalysis = queryAnalyzer.analyzeComplexQuery(resolvedMessage, {
        ...context,
        userProfile,
        emotionalState,
      });
      logStep("analysis:completed", {
        durationMs: Date.now() - analysisStart,
        intent: queryAnalysis.intent?.intent,
      });
      trackStep("analysis:completed", Date.now() - analysisStart);
    } catch (error) {
      console.error("❌ Ошибка анализа запроса:", error);
      queryAnalysis = {
        intent: { intent: "unknown", confidence: 0.5 },
        entities: [],
        complexity: "medium",
        topics: [],
        requiresReasoning: false,
      };
      logError("analysis", "Fallback анализа запроса", error);
    }
    devLog("Анализ запроса завершен", queryAnalysis);

    // 7. Применяем reasoning если нужно с защитой от ошибок
    const needsReasoning =
      queryAnalysis.intent?.intent === "reason" ||
      queryAnalysis.requiresReasoning ||
      queryAnalysis.isComplex ||
      /почему|зачем|как\s+так|каким\s+образом/i.test(resolvedMessage);

    let reasoningResult = null;
    const shouldRunReasoning = needsReasoning && !isFastDevMode;

    try {
      const reasoningStart = Date.now();
      if (shouldRunReasoning) {
        reasoningResult = reasoningEngine.reason(
          resolvedMessage,
          context,
          knowledgeBase
        );
      } else if (needsReasoning && isFastDevMode) {
        reasoningResult = {
          reasoningType: "dev-fast-skip",
          conclusion:
            "Reasoning пропущен в FAST_DEV_MODE для моментальной обработки.",
          justification: "Включен ускоренный режим разработки.",
        };
      }
      logStep("reasoning:completed", {
        durationMs: Date.now() - reasoningStart,
        executed: shouldRunReasoning,
        type: reasoningResult?.reasoningType,
      });
      trackStep("reasoning:completed", Date.now() - reasoningStart);
    } catch (error) {
      console.error("❌ Ошибка reasoning:", error);
      reasoningResult = null;
      logError("reasoning", "Reasoning упал", error);
    }
    devLog("Reasoning выполнен", {
      needsReasoning,
      reasoningType: reasoningResult?.reasoningType,
      skippedForSpeed: !shouldRunReasoning && needsReasoning,
    });

    // 8. Семантический поиск с защитой от ошибок
    let searchResults;
    const shouldRunSemanticSearch = !isFastDevMode;
    try {
      const searchStart = Date.now();
      if (shouldRunSemanticSearch) {
        searchResults = searchEngine.search(resolvedMessage, {
          ...context,
          userProfile,
          emotionalState,
        });
      } else {
        searchResults = {
          results: [],
          confidence: 0,
          totalMatches: 0,
          reasoningType: reasoningResult?.reasoningType || "dev-fast-skip",
          conclusion:
            "Семантический поиск пропущен в FAST_DEV_MODE для моментальной обработки.",
          justification: "Включен ускоренный режим разработки.",
        };
      }
      logStep("search:completed", {
        durationMs: Date.now() - searchStart,
        results: searchResults?.results?.length,
        skippedForSpeed: !shouldRunSemanticSearch,
      });
      trackStep("search:completed", Date.now() - searchStart);
    } catch (error) {
      console.error("❌ Ошибка семантического поиска:", error);
      searchResults = {
        results: [],
        confidence: 0,
        totalMatches: 0,
      };
      logError("search", "Семантический поиск упал", error);
    }
    devLog("Семантический поиск завершен", {
      totalMatches: searchResults.totalMatches,
      confidence: searchResults.confidence,
      skippedForSpeed: !shouldRunSemanticSearch,
    });

    // 9. Генерация ответа с учётом когнитивной модели и защитой от ошибок
    let response;
    try {
      const responseStart = Date.now();
      const responseStrategy = userProfile?.getAdaptedResponseStrategy?.() || {
        style: "balanced",
        detailLevel: "medium",
        emotionalTone: "neutral",
      };

      response = responseGenerator.generateResponse(
        queryAnalysis,
        searchResults,
        {
          ...context,
          userProfile,
          emotionalState,
          responseStrategy,
          reasoningResult,
        }
      );
      logStep("response:generated", {
        durationMs: Date.now() - responseStart,
        responseType: response.responseType,
      });
      trackStep("response:generated", Date.now() - responseStart);
    } catch (error) {
      console.error("❌ Ошибка генерации ответа:", error);
      response = {
        answer:
          "Извините, возникла техническая ошибка при обработке вашего запроса. Пожалуйста, попробуйте переформулировать вопрос.",
        sources: [],
        confidence: 0,
        responseType: "error",
      };
      logError("response", "Генерация ответа упала", error);
    }
    devLog("Ответ сгенерирован", {
      responseType: response.responseType,
      confidence: response.confidence,
    });

    // 10. Применяем эмоциональную адаптацию с защитой от ошибок
    let empathicResponse;
    try {
      empathicResponse = emotionalIntelligence.generateEmpathicResponse(
        emotionalState,
        response.answer
      );
    } catch (error) {
      console.error("❌ Ошибка эмоциональной адаптации:", error);
      empathicResponse = response.answer;
    }
    devLog("Эмоциональная адаптация применена", { preview: empathicResponse });

    // 11. Сохраняем в контекст с защитой от ошибок
    try {
      const contextSaveStart = Date.now();
      contextManager.addUserMessage(sessionId, message, queryAnalysis.entities);
      contextManager.addAssistantResponse(
        sessionId,
        empathicResponse,
        response.sources,
        {
          responseType: response.responseType,
          confidence: response.confidence,
          emotionalState: emotionalState,
          userProfile: {
            cognitiveLoad: userProfile?.cognitiveLoad || "medium",
            learningPace:
              userProfile?.behaviorPatterns?.learningPace || "medium",
          },
        }
      );
      logStep("context:updated", { durationMs: Date.now() - contextSaveStart });
      trackStep("context:updated", Date.now() - contextSaveStart);
    } catch (error) {
      console.error("❌ Ошибка сохранения контекста:", error);
      logError("context", "Не удалось сохранить контекст", error);
    }
    devLog("Контекст обновлен", { sessionId });

    // 12. Формируем финальный ответ с безопасным доступом к свойствам
    const finalResponse = {
      assistant: "Мария Cognitive AI",
      message: empathicResponse,
      sources: response.sources || [],
      followUp: response.followUp || [],
      predictedQuestions: predictedQuestions.slice(0, 3),
      confidence: response.confidence || 0.5,
      responseType: response.responseType || "standard",

      // Когнитивная информация с безопасным доступом
      cognitiveInsights: {
        emotionalState: emotionalState?.primaryEmotion?.type || "neutral",
        emotionalIntensity: emotionalState?.intensity || 0.5,
        suggestedTone: emotionalState?.suggestedTone || "neutral",
        userLearningPace:
          userProfile?.behaviorPatterns?.learningPace || "medium",
        cognitiveLoad: userProfile?.cognitiveLoad || "medium",
        inferredGoals: (userProfile?.inferredGoals?.slice(0, 2) || []).map(
          (g) => g?.description || "неизвестно"
        ),
      },

      // Reasoning chain если применимо
      ...(reasoningResult && {
        reasoningChain: reasoningResult.reasoningChain,
        reasoningType: reasoningResult.reasoningType,
      }),

      pipelineStatus: {
        status: "completed",
        message: "Ответ сформирован и отправлен пользователю",
        processingTime: Date.now() - processingStart,
        steps: {
          validation: true,
          contextLoaded: Boolean(dialogContext),
          emotionalAnalysis: Boolean(emotionalAnalysis),
          reasoning: needsReasoning ? "applied" : "skipped",
          search: Boolean(searchResults),
          responseGenerated: Boolean(response?.answer),
        },
        reasoningType: reasoningResult?.reasoningType || "none",
      },

      processingTime: Date.now() - processingStart,
      sessionId: sessionId,
    };

    systemStats.successfulResponses++;
    systemStats.averageResponseTime =
      (systemStats.averageResponseTime * (systemStats.totalQueries - 1) +
        (Date.now() - processingStart)) /
      systemStats.totalQueries;
    logStep("request:profiling", {
      totalMs: Date.now() - processingStart,
      slowest:
        performanceTrace
          .slice()
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 5) || [],
    });
    logStep("request:completed", {
      type: "success",
      processingTime: Date.now() - processingStart,
    });

    devLog("Финальный ответ готов", {
      processingTime: finalResponse.processingTime,
      confidence: finalResponse.confidence,
    });

    res.json(finalResponse);
  } catch (error) {
    console.error(`❌ Ошибка обработки запроса [${req.session.id}]:`, error);
    logError("request", "Обработка запроса упала", error);

    res.status(500).json({
      error: "Внутренняя ошибка системы",
      message:
        "Извините, произошла техническая ошибка. Попробуйте еще раз или обратитесь к оператору.",
      errorCode: "INTERNAL_ERROR",
      timestamp: new Date().toISOString(),
      sessionId: req.session.id,
      processingTime: Date.now() - processingStart,
      pipelineStatus: {
        status: "failed",
        message: "Произошла ошибка при обработке запроса",
        processingTime: Date.now() - processingStart,
        steps: {
          validation: true,
          contextLoaded: false,
          emotionalAnalysis: false,
          reasoning: "skipped",
          search: false,
          responseGenerated: false,
        },
        reasoningType: "none",
      },
    });
  }
});

// API для работы с контекстом
app.get("/api/chat/context", (req, res) => {
  try {
    const sessionId = req.session.id;
    if (!sessionId) {
      return res.status(400).json({
        error: "Нет активной сессии",
        hint: "Начните диалог, отправив сообщение",
      });
    }

    const context = contextManager.getRelevantContext(sessionId, "");

    res.json({
      sessionId,
      context: {
        currentTopic: context.currentTopic,
        recentEntities: context.recentEntities?.slice(0, 8) || [],
        totalInteractions: context.sessionInfo?.totalInteractions || 0,
        sessionDuration: Math.round(
          (context.sessionInfo?.duration || 0) / 1000
        ),
        emotionalState: context.emotionalContext?.currentState || "neutral",
        conversationFlow: context.conversationFlow,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Ошибка получения контекста:", error);
    res.status(500).json({ error: "Ошибка получения контекста сессии" });
  }
});

// Очистка контекста сессии
app.delete("/api/chat/context", (req, res) => {
  try {
    const sessionId = req.session.id;

    if (sessionId && contextManager.sessions.has(sessionId)) {
      contextManager.sessions.delete(sessionId);
    }

    // Очищаем данные сессии
    req.session.destroy((err) => {
      if (err) {
        console.error("Ошибка очистки сессии:", err);
      }
    });

    res.json({
      message: "Контекст сессии и история диалога очищены",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Ошибка очистки контекста:", error);
    res.status(500).json({ error: "Ошибка очистки контекста" });
  }
});

// Расширенная проверка здоровья системы
app.get("/health", (req, res) => {
  const uptime = Date.now() - systemStats.startTime;
  const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));

  const healthStatus = {
    status: "healthy",
    version: "2.0.0-enhanced-ai",
    uptime: {
      milliseconds: uptime,
      hours: uptimeHours,
      formatted: `${Math.floor(uptimeHours / 24)}d ${uptimeHours % 24}h`,
    },
    timestamp: new Date().toISOString(),

    components: {
      knowledgeBase: {
        status: knowledgeBase.length > 0 ? "healthy" : "warning",
        articlesCount: knowledgeBase.length,
        averageContentLength:
          knowledgeBase.reduce(
            (sum, item) => sum + (item.content?.length || 0),
            0
          ) / knowledgeBase.length,
      },
      contextManager: {
        status: contextManager ? "healthy" : "error",
        activeSessions: contextManager?.sessions.size || 0,
        memoryUsage: process.memoryUsage(),
      },
      searchEngine: {
        status: searchEngine ? "healthy" : "error",
        indexSize: searchEngine?.indexCache?.size || 0,
      },
      responseGenerator: {
        status: responseGenerator ? "healthy" : "error",
      },
    },

    performance: systemStats,
  };

  // Определяем общий статус
  const componentStatuses = Object.values(healthStatus.components).map(
    (c) => c.status
  );
  if (componentStatuses.includes("error")) {
    healthStatus.status = "unhealthy";
    res.status(503);
  } else if (componentStatuses.includes("warning")) {
    healthStatus.status = "degraded";
  }

  res.json(healthStatus);
});

// Детальные метрики системы
app.get("/metrics", (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  res.json({
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    },

    performance: {
      ...systemStats,
      successRate:
        systemStats.totalQueries > 0
          ? (
              (systemStats.successfulResponses / systemStats.totalQueries) *
              100
            ).toFixed(2) + "%"
          : "0%",
      escalationRate:
        systemStats.totalQueries > 0
          ? (
              (systemStats.escalations / systemStats.totalQueries) *
              100
            ).toFixed(2) + "%"
          : "0%",
    },

    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + " MB",
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + " MB",
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + " MB",
      external: Math.round(memUsage.external / 1024 / 1024) + " MB",
    },

    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },

    knowledgeBase: {
      totalArticles: knowledgeBase.length,
      categories: [...new Set(knowledgeBase.map((item) => item.category))],
      averageTagCount: (
        knowledgeBase.reduce((sum, item) => sum + (item.tags?.length || 0), 0) /
        knowledgeBase.length
      ).toFixed(1),
    },

    sessions: {
      active: contextManager?.sessions.size || 0,
      totalCreated: systemStats.totalQueries, // приблизительно
    },

    timestamp: new Date().toISOString(),
  });
});

// API для обновления базы знаний (только для разработки)
if (process.env.NODE_ENV === "development") {
  app.post("/api/admin/knowledge-base/reload", async (req, res) => {
    try {
      await reloadKnowledgeBaseService({ rootDir: ROOT_DIR });
      knowledgeBase = getKnowledgeBaseCache();
      embeddingRuntime = new LocalEmbeddingRuntime({ knowledgeBase });
      searchEngine = new SemanticSearchEngine(knowledgeBase, {
        embeddingRuntime,
      });

      res.json({
        message: "База знаний перезагружена успешно",
        articlesCount: knowledgeBase.length,
        status: getKnowledgeBaseStatus(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        error: "Ошибка перезагрузки базы знаний",
        details: error.message,
      });
    }
  });
}

// 404 handler для неизвестных endpoints
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint не найден",
    message: `Маршрут ${req.method} ${req.path} не существует`,
    availableEndpoints: {
      chat: {
        "POST /api/chat/query": "Отправить сообщение ИИ-помощнику",
        "GET /api/chat/context": "Получить контекст текущей сессии",
        "DELETE /api/chat/context": "Очистить контекст сессии",
      },
      system: {
        "GET /health": "Проверка здоровья системы",
        "GET /metrics": "Подробные метрики системы",
      },
    },
  });
});

// Глобальный обработчик ошибок
app.use((error, req, res, next) => {
  console.error("💥 Необработанная ошибка:", {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    sessionId: req.session?.id,
  });

  res.status(500).json({
    error: "Критическая ошибка системы",
    message:
      "Произошла непредвиденная ошибка. Наши специалисты уже работают над решением.",
    errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
    timestamp: new Date().toISOString(),
    sessionId: req.session?.id,
  });
});

// Функция запуска сервера
async function startServer() {
  try {
    // Инициализируем все системы
    await initializeSystem();

    // Запускаем веб-сервер
    const server = app.listen(PORT, () => {
      console.log(`
🤖 ============================================
   Мария Enhanced AI успешно запущена!
============================================
🌍 Адрес: http://localhost:${PORT}
📚 База знаний: ${knowledgeBase.length} статей
🧠 ИИ-компоненты: Все системы активны
⚡ Режим: ${process.env.NODE_ENV || "production"}
🕒 Время запуска: ${new Date().toLocaleString()}

Готова к обработке диалогов с продвинутым ИИ!
============================================`);
    });

    // Настройка graceful shutdown
    const gracefulShutdown = (signal) => {
      console.log(
        `\n📴 Получен сигнал ${signal}, выполняю graceful shutdown...`
      );

      server.close((err) => {
        if (err) {
          console.error("Ошибка закрытия сервера:", err);
        }

        // Очистка ресурсов
        if (contextManager) {
          console.log("🧹 Очистка контекстов сессий...");
          contextManager.cleanupOldSessions();
        }

        console.log("✅ Мария Enhanced AI корректно завершила работу");
        process.exit(0);
      });

      // Принудительное завершение если graceful shutdown занимает слишком много времени
      setTimeout(() => {
        console.error("⚠️  Принудительное завершение работы");
        process.exit(1);
      }, 10000);
    };

    // Обработчики сигналов завершения
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Обработка необработанных исключений
    process.on("uncaughtException", (error) => {
      console.error("💥 Необработанное исключение:", error);
      gracefulShutdown("uncaughtException");
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("💥 Необработанный отказ промиса:", reason);
      gracefulShutdown("unhandledRejection");
    });
  } catch (error) {
    console.error("❌ Критическая ошибка запуска сервера:", error);
    process.exit(1);
  }
}

// Запуск, если файл исполняется напрямую
if (require.main === module) {
  startServer();
}

// Экспорт для тестирования
module.exports = {
  app,
  DialogContextManager,
  AdvancedQueryAnalyzer,
  SemanticSearchEngine,
  ResponseGenerator,
  AmbiguityResolver,
  systemStats,
};
