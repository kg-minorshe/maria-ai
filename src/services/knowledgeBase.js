const fs = require("fs");
const path = require("path");

function resolveKnowledgePaths(rootDir) {
  const knowledgeDir = path.join(rootDir, "data", "knowledge");

  return {
    project: path.join(knowledgeDir, "knowledge-base-project.json"),
    general: path.join(knowledgeDir, "knowledge-base-general.json"),
  };
}

function loadKnowledgeBase({ projectPath, generalPath, rootDir = path.resolve(__dirname, "../..") } = {}) {
  const paths = resolveKnowledgePaths(rootDir);

  const resolvedProjectPath = projectPath || process.env.KB_PROJECT_PATH || paths.project;
  const resolvedGeneralPath = generalPath || process.env.KB_GENERAL_PATH || paths.general;

  const projectKnowledgeBase = loadKnowledgeBaseFile(
    resolvedProjectPath,
    createSampleProjectKnowledgeBase,
    "проектная база знаний"
  );

  const generalKnowledgeBase = loadKnowledgeBaseFile(
    resolvedGeneralPath,
    createSampleGeneralKnowledgeBase,
    "общая база знаний"
  );

  const knowledgeBase = validateAndEnrichKnowledgeBase([
    ...projectKnowledgeBase,
    ...generalKnowledgeBase,
  ]);

  return {
    knowledgeBase,
    projectKnowledgeBase,
    generalKnowledgeBase,
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

module.exports = {
  loadKnowledgeBase,
  validateAndEnrichKnowledgeBase,
  createSampleProjectKnowledgeBase,
  createSampleGeneralKnowledgeBase,
  createEmptyKnowledgeBase,
};
