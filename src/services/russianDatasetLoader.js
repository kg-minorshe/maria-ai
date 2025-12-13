const fs = require("fs");
const path = require("path");
const readline = require("readline");

const DEFAULT_DATASET_PATH = path.join(
  path.resolve(__dirname, "../.."),
  "data",
  "knowledge",
  "russian-open-qa.jsonl"
);

const DEFAULT_LIMIT_PER_DATASET = null;

function normalizePositiveLimit(value, fallback = DEFAULT_LIMIT_PER_DATASET) {
  const sanitized =
    typeof value === "string" ? value.replace(/[_\s,]+/g, "") : value;
  const limit = Number(sanitized);

  if (Number.isFinite(limit) && limit > 0) {
    return Math.floor(limit);
  }

  return fallback ?? null;
}

/**
 * Поддерживаем:
 * - один файл *.jsonl
 * - каталог: прочитаем все *.jsonl внутри
 * - массив путей
 * - относительные пути (от rootDir)
 */

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function toAbs(rootDir, p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.join(rootDir, p);
}

function listJsonlFiles(dirAbs) {
  if (!fs.existsSync(dirAbs)) return [];
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".jsonl"))
    .map((e) => path.join(dirAbs, e.name))
    .sort();
}

function ensureDatasetExists(datasetPath = DEFAULT_DATASET_PATH) {
  if (fs.existsSync(datasetPath)) return;

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
  fs.mkdirSync(path.dirname(datasetPath), { recursive: true });
  fs.writeFileSync(datasetPath, sampleContent, "utf8");
  console.log(
    `📝 Создан пример русского датасета по пути ${datasetPath}. Замените его реальными данными.`
  );
}

async function readJsonl(datasetPath, { limit } = {}) {
  const fileStream = fs.createReadStream(datasetPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const result = [];
  let lineNumber = 0;

  try {
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
        console.log(`📥 Загружено ${result.length} записей из ${path.basename(datasetPath)} в память`);
      }

      if (typeof limit === "number" && limit > 0 && result.length >= limit) {
        console.log(
          `⏩ Достигнут лимит загрузки ${limit} строк для ${path.basename(datasetPath)}, дальнейшее чтение остановлено`
        );
        break;
      }
    }
  } finally {
    rl.close();
    fileStream.destroy();
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

/**
 * Загружает ОДИН датасет (файл jsonl).
 * Оставляем для обратной совместимости.
 */
async function loadRussianDataset({
  rootDir = path.resolve(__dirname, "../.."),
  datasetPath,
  limit,
} = {}) {
  const resolvedDatasetPath = toAbs(
    rootDir,
    datasetPath || process.env.KB_RUSSIAN_PATH || DEFAULT_DATASET_PATH
  );

  // если это каталог — возьмём первый *.jsonl, чтобы старый контракт не ломался
  if (isDirectory(resolvedDatasetPath)) {
    const files = listJsonlFiles(resolvedDatasetPath);
    if (!files.length) return [];
    return loadRussianDataset({ rootDir, datasetPath: files[0], limit });
  }

  ensureDatasetExists(resolvedDatasetPath);

  if (!fs.existsSync(resolvedDatasetPath)) {
    console.warn(`⚠️  Русский датасет не найден: ${resolvedDatasetPath}`);
    return [];
  }

  const normalizedLimit = normalizePositiveLimit(limit);
  const rawEntries = await readJsonl(resolvedDatasetPath, { limit: normalizedLimit });
  const normalized = rawEntries.map(normalizeDatasetEntry);
  return typeof normalizedLimit === "number" && normalizedLimit > 0
    ? normalized.slice(0, normalizedLimit)
    : normalized;
}

/**
 * ✅ НОВОЕ: грузим НЕСКОЛЬКО датасетов.
 *
 * inputs:
 *  - массив путей (файлы или каталоги)
 *  - относительные пути разрешаются от rootDir
 *
 * возвращаем:
 *  - datasets: { [key]: entries[] }
 *  - all: плоский массив
 */
async function loadRussianDatasets({
  rootDir = path.resolve(__dirname, "../.."),
  inputs = [],
  limitPerDataset,
} = {}) {
  const expandedFiles = [];

  const normalizedInputs = Array.isArray(inputs) ? inputs : [inputs];

  for (const input of normalizedInputs) {
    if (!input) continue;

    const abs = toAbs(rootDir, input);

    if (isDirectory(abs)) {
      const files = listJsonlFiles(abs);
      for (const f of files) expandedFiles.push(f);
      continue;
    }

    // обычный файл
    expandedFiles.push(abs);
  }

  // Если ничего не дали — ведём себя как раньше
  if (!expandedFiles.length) {
    expandedFiles.push(toAbs(rootDir, DEFAULT_DATASET_PATH));
  }

  // Если есть только дефолтный файл и его нет — создадим пример
  if (expandedFiles.length === 1) {
    ensureDatasetExists(expandedFiles[0]);
  }

  const effectiveLimit = normalizePositiveLimit(limitPerDataset);
  const sanitizedInput =
    typeof limitPerDataset === "string"
      ? limitPerDataset.replace(/[_\s,]+/g, "")
      : limitPerDataset;
  const parsedInput = Number(sanitizedInput);

  if (typeof limitPerDataset !== "undefined") {
    if (!Number.isFinite(parsedInput) || parsedInput <= 0) {
      console.warn(
        `⚠️  Некорректное значение KB_RUSSIAN_LIMIT (${limitPerDataset}). Использую безопасное значение ${effectiveLimit}.`
      );
    } else if (Math.floor(parsedInput) !== effectiveLimit) {
      console.warn(
        `⚠️  KB_RUSSIAN_LIMIT (${limitPerDataset}) нормализован до ${effectiveLimit}.`
      );
    }
  }

  const datasets = {};
  const all = [];

  const pushBatch = (target, source, batchSize = 10000, label = "") => {
    if (!Array.isArray(source) || !source.length) return;

    for (let i = 0; i < source.length; i += batchSize) {
      const slice = source.slice(i, i + batchSize);
      target.push(...slice);

      if ((target.length % batchSize === 0 || i + batchSize >= source.length) && label) {
        console.log(
          `📦 Добавлено ${target.length} записей в общий русский датасет (${label})`
        );
      }
    }
  };

  for (const fileAbs of expandedFiles) {
    if (!fs.existsSync(fileAbs)) {
      console.warn(`⚠️  Русский датасет не найден: ${fileAbs}`);
      continue;
    }

    const key = path.basename(fileAbs, path.extname(fileAbs));
    const entries = await loadRussianDataset({
      rootDir,
      datasetPath: fileAbs,
      limit: effectiveLimit,
    });

    datasets[key] = entries;
    pushBatch(all, entries, 10000, key);
  }

  return { datasets, all };
}

module.exports = {
  loadRussianDataset,
  loadRussianDatasets,
  DEFAULT_DATASET_PATH,
  DEFAULT_LIMIT_PER_DATASET,
  normalizePositiveLimit,
};
