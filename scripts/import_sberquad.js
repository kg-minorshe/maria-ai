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

  // Hugging Face выгрузка может содержать массив rows, где каждое значение находится в поле row
  const rowsAsArray = Array.isArray(parsed?.rows)
    ? parsed.rows.map((item) => item.row ?? item)
    : null;

  const candidates = [
    rowsAsArray,
    parsed?.data,
    parsed?.train,
    parsed?.validation,
    parsed?.dataset?.data,
  ].filter(Boolean);

  const looksLikeQaItem = (item) =>
    item && (item.paragraphs || item.context || item.question || item.qas);

  const dataArray = candidates.find((arr) => Array.isArray(arr) && arr.some(looksLikeQaItem));

  if (!dataArray) {
    const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
    throw new Error(
      `Файл не похож на SberQuAD: не найден массив rows/data/train/validation. Найдены ключи: ${keys.join(', ')}`,
    );
  }

  return dataArray;
}

function buildContent(context = '', answers) {
  const answerText = Array.isArray(answers?.text) && answers.text.length > 0 ? answers.text[0] : '';

  if (!context && answerText) {
    return `Ответ: ${answerText}`;
  }

  if (context && answerText) {
    return `${context}\n\nОтвет: ${answerText}`;
  }

  return context;
}

function normalizeEntry(topic, { topicIndex, paragraphIndex, qaIndex } = {}) {
  const idParts = ['sberquad'];
  const title = topic.title || `SberQuAD-${topicIndex ?? 0}`;

  if (topicIndex !== undefined) idParts.push(topicIndex);
  if (paragraphIndex !== undefined) idParts.push(paragraphIndex);
  if (qaIndex !== undefined) idParts.push(qaIndex);
  if (topic.id !== undefined) idParts.push(topic.id);

  const question = topic.question || topic.q ?? '';
  const content = buildContent(topic.context, topic.answers);

  return {
    id: idParts.join('_'),
    title: `${title}${question ? ': ' + question : ''}`.slice(0, 180),
    aliases: question ? [question] : [],
    content,
    tags: ['sberquad', 'russian'],
    category: 'Русский датасет',
    lastUpdated: new Date().toISOString().split('T')[0],
  };
}

function convertToKnowledgeBase(data, limit) {
  const entries = [];

  data.forEach((topic, topicIndex) => {
    if (Array.isArray(topic.paragraphs)) {
      topic.paragraphs.forEach((paragraph, paragraphIndex) => {
        paragraph.qas?.forEach((qa, qaIndex) => {
          entries.push(normalizeEntry({ ...qa, title: topic.title, context: paragraph.context }, {
            topicIndex,
            paragraphIndex,
            qaIndex,
          }));
        });
      });
      return;
    }

    if (topic.context || topic.question || topic.q) {
      entries.push(normalizeEntry(topic, { topicIndex }));
    }
  });

  const finalEntries = typeof limit === 'number' && limit > 0 ? entries.slice(0, limit) : entries;

  if (finalEntries.length === 0) {
    throw new Error('Не удалось сформировать ни одной записи: проверьте поля context/question/answers в исходных данных');
  }

  return finalEntries;
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