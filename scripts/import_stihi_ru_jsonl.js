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
      "Usage: node scripts/import_stihi_ru_jsonl.js --input <path> --output <path> [--limit 2000]"
    );
    process.exit(1);
  }

  return parsed;
}

function normalizeNewlines(s) {
  return (s ?? "").toString().replace(/\r\n/g, "\n").trim();
}

function firstLine(s) {
  const t = normalizeNewlines(s);
  if (!t) return "";
  return t.split("\n").map((x) => x.trim()).filter(Boolean)[0] || "";
}

function normalizeEntry(item, index) {
  const poetry = normalizeNewlines(item?.poetry);
  const prose = normalizeNewlines(item?.prose);

  const titleBase = firstLine(poetry) || firstLine(prose) || `Stihi-${index}`;
  const title = `Стихи: ${titleBase}`.slice(0, 180);

  const contentParts = [];
  if (poetry) contentParts.push(`Поэзия:\n${poetry}`);
  if (prose) contentParts.push(`Проза:\n${prose}`);

  const content = contentParts.join("\n\n---\n\n").trim();

  return {
    id: `stihi_ru_${index}`,
    title,
    aliases: titleBase ? [titleBase] : [],
    content,
    tags: ["stihi", "russian", "poetry", "paraphrase"],
    category: "Русский датасет",
    lastUpdated: new Date().toISOString().split("T")[0],
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
    } catch {
      console.error(`WARN: cannot parse JSON at line ${lineNo}`);
      continue;
    }

    // если строка пустая по смыслу — пропускаем
    if (!item?.poetry && !item?.prose) continue;

    const entry = normalizeEntry(item, lineNo);
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
    throw new Error("Не импортировано ни одной записи (проверь входной JSONL).");
  }
  console.log(`Импортировано ${imported} примеров в ${args.output}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("ERROR:", e?.message || e);
    process.exit(1);
  });
}
