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
    stats,
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

    if (stats) {
      stats.escalations++;
    }

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

module.exports = { EnhancedEscalationService };
