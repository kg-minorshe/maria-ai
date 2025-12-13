#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const readline = require("readline");

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (key === "--input") parsed.input = value;
    if (key === "--output") parsed.output = value;
    if (key === "--limit") parsed.limit = Number(value);
  }

  if (!parsed.input || !parsed.output) {
    console.error(
      "Usage: node scripts/import_yandexq_jsonl.js --input <path> --output <path> [--limit 2000]"
    );
    process.exit(1);
  }

  return parsed;
}

function htmlToText(html) {
  if (!html || typeof html !== "string") return "";
  return (
    html
      // убираем теги
      .replace(/<[^>]*>/g, " ")
      // html entities (минимально полезные)
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      // схлопываем пробелы
      .replace(/\s+/g, " ")
      .trim()
  );
}

function pickText(item) {
  // Приоритет: plainText -> formattedText (html) -> text -> ""
  if (typeof item?.plainText === "string" && item.plainText.trim()) return item.plainText.trim();
  if (typeof item?.formattedText === "string" && item.formattedText.trim())
    return htmlToText(item.formattedText);
  if (typeof item?.text === "string" && item.text.trim()) return item.text.trim();
  return "";
}

function buildAnswersBlock(answers) {
  if (!Array.isArray(answers) || answers.length === 0) return "";

  const parts = answers
    .map((a, idx) => {
      const aText = pickText(a) || "";
      if (!aText) return "";
      return `Ответ ${idx + 1}: ${aText}`;
    })
    .filter(Boolean);

  return parts.length ? parts.join("\n\n") : "";
}

function toDateOnly(iso) {
  if (!iso || typeof iso !== "string") return new Date().toISOString().slice(0, 10);
  // ожидаем ISO вида 2020-11-24T10:24:11... -> берем YYYY-MM-DD
  const m = iso.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : new Date().toISOString().slice(0, 10);
}

function normalizeEntry(item, index) {
  const srcId =
    (typeof item?.id === "string" && item.id) ||
    (typeof item?.id2 === "string" && item.id2) ||
    (typeof item?.id2 === "number" && String(item.id2)) ||
    `idx_${index}`;

  const questionTitle = (item?.title || "").toString().trim();
  const questionBody = pickText(item);

  const answersBlock = buildAnswersBlock(item?.answers);
  const tags = Array.isArray(item?.tags) ? item.tags.filter((t) => typeof t === "string") : [];

  // content: вопрос (title + тело) + ответы
  const qParts = [];
  if (questionTitle) qParts.push(`Вопрос: ${questionTitle}`);
  if (questionBody && questionBody !== questionTitle) qParts.push(questionBody);

  const contentParts = [];
  if (qParts.length) contentParts.push(qParts.join("\n\n"));
  if (answersBlock) contentParts.push(answersBlock);

  const content = contentParts.join("\n\n---\n\n").trim();

  // aliases: чтобы поиск по вопросу работал
  const aliases = questionTitle ? [questionTitle] : [];

  const lastUpdated = toDateOnly(item?.updated || item?.created);

  return {
    id: `yandexq_${srcId}`,
    title: (questionTitle || `YandexQ-${index}`).slice(0, 180),
    aliases,
    content,
    tags: Array.from(new Set(["yandexq", "russian", ...tags])).slice(0, 30),
    category: "Русский датасет",
    lastUpdated,
  };
}

async function convertJsonlToKnowledgeBase(inPath, outPath, limit) {
  const inStream = fs.createReadStream(inPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: inStream, crlfDelay: Infinity });

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const out = fs.createWriteStream(outPath, { encoding: "utf8" });

  let count = 0;
  let lineNo = 0;

  for await (const line of rl) {
    lineNo += 1;
    const trimmed = line.trim();
    if (!trimmed) continue;

    let item;
    try {
      item = JSON.parse(trimmed);
    } catch (e) {
      // пропускаем битые строки, но пишем предупреждение
      console.error(`WARN: cannot parse JSON at line ${lineNo}`);
      continue;
    }

    // фильтры: можно выкидывать deleted/banned при желании
    if (item?.deleted === true) continue;
    if (item?.banned === true) continue;

    const entry = normalizeEntry(item, lineNo);

    // если совсем пусто — пропускаем
    if (!entry.content) continue;

    out.write(JSON.stringify(entry) + "\n");
    count += 1;

    if (typeof limit === "number" && limit > 0 && count >= limit) break;
  }

  out.end();
  return count;
}

async function main() {
  const args = parseArgs();
  const imported = await convertJsonlToKnowledgeBase(args.input, args.output, args.limit);
  if (imported === 0) {
    throw new Error("Не импортировано ни одной записи (проверь входной JSONL и фильтры).");
  }
  console.log(`Импортировано ${imported} примеров в ${args.output}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("ERROR:", e?.message || e);
    process.exit(1);
  });
}
