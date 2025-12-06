#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (key === '--input') parsed.input = value;
    if (key === '--output') parsed.output = value;
    if (key === '--limit') parsed.limit = Number(value);
  }

  if (!parsed.input || !parsed.output) {
    console.error('Usage: node scripts/import_sberquad.js --input <path> --output <path> [--limit 2000]');
    process.exit(1);
  }

  return parsed;
}

function loadSberQuAD(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const candidates = [
    parsed?.data,
    parsed?.train,
    parsed?.validation,
    parsed?.dataset?.data,
  ];

  const dataArray = candidates.find(Array.isArray);

  if (!dataArray) {
    const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
    throw new Error(
      `Файл не похож на SberQuAD: не найден массив data/train/validation. Найдены ключи: ${keys.join(', ')}`,
    );
  }

  return dataArray;
}

function convertToKnowledgeBase(data, limit) {
  const entries = [];

  data.forEach((topic, topicIndex) => {
    const title = topic.title || `SberQuAD-${topicIndex}`;

    topic.paragraphs?.forEach((paragraph, paragraphIndex) => {
      const context = paragraph.context || '';

      paragraph.qas?.forEach((qa, qaIndex) => {
        entries.push({
          id: `sberquad_${topicIndex}_${paragraphIndex}_${qaIndex}`,
          title: `${title}: ${qa.question}`.slice(0, 180),
          aliases: [qa.question],
          content: context,
          tags: ['sberquad', 'russian'],
          category: 'Русский датасет',
          lastUpdated: new Date().toISOString().split('T')[0],
        });
      });
    });
  });

  return typeof limit === 'number' && limit > 0 ? entries.slice(0, limit) : entries;
}

function saveJsonl(entries, outPath) {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = entries.map((entry) => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(outPath, content, 'utf8');
}

function main() {
  const args = parseArgs();
  const dataset = loadSberQuAD(args.input);
  const entries = convertToKnowledgeBase(dataset, args.limit);
  saveJsonl(entries, args.output);
  console.log(`Импортировано ${entries.length} примеров в ${args.output}`);
}

if (require.main === module) {
  main();
}