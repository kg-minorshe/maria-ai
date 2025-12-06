require("dotenv").config();
const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");

// Импорт всех модулей
const { DialogContextManager } = require("./DialogContextManager");
const { AdvancedQueryAnalyzer } = require("./AdvancedQueryAnalyzer");
const { SemanticSearchEngine } = require("./SemanticSearchEngine");
const { ResponseGenerator } = require("./ResponseGenerator");
const { AmbiguityResolver } = require("./AmbiguityResolver");
const { CognitiveUserModeling } = require("./CognitiveUserModeling");
const { EmotionalIntelligence } = require("./EmotionalIntelligence");
const { ReasoningEngine } = require("./ReasoningEngine");

const app = express();
const PORT = process.env.PORT || 3000;

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

app.use(express.static(path.join(__dirname, "public")));

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
  res.sendFile(path.join(__dirname, "public/form.html"));
});
// Инициализация системы
function initializeSystem() {
  console.log("🚀 Инициализация расширенной системы ИИ...");

  try {
    // Загрузка базы знаний
    loadKnowledgeBase();

    // Инициализация компонентов
    contextManager = new DialogContextManager();
    queryAnalyzer = new AdvancedQueryAnalyzer();
    searchEngine = new SemanticSearchEngine(knowledgeBase);
    responseGenerator = new ResponseGenerator();
    ambiguityResolver = new AmbiguityResolver();
    cognitiveModeling = new CognitiveUserModeling();
    emotionalIntelligence = new EmotionalIntelligence();
    reasoningEngine = new ReasoningEngine();

    console.log("✅ Все компоненты системы инициализированы успешно");

    // Проверяем готовность системы
    performSystemHealthCheck();
  } catch (error) {
    console.error("❌ Критическая ошибка инициализации:", error);
    process.exit(1);
  }
}

function loadKnowledgeBase() {
  try {
    const kbPath =
      process.env.KB_PATH || path.join(__dirname, "knowledge-base.json");

    if (!fs.existsSync(kbPath)) {
      console.warn("⚠️  Файл базы знаний не найден. Создаю пример...");
      createSampleKnowledgeBase(kbPath);
    }

    const data = fs.readFileSync(kbPath, "utf8");
    knowledgeBase = JSON.parse(data);

    // Валидация и обогащение данных
    knowledgeBase = validateAndEnrichKnowledgeBase(knowledgeBase);

    global.knowledgeBase = knowledgeBase;
    console.log(`📚 База знаний загружена: ${knowledgeBase.length} статей`);
  } catch (error) {
    console.error("❌ Ошибка загрузки базы знаний:", error.message);
    knowledgeBase = createEmptyKnowledgeBase();
  }
}

function createSampleKnowledgeBase(kbPath) {
  const sampleKB = [
    {
      id: "1",
      title: "Искусственный интеллект",
      aliases: ["ИИ", "AI", "машинный интеллект"],
      content:
        "Искусственный интеллект — это область компьютерных наук, которая занимается созданием интеллектуальных машин, способных работать и реагировать как люди. ИИ включает в себя машинное обучение, глубокое обучение, обработку естественного языка и компьютерное зрение.",
      tags: ["технологии", "компьютерные науки", "автоматизация"],
      category: "технологии",
      lastUpdated: "2024-01-15",
    },
    {
      id: "2",
      title: "Машинное обучение",
      aliases: ["ML", "machine learning"],
      content:
        "Машинное обучение — это подмножество искусственного интеллекта, которое предоставляет системам способность автоматически учиться и улучшаться на основе опыта без явного программирования. ML фокусируется на разработке компьютерных программ, которые могут получать доступ к данным и использовать их для самообучения.",
      tags: ["ИИ", "данные", "алгоритмы", "автоматизация"],
      category: "технологии",
      lastUpdated: "2024-01-15",
    },
  ];

  fs.writeFileSync(kbPath, JSON.stringify(sampleKB, null, 2));
  console.log(`📝 Создан примерный файл базы знаний: ${kbPath}`);
}

function validateAndEnrichKnowledgeBase(kb) {
  return kb.map((item, index) => {
    // Обеспечиваем наличие всех необходимых полей
    return {
      id: item.id || `auto_${index}`,
      title: item.title || "Без названия",
      aliases: Array.isArray(item.aliases) ? item.aliases : [],
      content: item.content || "",
      tags: Array.isArray(item.tags) ? item.tags : [],
      category: item.category || "общее",
      lastUpdated: item.lastUpdated || new Date().toISOString().split("T")[0],
      // Дополнительные метаданные
      contentLength: (item.content || "").length,
      aliasCount: Array.isArray(item.aliases) ? item.aliases.length : 0,
      tagCount: Array.isArray(item.tags) ? item.tags.length : 0,
    };
  });
}

function createEmptyKnowledgeBase() {
  return [
    {
      id: "1",
      title: "Добро пожаловать",
      aliases: ["приветствие"],
      content:
        "Добро пожаловать в систему Марии! База знаний пока пуста, но я готова к работе.",
      tags: ["система"],
      category: "общее",
    },
  ];
}

function performSystemHealthCheck() {
  const checks = {
    knowledgeBase: knowledgeBase.length > 0,
    contextManager: contextManager !== null,
    queryAnalyzer: queryAnalyzer !== null,
    searchEngine: searchEngine !== null,
    responseGenerator: responseGenerator !== null,
    ambiguityResolver: ambiguityResolver !== null,
  };

  const failedChecks = Object.entries(checks).filter(
    ([key, passed]) => !passed
  );

  if (failedChecks.length > 0) {
    console.error(
      "❌ Проверка системы не пройдена:",
      failedChecks.map(([key]) => key)
    );
    throw new Error("Система не готова к работе");
  }

  console.log("✅ Система прошла проверку готовности");
}

// Функция для нормализации текста (убирает различия в написании)
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\w\s]/g, " ") // убираем пунктуацию
    .replace(/\s+/g, " ") // убираем лишние пробелы
    .trim();
}

// Расширенная система эскалации с более гибким распознаванием
class EnhancedEscalationService {
  static escalationPatterns = [
    // Прямые запросы оператора
    {
      patterns: [
        /(?:позов|вызов|нужен|хочу|требую|попроси|дай|покажи).*(?:человек|оператор|менедже?р|специалист|сотрудник|администратор)/,
        /(?:связать|соединить|перевести|переключить|переключи).*(?:человек|оператор|менедже?р|специалист|сотрудник)/,
        /(?:живой|настоящий|реальный|человечески|человечный).*(?:человек|оператор|менедже?р|специалист|сотрудник)/,
        /(?:поддержка|помощь|служба|сервис|техпод|техподдержка).*(?:человек|живой|реальный|настоящий)/,
        /(?:оператор|человек|менедже?р|специалист|админ|модератор|сотрудник).*(?:пожалуйста|плз|срочно|нужно|нужен|требуется)/,
      ],
      confidence: 0.95,
      reason: "direct_human_request",
    },

    // Жалобы на бота
    {
      patterns: [
        /не.*(?:понимаешь|помогаешь|работаешь|отвечаешь|слушаешь|слышишь|знаешь)/,
        /(?:плохо|ужасно|отвратительно|паршиво|херово|фигово|дерьмово).*(?:работаешь|отвечаешь|помогаешь|функционируешь)/,
        /(?:тупой|глупый|дурацкий|идиотский|бестолковый).*(?:бот|робот|программа|система|ии|ай)/,
        /(?:бесполезн|бесмысленн|никчемн|неэффективн).*(?:бот|робот|помощник|ассистент|система)/,
      ],
      confidence: 0.85,
      reason: "bot_dissatisfaction",
    },

    // Выражение фрустрации
    {
      patterns: [
        /(?:не могу|не получается|не выходит|никак не|ничего не).*(?:решить|сделать|понять|разобраться|добиться)/,
        /(?:достал|надоел|устал|замучил|заколебал|задолбал).*(?:отвеча|говор|повтор|одн|тоже|так)/,
        /(?:уже.*час|уже.*день|уже.*неделю|долго|давно).*(?:пытаюсь|стараюсь|мучаюсь|бьюсь|пробую)/,
        /(?:сколько|как.*много|как.*долго).*(?:можно|раз|времени).*(?:объяснять|повторять|говорить|просить)/,
      ],
      confidence: 0.75,
      reason: "user_frustration",
    },

    // Негативные эмоции
    {
      patterns: [
        /(?:бесит|раздражает|злит|выводит|достает).*(?:это|так|бот|система|ситуация)/,
        /(?:ужас|кошмар|капец|пипец|трындец|ппц).*(?:какой|что|как)/,
        /(?:не.*нервы|нет.*сил|нет.*времени|нет.*терпения).*(?:больше|уже|на это)/,
        /(?:иду|пойду|пишу|звоню).*(?:куда|кому).*(?:другому|еще|в.*другое)/,
      ],
      confidence: 0.7,
      reason: "negative_emotions",
    },

    // Просьбы о переводе
    {
      patterns: [
        /(?:можно|можете|может).*(?:перевести|переключить|перенаправить|передать)/,
        /(?:есть|имеется|доступен).*(?:кто|кто то|кто нибудь).*(?:живой|человек|реальный)/,
        /(?:кто.*нибудь|есть.*кто).*(?:может|сможет|поможет).*(?:человек|оператор|менедже?р)/,
        /(?:работает|дежурит|есть).*(?:сейчас|щас|сегодня).*(?:кто|оператор|человек|менедже?р)/,
      ],
      confidence: 0.8,
      reason: "transfer_request",
    },

    // Сомнения в возможностях ИИ
    {
      patterns: [
        /(?:ты.*не.*можешь|не.*способен|не.*умеешь|не.*получится).*(?:помочь|решить|сделать)/,
        /(?:это.*слишком|слишком.*сложно|слишком.*трудно).*(?:для.*тебя|для.*бота|для.*ии)/,
        /(?:тут.*нужен|здесь.*нужен|нужен.*именно).*(?:человек|специалист|профессионал)/,
        /(?:искусственный.*интеллект|бот|программа).*(?:не.*поймет|не.*разберется|не.*справится)/,
      ],
      confidence: 0.65,
      reason: "ai_capability_doubt",
    },

    // Ключевые слова с вариациями написания
    {
      patterns: [
        /(?:человек|челавек|чиловек|человека)(?:а|у|ом|е|и|ов)?/,
        /(?:оператор|операто|оперетор)(?:а|у|ом|е|ы|ов)?/,
        /(?:менеджер|менеджер|манагер|менагер)(?:а|у|ом|е|ы|ов)?/,
        /(?:специалист|спец|спеиалист|специилист)(?:а|у|ом|е|ы|ов)?/,
        /(?:поддержка|поддержку|поддержке|подержка|поддерка)/,
        /(?:техподдержка|техпод|тех поддержка|техническая поддержка)/,
      ],
      confidence: 0.6,
      reason: "keyword_match",
    },
  ];

  static frustrationPatterns = [
    // Выражение непонимания
    {
      patterns: [
        /(?:не.*понима|не.*понятн|ничего.*не.*понятн|непонятн)(?:ю|о|а|ет|ть)?/,
        /(?:что.*это|что.*такое|о.*чем|про.*что).*(?:ты|вы).*(?:говор|пиш|расска)/,
        /(?:какой|какая|что.*за).*(?:бред|чушь|ерунда|нонсенс|абсурд)/,
      ],
      confidence: 0.8,
    },

    // Выражение усталости/раздражения
    {
      patterns: [
        /(?:достал|надоел|устал|заколебал|задолбал|замучил|заебал)/,
        /(?:не.*помога|не.*работа|не.*функциониру|сломал|глюч)/,
        /(?:тупо|глупо|идиотски|бестолково|бесполезно|никчемно)/,
      ],
      confidence: 0.75,
    },

    // Выражение спешки/срочности
    {
      patterns: [
        /(?:срочно|быстро|скорее|поскорее|немедленно|сейчас.*же)/,
        /(?:времени.*нет|спешу|торопл|опаздыва|горит)/,
        /(?:уже.*час|уже.*день|долго.*жду|долго.*пыта)/,
      ],
      confidence: 0.7,
    },
  ];

  // Нормализация текста для лучшего распознавания
  static normalizeForAnalysis(text) {
    return text
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[.,!?;:()\"\'`]/g, " ") // убираем пунктуацию
      .replace(/\s+/g, " ") // убираем лишние пробелы
      .trim();
  }

  // Проверка на запрос эскалации
  static isEscalationRequest(message) {
    const normalizedMessage = this.normalizeForAnalysis(message);

    let maxConfidence = 0;
    let matchedReason = null;

    for (const group of this.escalationPatterns) {
      for (const pattern of group.patterns) {
        if (pattern.test(normalizedMessage)) {
          if (group.confidence > maxConfidence) {
            maxConfidence = group.confidence;
            matchedReason = group.reason;
          }
        }
      }
    }

    // Логируем для отладки
    if (maxConfidence > 0.5) {
      console.log(
        `🔍 Escalation detected: confidence=${maxConfidence}, reason=${matchedReason}, message="${message.substring(
          0,
          50
        )}..."`
      );
    }

    return maxConfidence >= 0.55; // Понижен порог для более чувствительного распознавания
  }

  // Определение уровня фрустрации пользователя
  static detectFrustration(message) {
    const normalizedMessage = this.normalizeForAnalysis(message);

    let maxConfidence = 0;

    for (const group of this.frustrationPatterns) {
      for (const pattern of group.patterns) {
        if (pattern.test(normalizedMessage)) {
          if (group.confidence > maxConfidence) {
            maxConfidence = group.confidence;
          }
        }
      }
    }

    return maxConfidence >= 0.6;
  }

  // Анализ эмоционального состояния
  static analyzeEmotionalState(message, contextHistory = []) {
    const normalizedMessage = this.normalizeForAnalysis(message);

    // Позитивные индикаторы
    const positivePatterns = [
      /(?:спасибо|благодарю|отлично|прекрасно|хорошо|замечательно|супер|класс)/,
      /(?:помог|получилось|понятно|ясно|разобрал|решил)/,
    ];

    // Негативные индикаторы
    const negativePatterns = [
      /(?:плохо|ужасно|отвратительно|кошмар|ужас|капец)/,
      /(?:не.*нравится|не.*устраивает|не.*подходит|недоволен)/,
    ];

    let positiveScore = 0;
    let negativeScore = 0;

    positivePatterns.forEach((pattern) => {
      if (pattern.test(normalizedMessage)) positiveScore += 1;
    });

    negativePatterns.forEach((pattern) => {
      if (pattern.test(normalizedMessage)) negativeScore += 1;
    });

    // Анализ истории для выявления паттернов
    const recentNegative = contextHistory
      .slice(-3)
      .filter((msg) => this.detectFrustration(msg) || negativeScore > 0).length;

    return {
      currentMood:
        negativeScore > positiveScore
          ? "negative"
          : positiveScore > 0
          ? "positive"
          : "neutral",
      shouldEscalate: recentNegative >= 2, // Эскалация после 2 негативных сообщений подряд
    };
  }

  static async escalateToHuman({
    sessionId,
    userMessage,
    context = {},
    reason = "user_request",
  }) {
    const timestamp = new Date().toISOString();
    const escalationData = {
      sessionId,
      userMessage,
      context: {
        ...context,
        // Убираем чувствительную информацию
        sessionInfo: context.sessionInfo
          ? {
              totalInteractions: context.sessionInfo.totalInteractions,
              duration: context.sessionInfo.duration,
            }
          : null,
      },
      reason,
      timestamp,
      source: "maria-enhanced-ai",
    };

    // Логируем эскалацию
    console.log(
      `🚨 [ESCALATION] ${timestamp} - Session: ${sessionId}, Reason: ${reason}`
    );

    // В реальной системе здесь был бы вызов API службы поддержки
    // await notifyHumanOperators(escalationData);

    systemStats.escalations++;

    return {
      success: true,
      escalationId: `esc_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      timestamp,
      estimatedWaitTime: this.getEstimatedWaitTime(reason),
    };
  }

  static getEstimatedWaitTime(reason) {
    const waitTimes = {
      direct_human_request: "2-3 минуты",
      bot_dissatisfaction: "3-5 минут",
      user_frustration: "1-2 минуты",
      negative_emotions: "2-4 минуты",
      transfer_request: "1-3 минуты",
      ai_capability_doubt: "3-5 минут",
      keyword_match: "5-7 минут",
    };

    return waitTimes[reason] || "3-5 минут";
  }

  static getEscalationResponse(reason, escalationId, waitTime) {
    const responses = {
      direct_human_request: `Конечно! Я уже передаю ваш запрос живому оператору. Ожидаемое время ожидания: ${waitTime}. Оператор скоро с вами свяжется!`,
      bot_dissatisfaction: `Понимаю ваше недовольство. Передаю ваш запрос специалисту, который сможет лучше помочь. Ожидаемое время ожидания: ${waitTime}.`,
      user_frustration: `Вижу, что возникли сложности. Сейчас подключу живого оператора для персональной помощи. Ожидание: ${waitTime}.`,
      negative_emotions: `Извините за доставленные неудобства. Передаю ваш случай специалисту службы поддержки. Время ожидания: ${waitTime}.`,
      transfer_request: `Без проблем! Перевожу вас к живому оператору. Примерное время ожидания: ${waitTime}. Пожалуйста, оставайтесь на связи.`,
      ai_capability_doubt: `Понимаю, что вопрос требует человеческого подхода. Подключаю специалиста. Ожидание: ${waitTime}.`,
      keyword_match: `Передаю ваш запрос живому оператору. Время ожидания: ${waitTime}. Скоро с вами свяжутся!`,
    };

    return (
      responses[reason] ||
      `Конечно! Передаю ваш запрос оператору. Ожидаемое время: ${waitTime}. Оператор скоро с вами свяжется!`
    );
  }
}

// Основной API endpoint - обработка диалога
app.post("/api/chat/query", async (req, res) => {
  const processingStart = Date.now();
  try {
    const { message } = req.body;

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

    // Получаем или создаем сессию
    const sessionId =
      req.session.id ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 12)}`;
    req.session.id = sessionId;

    // Получаем историю сообщений для анализа эмоционального состояния
    const dialogContext = contextManager.getRelevantContext(sessionId, message);
    const messageHistory =
      dialogContext.recentMessages?.map((m) => m.content) || [];

    // Анализируем эмоциональное состояние
    const emotionalAnalysis = EnhancedEscalationService.analyzeEmotionalState(
      message,
      messageHistory
    );

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

      contextManager.addUserMessage(sessionId, message);
      contextManager.addAssistantResponse(
        sessionId,
        softEscalationResponse.message
      );

      return res.json(softEscalationResponse);
    }

    // === ИСПРАВЛЕННАЯ КОГНИТИВНАЯ ОБРАБОТКА ===

    // 1. Получаем контекст
    const context = contextManager.getRelevantContext(sessionId, message);

    // 2. Строим когнитивную модель пользователя с защитой от ошибок
    let userProfile;
    try {
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
    } catch (error) {
      console.error("❌ Ошибка построения когнитивной модели:", error);
      userProfile = cognitiveModeling.buildUserModel(sessionId, []);
    }

    // 3. Анализируем эмоциональное состояние с защитой от ошибок
    let emotionalState;
    try {
      emotionalState = emotionalIntelligence.analyzeEmotionalState(
        message,
        context
      );
    } catch (error) {
      console.error("❌ Ошибка анализа эмоционального состояния:", error);
      emotionalState = {
        primaryEmotion: { type: "neutral", confidence: 0.5 },
        secondaryEmotions: [],
        intensity: 0.5,
        suggestedTone: "neutral",
        triggers: [],
      };
    }

    // 4. Предсказываем следующие вопросы с защитой от ошибок
    let predictedQuestions = [];
    try {
      predictedQuestions = cognitiveModeling.predictNextQuestion(
        userProfile,
        context
      );
    } catch (error) {
      console.error("❌ Ошибка предсказания вопросов:", error);
      predictedQuestions = [];
    }

    // 5. Разрешаем ссылки
    const resolvedMessage = contextManager.resolveReferences(
      sessionId,
      message
    );

    // 6. Анализ запроса с защитой от ошибок
    let queryAnalysis;
    try {
      queryAnalysis = queryAnalyzer.analyzeComplexQuery(resolvedMessage, {
        ...context,
        userProfile,
        emotionalState,
      });
    } catch (error) {
      console.error("❌ Ошибка анализа запроса:", error);
      queryAnalysis = {
        intent: { intent: "unknown", confidence: 0.5 },
        entities: [],
        complexity: "medium",
        topics: [],
        requiresReasoning: false,
      };
    }

    // 7. Применяем reasoning если нужно с защитой от ошибок
    let reasoningResult = null;
    try {
      if (
        queryAnalysis.intent?.intent === "reason" ||
        message.includes("почему") ||
        message.includes("как так")
      ) {
        reasoningResult = reasoningEngine.reason(
          resolvedMessage,
          context,
          knowledgeBase
        );
      }
    } catch (error) {
      console.error("❌ Ошибка reasoning:", error);
      reasoningResult = null;
    }

    // 8. Семантический поиск с защитой от ошибок
    let searchResults;
    try {
      searchResults = searchEngine.search(resolvedMessage, {
        ...context,
        userProfile,
        emotionalState,
      });
    } catch (error) {
      console.error("❌ Ошибка семантического поиска:", error);
      searchResults = {
        results: [],
        confidence: 0,
        totalMatches: 0,
      };
    }

    // 9. Генерация ответа с учётом когнитивной модели и защитой от ошибок
    let response;
    try {
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
    } catch (error) {
      console.error("❌ Ошибка генерации ответа:", error);
      response = {
        answer:
          "Извините, возникла техническая ошибка при обработке вашего запроса. Пожалуйста, попробуйте переформулировать вопрос.",
        sources: [],
        confidence: 0,
        responseType: "error",
      };
    }

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

    // 11. Сохраняем в контекст с защитой от ошибок
    try {
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
    } catch (error) {
      console.error("❌ Ошибка сохранения контекста:", error);
    }

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

      processingTime: Date.now() - processingStart,
      sessionId: sessionId,
    };

    res.json(finalResponse);
  } catch (error) {
    console.error(`❌ Ошибка обработки запроса [${req.session.id}]:`, error);

    res.status(500).json({
      error: "Внутренняя ошибка системы",
      message:
        "Извините, произошла техническая ошибка. Попробуйте еще раз или обратитесь к оператору.",
      errorCode: "INTERNAL_ERROR",
      timestamp: new Date().toISOString(),
      sessionId: req.session.id,
      processingTime: Date.now() - processingStart,
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
  app.post("/api/admin/knowledge-base/reload", (req, res) => {
    try {
      loadKnowledgeBase();
      searchEngine = new SemanticSearchEngine(knowledgeBase);

      res.json({
        message: "База знаний перезагружена успешно",
        articlesCount: knowledgeBase.length,
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
function startServer() {
  try {
    // Инициализируем все системы
    initializeSystem();

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
