const fs = require("fs");
const path = require("path");

const DEFAULT_DATASET_PATH = path.join(
  path.resolve(__dirname, "../.."),
  "data",
  "knowledge",
  "russian-open-qa.jsonl"
);

function ensureDatasetExists(datasetPath = DEFAULT_DATASET_PATH) {
  if (fs.existsSync(datasetPath)) {
    return;
  }

  const sampleEntries = [
    {
      id: "ru_sample_001",
      title: "История искусственного интеллекта",
      aliases: ["краткая история ии", "этапы развития ии"],
      content:
        "Искусственный интеллект в России активно развивается с 1950-х годов: от кибернетики и первых ЭВМ до современных трансформеров и локальных моделей для НЛП.",
      tags: ["история", "ИИ", "Россия"],
      category: "Русский датасет",
    },
    {
      id: "ru_sample_002",
      title: "Практики безопасной эксплуатации моделей",
      aliases: ["safety ai", "безопасность модели"],
      content:
        "Для надёжного вывода русскоязычных моделей рекомендуют изоляцию среды исполнения, локальное хранение весов и регулярную проверку датасета на персональные данные.",
      tags: ["безопасность", "практики", "модель"],
      category: "Русский датасет",
    },
  ];

  const sampleContent = sampleEntries.map((entry) => JSON.stringify(entry)).join("\n");
  fs.writeFileSync(datasetPath, sampleContent, "utf8");
  console.log(
    `📝 Создан пример русского датасета по пути ${datasetPath}. Замените его реальными данными (например, SberQuAD).`
  );
}

function readJsonl(datasetPath) {
  const content = fs.readFileSync(datasetPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        console.warn(`⚠️  Строка ${index + 1} в ${datasetPath} не распознана и будет пропущена`);
        return null;
      }
    })
    .filter(Boolean);
}

function normalizeDatasetEntry(entry, index) {
  return {
    id: entry.id || `russian_dataset_${index}`,
    title: entry.title || entry.question || "Русский корпус",
    aliases: Array.isArray(entry.aliases)
      ? entry.aliases
      : entry.question
      ? [entry.question]
      : [],
    content: entry.content || entry.context || entry.answer || "",
    tags: Array.isArray(entry.tags) ? entry.tags : ["russian", "dataset"],
    category: entry.category || "Русский датасет",
    lastUpdated: entry.lastUpdated || new Date().toISOString().split("T")[0],
  };
}

function loadRussianDataset({ rootDir = path.resolve(__dirname, "../.."), datasetPath, limit } = {}) {
  const resolvedDatasetPath = datasetPath || process.env.KB_RUSSIAN_PATH || DEFAULT_DATASET_PATH;
  ensureDatasetExists(resolvedDatasetPath);

  if (!fs.existsSync(resolvedDatasetPath)) {
    console.warn(`⚠️  Русский датасет не найден: ${resolvedDatasetPath}`);
    return [];
  }

  const rawEntries = readJsonl(resolvedDatasetPath);
  const normalized = rawEntries.map(normalizeDatasetEntry);
  return typeof limit === "number" && limit > 0 ? normalized.slice(0, limit) : normalized;
}

module.exports = {
  loadRussianDataset,
  DEFAULT_DATASET_PATH,
};
