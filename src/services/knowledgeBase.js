const fs = require("fs");
const path = require("path");
const {
  loadRussianDatasets,
} = require("./russianDatasetLoader");
const {
  saveKnowledgeBaseEntries,
  loadKnowledgeBaseFromDb,
  saveKnowledgeBaseEntriesToMysql,
  loadKnowledgeBaseFromMysql,
  DEFAULT_MYSQL_CONFIG,
} = require("./knowledgeBaseStorage");
const { SemanticEmbeddingRuntime } = require("./semanticEmbeddingRuntime");

function parseGlobalLimit(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const sanitized = String(value).trim();
  if (!sanitized) {
    return null;
  }

  const numeric = Number(sanitized.replace(/[_\s,]+/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
}

function resolveStorageMode() {
  const mode = (process.env.KB_STORAGE || process.env.KB_STORAGE_MODE || process.env.KB_CACHE_MODE || "")
    .toString()
    .trim()
    .toLowerCase();

  if (mode === "sqlite") {
    return "sqlite";
  }

  // По умолчанию переносим хранение в MySQL, даже если переменные окружения не заданы
  return "mysql";
}

function resolveSqlitePath() {
  return process.env.KB_SQLITE_PATH || process.env.KB_DB_PATH || null;
}

function resolveMysqlConfig() {
  const connectionLimit = Number(process.env.KB_MYSQL_POOL);

  return {
    ...DEFAULT_MYSQL_CONFIG,
    ...(Number.isFinite(connectionLimit) && connectionLimit > 0
      ? { connectionLimit }
      : {}),
  };
}

function rebuildRussianDatasetBuckets(entries = []) {
  return entries.reduce((acc, entry) => {
    const source = entry?.source || "russian";
    const key = source.startsWith("russian:")
      ? source.slice("russian:".length)
      : source;

    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(entry);
    return acc;
  }, {});
}

function splitKnowledgeBaseBySource(entries = []) {
  const projectKnowledgeBase = [];
  const generalKnowledgeBase = [];
  const russianDataset = [];

  for (const entry of entries) {
    const source = entry?.source || "general";

    if (source === "project") {
      projectKnowledgeBase.push(entry);
      continue;
    }

    if (source === "general") {
      generalKnowledgeBase.push(entry);
      continue;
    }

    if (source.startsWith("russian")) {
      russianDataset.push(entry);
      continue;
    }

    // Неизвестные источники считаем общими, чтобы не терять данные
    generalKnowledgeBase.push(entry);
  }

  const russianDatasets = rebuildRussianDatasetBuckets(russianDataset);

  return {
    projectKnowledgeBase,
    generalKnowledgeBase,
    russianDataset,
    russianDatasets,
  };
}

function applyGlobalLimit(buckets, limit) {
  const totalAvailable =
    (buckets.projectKnowledgeBase?.length || 0) +
    (buckets.generalKnowledgeBase?.length || 0) +
    (buckets.russianDataset?.length || 0);

  if (!limit || !Number.isFinite(limit) || limit <= 0 || totalAvailable <= limit) {
    return {
      ...buckets,
      combined: [
        ...(buckets.projectKnowledgeBase || []),
        ...(buckets.generalKnowledgeBase || []),
        ...(buckets.russianDataset || []),
      ],
    };
  }

  const roundRobinSources = [
    { key: "projectKnowledgeBase", entries: buckets.projectKnowledgeBase || [], cursor: 0 },
    { key: "generalKnowledgeBase", entries: buckets.generalKnowledgeBase || [], cursor: 0 },
    { key: "russianDataset", entries: buckets.russianDataset || [], cursor: 0 },
  ];

  const sliced = {
    projectKnowledgeBase: [],
    generalKnowledgeBase: [],
    russianDataset: [],
  };

  let taken = 0;
  while (taken < limit && roundRobinSources.some((s) => s.cursor < s.entries.length)) {
    for (const source of roundRobinSources) {
      if (taken >= limit) break;
      if (source.cursor >= source.entries.length) continue;

      sliced[source.key].push(source.entries[source.cursor]);
      source.cursor += 1;
      taken += 1;
    }
  }

  const combined = [
    ...sliced.projectKnowledgeBase,
    ...sliced.generalKnowledgeBase,
    ...sliced.russianDataset,
  ];

  const russianDatasets = rebuildRussianDatasetBuckets(sliced.russianDataset);

  console.log(
    `⏬ Применён глобальный лимит KB: загружено ${taken}/${totalAvailable} записей (параметр KB_GLOBAL_LIMIT/KB_MAX_RECORDS)`
  );

  return {
    ...sliced,
    russianDatasets,
    combined,
  };
}

async function getGptEmbeddingRuntime() {
  if (!gptEmbeddingRuntime) {
    gptEmbeddingRuntime = new SemanticEmbeddingRuntime({
      modelId: process.env.KB_GPT_EMBED_MODEL || process.env.EMBEDDING_MODEL_ID,
      cacheDir: process.env.KB_GPT_EMBED_CACHE_DIR || DEFAULT_GPT_CACHE_DIR,
      cacheLimit: Number(process.env.KB_GPT_CACHE_LIMIT) || 10000,
    });
  }

  return gptEmbeddingRuntime;
}

async function enrichWithGptEmbeddings(entries = []) {
  if (!entries?.length) return entries;

  try {
    const runtime = await getGptEmbeddingRuntime();
    await Promise.all(
      entries.map(async (entry, index) => {
        if (entry.embedding && entry.embedding.length) return;

        const sourceText = entry.content || entry.title || "";
        if (!sourceText) return;

        entry.embedding = await runtime.embedText(sourceText);

        if ((index + 1) % 500 === 0) {
          console.log(
            `🤖 GPT-эмбеддинги рассчитаны для ${index + 1} записей базы знаний`
          );
        }
      })
    );
  } catch (error) {
    console.warn(
      `⚠️ Не удалось построить GPT-эмбеддинги при загрузке KB: ${error.message}`
    );
  }

  return entries;
}

let knowledgeStore = {
  projectKnowledgeBase: [],
  generalKnowledgeBase: [],

  // было: russianDataset: []
  // стало: отдельные датасеты + общий плоский список
  russianDatasets: {}, // { [datasetKey]: entries[] }
  russianDataset: [], // плоский массив всех русских датасетов

  combined: [],
  status: "idle",
  loadedAt: null,
  loadTimeMs: 0,
};

const DEFAULT_GPT_CACHE_DIR = path.join(
  path.resolve(__dirname, "../.."),
  "data",
  "cache",
  "gpt-embeddings"
);
let gptEmbeddingRuntime = null;

function resolveKnowledgePaths(rootDir) {
  const knowledgeDir = path.join(rootDir, "data", "knowledge");

  return {
    project: path.join(knowledgeDir, "ru_datasets/knowledge-base-project.json"),
    general: path.join(knowledgeDir, "ru_datasets/knowledge-base-general.json"),
    // дефолтный "русский" теперь может быть каталогом/файлом, но это решает loader
    russianDefault: path.join(knowledgeDir, "russian-open-qa.jsonl"),
  };
}

async function loadKnowledgeBase({
  projectPath,
  generalPath,
  rootDir = path.resolve(__dirname, "../.."),
} = {}) {
  if (knowledgeStore.status === "ready" && knowledgeStore.combined.length) {
    console.log(
      `ℹ️  Используется предзагруженная база знаний в памяти (${knowledgeStore.combined.length} статей)`
    );

    return {
      knowledgeBase: knowledgeStore.combined,
      projectKnowledgeBase: knowledgeStore.projectKnowledgeBase,
      generalKnowledgeBase: knowledgeStore.generalKnowledgeBase,
      russianDataset: knowledgeStore.russianDataset,
      russianDatasets: knowledgeStore.russianDatasets,
    };
  }

  return reloadKnowledgeBase({ projectPath, generalPath, rootDir });
}

async function reloadKnowledgeBase({
  projectPath,
  generalPath,
  rootDir = path.resolve(__dirname, "../.."),
} = {}) {
  console.log("⏳ Предзагрузка базы знаний в оперативную память...");
  knowledgeStore.status = "loading";

  const loadStart = Date.now();

  const loaded = await loadKnowledgeBaseFromStorage({
    projectPath,
    generalPath,
    rootDir,
  });

  knowledgeStore = {
    ...knowledgeStore,
    combined: loaded.knowledgeBase,
    projectKnowledgeBase: loaded.projectKnowledgeBase,
    generalKnowledgeBase: loaded.generalKnowledgeBase,
    russianDataset: loaded.russianDataset,
    russianDatasets: loaded.russianDatasets,
    status: "ready",
    loadedAt: new Date(),
    loadTimeMs: Date.now() - loadStart,
  };

  console.log(
    `✅ База знаний загружена в память (${knowledgeStore.combined.length} статей, статус: ${knowledgeStore.status}, время: ${knowledgeStore.loadTimeMs} мс)`
  );

  return {
    knowledgeBase: knowledgeStore.combined,
    projectKnowledgeBase: knowledgeStore.projectKnowledgeBase,
    generalKnowledgeBase: knowledgeStore.generalKnowledgeBase,
    russianDataset: knowledgeStore.russianDataset,
    russianDatasets: knowledgeStore.russianDatasets,
  };
}

async function loadKnowledgeBaseFromStorage({
  projectPath,
  generalPath,
  rootDir = path.resolve(__dirname, "../.."),
} = {}) {
  const storageMode = resolveStorageMode();
  const mysqlConfig = resolveMysqlConfig();
  const sqlitePath = resolveSqlitePath();
  const globalLimit = null;

  const paths = resolveKnowledgePaths(rootDir);

  const resolvedProjectPath =
    projectPath || process.env.KB_PROJECT_PATH || paths.project;
  const resolvedGeneralPath =
    generalPath || process.env.KB_GENERAL_PATH || paths.general;

  /**
   * ✅ НОВОЕ:
   * KB_RUSSIAN_PATHS — список путей через запятую:
   *   KB_RUSSIAN_PATHS="data/knowledge/ru1.jsonl,data/knowledge/ru2.jsonl"
   *
   * Или можно оставить KB_RUSSIAN_PATH как один путь (для обратной совместимости).
   * Также можно указать каталог: "data/knowledge/ru_datasets" — loader прочитает все *.jsonl.
   */
  const russianPathsEnv = process.env.KB_RUSSIAN_PATHS;
  const russianSingleEnv = process.env.KB_RUSSIAN_PATH;

  const russianInputs = russianPathsEnv
    ? russianPathsEnv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : russianSingleEnv
    ? [russianSingleEnv]
    : [paths.russianDefault];

  if (storageMode === "mysql" || storageMode === "sqlite") {
    try {
      const dbEntries = await loadKnowledgeBaseFromDatabase(storageMode, {
        dbPath: sqlitePath || undefined,
        mysqlConfig,
      });

      if (dbEntries?.length) {
        console.log(
          `📦 Загружено ${dbEntries.length} записей из ${storageMode.toUpperCase()} без чтения JSONL`
        );

        const limitedBuckets = applyGlobalLimit(
          splitKnowledgeBaseBySource(dbEntries),
          globalLimit
        );

        const knowledgeBase = validateAndEnrichKnowledgeBase(
          limitedBuckets.combined,
          { withProgress: true }
        );

        await enrichWithGptEmbeddings(knowledgeBase);

        return {
          knowledgeBase,
          projectKnowledgeBase: limitedBuckets.projectKnowledgeBase,
          generalKnowledgeBase: limitedBuckets.generalKnowledgeBase,
          russianDataset: limitedBuckets.russianDataset,
          russianDatasets: limitedBuckets.russianDatasets,
        };
      }

      console.log(
        `ℹ️ ${storageMode.toUpperCase()} база знаний пуста, читаю JSON/JSONL файлы...`
      );
    } catch (error) {
      console.warn(
        `⚠️ Не удалось загрузить базу знаний из ${storageMode.toUpperCase()}: ${error.message}`
      );
    }
  }

  const projectStart = Date.now();
  const projectKnowledgeBase = appendSource(
    await loadKnowledgeBaseFile(
      resolvedProjectPath,
      createSampleProjectKnowledgeBase,
      "проектная база знаний"
    ),
    "project"
  );
  console.log(
    `📚 Загружена проектная база знаний: ${projectKnowledgeBase.length} записей за ${
      Date.now() - projectStart
    } мс`
  );

  const generalStart = Date.now();
  const generalKnowledgeBase = appendSource(
    await loadKnowledgeBaseFile(
      resolvedGeneralPath,
      createSampleGeneralKnowledgeBase,
      "общая база знаний"
    ),
    "general"
  );
  console.log(
    `📖 Загружена общая база знаний: ${generalKnowledgeBase.length} записей за ${
      Date.now() - generalStart
    } мс`
  );

  const russianStart = Date.now();
  const russianLimit = null;
  console.log("🔢 Лимит загрузки русских датасетов отключён (все записи)");
  const { datasets: russianDatasetsRaw } = await loadRussianDatasets({
    rootDir,
    inputs: russianInputs,
    limitPerDataset: russianLimit,
    // если хочешь общий лимит на всё — добавим позже, но сейчас сделаем просто per dataset
  });

  // Обогащаем source, чтобы было видно, из какого файла пришло
  const russianDatasets = {};
  let russianDataset = [];

  for (const [key, entries] of Object.entries(russianDatasetsRaw)) {
    const enriched = appendSource(entries, `russian:${key}`);
    russianDatasets[key] = enriched;
    russianDataset = russianDataset.concat(enriched);
  }

  console.log(
    `🇷🇺 Загружены русские датасеты: ${Object.keys(russianDatasets).length} шт, всего ${russianDataset.length} записей за ${
      Date.now() - russianStart
    } мс`
  );

  const limitedBuckets = applyGlobalLimit(
    {
      projectKnowledgeBase,
      generalKnowledgeBase,
      russianDataset,
      russianDatasets,
    },
    globalLimit
  );

  const knowledgeBase = validateAndEnrichKnowledgeBase(
    limitedBuckets.combined,
    { withProgress: true }
  );

  const knowledgeBaseWithEmbeddings = await enrichWithGptEmbeddings(
    knowledgeBase
  );

  if (storageMode === "mysql" || storageMode === "sqlite") {
    try {
      await persistKnowledgeBaseToDatabase(storageMode, knowledgeBaseWithEmbeddings, {
        dbPath: sqlitePath || undefined,
        mysqlConfig,
      });
    } catch (error) {
      console.warn(
        `⚠️ Не удалось сохранить базу знаний в ${storageMode.toUpperCase()}: ${error.message}`
      );
    }
  }

  return {
    knowledgeBase: knowledgeBaseWithEmbeddings,
    projectKnowledgeBase: limitedBuckets.projectKnowledgeBase,
    generalKnowledgeBase: limitedBuckets.generalKnowledgeBase,
    russianDataset: limitedBuckets.russianDataset,
    russianDatasets: limitedBuckets.russianDatasets,
  };
}

async function loadKnowledgeBaseFromDatabase(
  storageMode,
  { dbPath, mysqlConfig } = {}
) {
  if (storageMode === "mysql") {
    return loadKnowledgeBaseFromMysql({ mysqlConfig });
  }

  if (storageMode === "sqlite") {
    return loadKnowledgeBaseFromDb({ dbPath });
  }

  return [];
}

async function persistKnowledgeBaseToDatabase(
  storageMode,
  entries,
  { dbPath, mysqlConfig } = {}
) {
  if (!entries?.length) return;

  if (storageMode === "mysql") {
    await saveKnowledgeBaseEntriesToMysql(entries, { mysqlConfig });
    return;
  }

  if (storageMode === "sqlite") {
    await saveKnowledgeBaseEntries(entries, { dbPath });
  }
}

function readFileSample(filePath, bytes = 4096) {
  const buffer = Buffer.alloc(bytes);
  const fd = fs.openSync(filePath, "r");

  try {
    const bytesRead = fs.readSync(fd, buffer, 0, bytes, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

async function loadKnowledgeBaseFile(filePath, sampleCreator, label) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  ${label} не найдена. Создаю пример...`);
    sampleCreator(filePath);
  }

  const fileSizeBytes = fs.statSync(filePath).size;
  const fileExt = path.extname(filePath).toLowerCase();
  const sampleChunk = readFileSample(filePath, Math.min(fileSizeBytes, 4096));
  const trimmedSample = sampleChunk.trimStart();

  // Если это NDJSON (по расширению или по сигнатуре) — сразу идём в потоковый разбор
  // и не тащим весь файл в память, чтобы избежать переполнения стека в JSON.parse.
  const looksLikeNdjson =
    fileExt === ".jsonl" || (trimmedSample && trimmedSample[0] !== "[");

  if (looksLikeNdjson) {
    return parseNdjsonStream(filePath, label);
  }

  // Для больших файлов (>5 МБ) применяем потоковый парсер массива, минуя JSON.parse
  // чтобы избежать RangeError: Maximum call stack size exceeded.
  if (fileSizeBytes > 5 * 1024 * 1024) {
    return parseJsonArrayStream(filePath, label);
  }

  const data = fs.readFileSync(filePath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch (error) {
    // Для очень больших или повреждённых файлов JSON.parse может падать
    // с RangeError: Maximum call stack size exceeded. В таком случае
    // пробуем безопасный потоковый разбор.
    if (error instanceof RangeError) {
      console.warn(
        `⚠️  ${label}: стандартный парсинг не удался (${error.message}). ` +
          "Перехожу на итеративный разбор."
      );

      try {
        parsed = await safeStreamingParse(data, label);
      } catch (fallbackError) {
        console.warn(
          `⚠️  Потоковый разбор в памяти не удался (${fallbackError.message}). ` +
            "Перехожу на файловый стрим."
        );
        parsed = await parseJsonArrayStream(filePath, label);
      }
    } else {
      throw error;
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} должна быть массивом статей`);
  }

  return parsed;
}

async function safeStreamingParse(rawData, label) {
  const trimmed = rawData.trim();

  // Большинство наших файлов — это JSON-массив объектов.
  // Если файл не начинается с "[", попробуем распознать его как NDJSON.
  if (!trimmed.startsWith("[")) {
    return parseNdjsonInMemory(trimmed, label);
  }

  const result = [];

  let buffer = "";
  let depth = 0; // глубина вложенности текущего элемента (без внешнего массива)
  let inString = false;
  let escaped = false;
  let arrayStarted = false;

  const pushBuffer = () => {
    const chunk = buffer.trim();
    buffer = "";

    if (!chunk) return;

    try {
      result.push(JSON.parse(chunk));
    } catch (error) {
      console.warn(
        `⚠️  Фрагмент ${result.length + 1} в ${label} пропущен: ${error.message}`
      );
    }
  };

  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i];

    // ждём открывающую скобку массива
    if (!arrayStarted) {
      if (char === "[") {
        arrayStarted = true;
      }
      continue;
    }

    // закрывающая скобка массива — завершаем разбор
    if (!inString && depth === 0 && char === "]") {
      pushBuffer();
      break;
    }

    buffer += char;

    if (inString) {
      escaped = char === "\\" && !escaped;
      if (char === "\"" && !escaped) {
        inString = false;
      }
      continue;
    }

    if (char === "\"" && !escaped) {
      inString = true;
      escaped = false;
      continue;
    }

    if (char === "{" || char === "[") depth += 1;
    if (char === "}" || char === "]") depth -= 1;

    if (char === "," && depth === 0) {
      pushBuffer();
    }
  }

  return result;
}

async function parseJsonArrayStream(filePath, label) {
  const result = [];

  let buffer = "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  let arrayStarted = false;

  const pushBuffer = () => {
    const chunk = buffer.trim();
    buffer = "";

    if (!chunk) return;

    try {
      result.push(JSON.parse(chunk));
    } catch (error) {
      console.warn(
        `⚠️  Фрагмент ${result.length + 1} в ${label} пропущен: ${error.message}`
      );
    }
  };

  const stream = fs.createReadStream(filePath, { encoding: "utf8" });

  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i += 1) {
      const char = chunk[i];

      if (!arrayStarted) {
        if (char === "[") {
          arrayStarted = true;
        }
        continue;
      }

      if (!inString && depth === 0 && char === "]") {
        pushBuffer();
        return result;
      }

      buffer += char;

      if (inString) {
        escaped = char === "\\" && !escaped;
        if (char === "\"" && !escaped) {
          inString = false;
        }
        continue;
      }

      if (char === "\"" && !escaped) {
        inString = true;
        escaped = false;
        continue;
      }

      if (char === "{" || char === "[") depth += 1;
      if (char === "}" || char === "]") depth -= 1;

      if (char === "," && depth === 0) {
        pushBuffer();
      }
    }
  }

  pushBuffer();
  return result;
}

async function parseNdjsonStream(filePath, label) {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  return parseNdjsonGenerator(stream, label);
}

function parseNdjsonInMemory(rawData, label) {
  const lines = rawData.split(/\r?\n/);
  return parseNdjsonGenerator(lines, label);
}

async function parseNdjsonGenerator(iterable, label) {
  const result = [];
  let idx = 0;

  for await (const rawLine of iterable) {
    const line = rawLine.trim();
    if (!line) continue;
    idx += 1;

    try {
      result.push(JSON.parse(line));
    } catch (lineError) {
      console.warn(
        `⚠️  Строка ${idx} в ${label} пропущена: ${lineError.message}`
      );
    }
  }

  return result;
}

function createSampleProjectKnowledgeBase(kbPath) {
  const sampleKB = [
    {
      id: "proj_001",
      title: "Общая информация о проекте",
      aliases: ["мой проект", "основы проекта"],
      content:
        "Эта база знаний хранит сведения, относящиеся к вашему проекту. Добавляйте сюда все материалы, которые должны использоваться ассистентом при ответах о продукте, команде и технологиях.",
      tags: ["проект", "основы", "структура"],
      category: "Проект",
      lastUpdated: new Date().toISOString().split("T")[0],
    },
  ];

  fs.writeFileSync(kbPath, JSON.stringify(sampleKB, null, 2));
  console.log(`📝 Создан пример проектной базы знаний: ${kbPath}`);
}

function createSampleGeneralKnowledgeBase(kbPath) {
  const sampleKB = [
    {
      id: "gen_001",
      title: "Общие сведения об искусственном интеллекте",
      aliases: ["что такое ИИ", "определение искусственного интеллекта", "AI"],
      content:
        "Искусственный интеллект (ИИ) — область информатики, посвящённая созданию систем, способных выполнять задачи, требующие человеческого интеллекта. Ключевые направления включают машинное обучение, обработку естественного языка, компьютерное зрение и экспертные системы.",
      tags: ["ИИ", "искусственный интеллект", "машинное обучение", "основы"],
      category: "Общие темы",
      lastUpdated: new Date().toISOString().split("T")[0],
    },
  ];

  fs.writeFileSync(kbPath, JSON.stringify(sampleKB, null, 2));
  console.log(`📝 Создан пример общей базы знаний: ${kbPath}`);
}

function appendSource(items, source) {
  return items.map((item, index) => {
    const enriched = { ...item, source };

    if ((index + 1) % 1000 === 0) {
      console.log(
        `📥 Загружено ${index + 1} записей из источника "${source}" в оперативную память`
      );
    }

    return enriched;
  });
}

function validateAndEnrichKnowledgeBase(kb, { withProgress = false } = {}) {
  return kb.map((item, index) => {
    const enriched = {
      id: item.id || `auto_${index}`,
      title: item.title || "Без названия",
      aliases: Array.isArray(item.aliases) ? item.aliases : [],
      content: item.content || "",
      tags: Array.isArray(item.tags) ? item.tags : [],
      category: item.category || "общее",
      lastUpdated: item.lastUpdated || new Date().toISOString().split("T")[0],
      contentLength: (item.content || "").length,
      aliasCount: Array.isArray(item.aliases) ? item.aliases.length : 0,
      tagCount: Array.isArray(item.tags) ? item.tags.length : 0,
      source: item.source || "unknown",
    };

    if (withProgress && (index + 1) % 1000 === 0) {
      console.log(
        `⚡️ В оперативную память загружено ${index + 1} нормализованных записей`
      );
    }

    return enriched;
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

function getKnowledgeBaseCache() {
  return knowledgeStore.combined || [];
}

function getKnowledgeBaseStatus() {
  return knowledgeStore.status;
}

function resetKnowledgeBaseCache() {
  knowledgeStore = {
    projectKnowledgeBase: [],
    generalKnowledgeBase: [],
    russianDatasets: {},
    russianDataset: [],
    combined: [],
    status: "idle",
    loadedAt: null,
    loadTimeMs: 0,
  };
}

function getKnowledgeStore() {
  return knowledgeStore;
}

module.exports = {
  loadKnowledgeBase,
  reloadKnowledgeBase,
  getKnowledgeBaseCache,
  getKnowledgeBaseStatus,
  resetKnowledgeBaseCache,
  getKnowledgeStore,
  validateAndEnrichKnowledgeBase,
  createSampleProjectKnowledgeBase,
  createSampleGeneralKnowledgeBase,
  createEmptyKnowledgeBase,
};
