const fs = require("fs");
const path = require("path");
const { loadRussianDataset } = require("./russianDatasetLoader");
const {
  saveKnowledgeBaseEntries,
  loadKnowledgeBaseFromDb,
  countKnowledgeBaseEntries,
} = require("./knowledgeBaseStorage");

let cachedKnowledgeBase = null;
let cachedSources = {
  projectKnowledgeBase: [],
  generalKnowledgeBase: [],
  russianDataset: [],
};
let knowledgeBaseStatus = "idle";

function resolveKnowledgePaths(rootDir) {
  const knowledgeDir = path.join(rootDir, "data", "knowledge");

  return {
    project: path.join(knowledgeDir, "knowledge-base-project.json"),
    general: path.join(knowledgeDir, "knowledge-base-general.json"),
  };
}

async function loadKnowledgeBase({ projectPath, generalPath, rootDir = path.resolve(__dirname, "../..") } = {}) {
  if (cachedKnowledgeBase) {
    console.log(
      `ℹ️  Используется предзагруженная база знаний в памяти (${cachedKnowledgeBase.length} статей)`
    );

    return {
      knowledgeBase: cachedKnowledgeBase,
      ...cachedSources,
    };
  }

  return reloadKnowledgeBase({ projectPath, generalPath, rootDir });
}

async function reloadKnowledgeBase({ projectPath, generalPath, rootDir = path.resolve(__dirname, "../..") } = {}) {
  console.log("⏳ Предзагрузка базы знаний в оперативную память...");
  knowledgeBaseStatus = "loading";

  const loaded = await loadKnowledgeBaseFromStorage({
    projectPath,
    generalPath,
    rootDir,
  });

  cachedKnowledgeBase = loaded.knowledgeBase;
  cachedSources = {
    projectKnowledgeBase: loaded.projectKnowledgeBase,
    generalKnowledgeBase: loaded.generalKnowledgeBase,
    russianDataset: loaded.russianDataset,
  };
  knowledgeBaseStatus = "ready";

  console.log(
    `✅ База знаний загружена в память (${cachedKnowledgeBase.length} статей, статус: ${knowledgeBaseStatus})`
  );

  return {
    knowledgeBase: cachedKnowledgeBase,
    ...cachedSources,
  };
}

async function loadKnowledgeBaseFromStorage({ projectPath, generalPath, rootDir = path.resolve(__dirname, "../..") } = {}) {
  const dbCount = await countKnowledgeBaseEntries();

  if (dbCount > 0) {
    console.log(
      `💾 Найдено ${dbCount} записей в базе данных. Использую данные SQLite без перечитывания файлов.`
    );

    const entries = validateAndEnrichKnowledgeBase(
      await loadKnowledgeBaseFromDb()
    );

    const projectKnowledgeBase = entries.filter(
      (entry) => entry.source === "project"
    );
    const generalKnowledgeBase = entries.filter(
      (entry) => entry.source === "general"
    );
    const russianDataset = entries.filter(
      (entry) => entry.source === "russian"
    );

    return {
      knowledgeBase: entries,
      projectKnowledgeBase,
      generalKnowledgeBase,
      russianDataset,
    };
  }

  const paths = resolveKnowledgePaths(rootDir);

  const resolvedProjectPath = projectPath || process.env.KB_PROJECT_PATH || paths.project;
  const resolvedGeneralPath = generalPath || process.env.KB_GENERAL_PATH || paths.general;
  const russianDatasetPath = process.env.KB_RUSSIAN_PATH;

  const projectKnowledgeBase = loadKnowledgeBaseFile(
    resolvedProjectPath,
    createSampleProjectKnowledgeBase,
    "проектная база знаний"
  ).map((item) => ({ ...item, source: "project" }));

  const generalKnowledgeBase = loadKnowledgeBaseFile(
    resolvedGeneralPath,
    createSampleGeneralKnowledgeBase,
    "общая база знаний"
  ).map((item) => ({ ...item, source: "general" }));

  const russianDataset = loadRussianDataset({
    rootDir,
    datasetPath: russianDatasetPath,
    limit: Number(process.env.KB_RUSSIAN_LIMIT || 750),
  }).map((item) => ({ ...item, source: "russian" }));

  const knowledgeBase = validateAndEnrichKnowledgeBase([
    ...projectKnowledgeBase,
    ...generalKnowledgeBase,
    ...russianDataset,
  ]);

  await saveKnowledgeBaseEntries(knowledgeBase);

  return {
    knowledgeBase,
    projectKnowledgeBase,
    generalKnowledgeBase,
    russianDataset,
  };
}

function loadKnowledgeBaseFile(filePath, sampleCreator, label) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  ${label} не найдена. Создаю пример...`);
    sampleCreator(filePath);
  }

  const data = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(data);

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} должна быть массивом статей`);
  }

  return parsed;
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

function validateAndEnrichKnowledgeBase(kb) {
  return kb.map((item, index) => {
    return {
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
  return cachedKnowledgeBase || [];
}

function getKnowledgeBaseStatus() {
  return knowledgeBaseStatus;
}

function resetKnowledgeBaseCache() {
  cachedKnowledgeBase = null;
  cachedSources = {
    projectKnowledgeBase: [],
    generalKnowledgeBase: [],
    russianDataset: [],
  };
  knowledgeBaseStatus = "idle";
}

module.exports = {
  loadKnowledgeBase,
  reloadKnowledgeBase,
  getKnowledgeBaseCache,
  getKnowledgeBaseStatus,
  resetKnowledgeBaseCache,
  validateAndEnrichKnowledgeBase,
  createSampleProjectKnowledgeBase,
  createSampleGeneralKnowledgeBase,
  createEmptyKnowledgeBase,
};
