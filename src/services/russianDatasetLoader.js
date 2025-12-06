const fs = require("fs");
const path = require("path");
const readline = require("readline");

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

async function readJsonl(datasetPath, { limit } = {}) {
  const fileStream = fs.createReadStream(datasetPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const result = [];
  let lineNumber = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    lineNumber += 1;

    try {
      result.push(JSON.parse(trimmed));
    } catch (error) {
      console.warn(`⚠️  Строка ${lineNumber} в ${datasetPath} не распознана и будет пропущена`);
    }

    if (result.length % 1000 === 0) {
      console.log(`📥 Загружено ${result.length} записей русского датасета в память`);
    }

    if (typeof limit === "number" && limit > 0 && result.length >= limit) {
      console.log(
        `⏩ Достигнут лимит загрузки ${limit} строк русского датасета, дальнейшее чтение остановлено`
      );
      break;
    }
  }

  return result;
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

async function loadRussianDataset({ rootDir = path.resolve(__dirname, "../.."), datasetPath, limit } = {}) {
  const resolvedDatasetPath = datasetPath || process.env.KB_RUSSIAN_PATH || DEFAULT_DATASET_PATH;
  ensureDatasetExists(resolvedDatasetPath);

  if (!fs.existsSync(resolvedDatasetPath)) {
    console.warn(`⚠️  Русский датасет не найден: ${resolvedDatasetPath}`);
    return [];
  }

  const rawEntries = await readJsonl(resolvedDatasetPath, { limit });
  const normalized = rawEntries.map(normalizeDatasetEntry);
  return typeof limit === "number" && limit > 0 ? normalized.slice(0, limit) : normalized;
}

module.exports = {
  loadRussianDataset,
  DEFAULT_DATASET_PATH,
};
