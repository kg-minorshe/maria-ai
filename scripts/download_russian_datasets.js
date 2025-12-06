#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const DATASETS = {
  sberquad: {
    description: 'SberQuAD (RU SQuAD 1.1) от AI-Forever (Hugging Face, чаще требует токен)',
    files: [
      'https://huggingface.co/datasets/ai-forever/sberquad/resolve/main/train-v1.1.json',
      'https://huggingface.co/datasets/ai-forever/sberquad/resolve/main/dev-v1.1.json',
    ],
    requiresAuthHint:
      'Если видите 401, передайте токен HF через --token или переменные HF_TOKEN/HUGGINGFACE_TOKEN.',
  },
  tudresden_tydiqa_ru: {
    description: 'TyDiQA-GoldP русская часть (Hugging Face, обычно тоже нужен токен)',
    files: [
      'https://huggingface.co/datasets/tudarmstadt-radar/tydiqa/resolve/main/tydiqa-goldp-v1.1-train-ru.json',
      'https://huggingface.co/datasets/tudarmstadt-radar/tydiqa/resolve/main/tydiqa-goldp-v1.1-dev-ru.json',
    ],
    requiresAuthHint:
      'Если получите 401, добавьте токен HF (см. --token или переменные HF_TOKEN/HUGGINGFACE_TOKEN).',
  },
  ru_open_qa_demo: {
    description: 'Небольшой встроенный демо-корпус без скачивания (russian-open-qa.jsonl)',
    localCopy: path.join('data', 'knowledge', 'russian-open-qa.jsonl'),
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    dataset: 'sberquad',
    outDir: path.join('data', 'downloads'),
    token: process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN,
  };

  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    const next = args[i + 1];

    if (key === '--dataset' && next) {
      parsed.dataset = next.toLowerCase();
      i++;
      continue;
    }

    if (key === '--outDir' && next) {
      parsed.outDir = next;
      i++;
      continue;
    }

    if (key === '--token' && next) {
      parsed.token = next;
      i++;
    }
  }

  return parsed;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function downloadFile(url, dest, token, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const requestOptions = new URL(url);
    requestOptions.headers = {
      'User-Agent': 'maria-ai-ru-datasets-downloader',
    };
    if (token) {
      requestOptions.headers.Authorization = `Bearer ${token}`;
    }

    https
      .get(requestOptions, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close(() => fs.unlink(dest, () => {}));
          if (redirectCount >= 5) {
            reject(new Error('Слишком много редиректов.')); 
            return;
          }
          const nextUrl = response.headers.location.startsWith('http')
            ? response.headers.location
            : new URL(response.headers.location, url).toString();
          downloadFile(nextUrl, dest, token, redirectCount + 1).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode === 401) {
          const hint = 'Получен 401. Попробуйте передать Hugging Face токен через --token или переменные HF_TOKEN/HUGGINGFACE_TOKEN.';
          reject(new Error(hint));
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Ошибка скачивания ${url}. Код: ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

async function main() {
  const { dataset, outDir, token } = parseArgs();
  const target = DATASETS[dataset];
  if (!target) {
    console.error('Неизвестный датасет. Используйте один из:', Object.keys(DATASETS).join(', '));
    process.exit(1);
  }

  const datasetDir = path.join(outDir, dataset);
  ensureDir(datasetDir);

  if (target.localCopy) {
    const fileName = path.basename(target.localCopy);
    const dest = path.join(datasetDir, fileName);
    console.log(`Копирую встроенный датасет ${fileName} в ${dest}`);
    fs.copyFileSync(target.localCopy, dest);
    console.log('Готово. Скачивание не требовалось.');
    return;
  }

  console.log(`Скачиваю ${dataset}: ${target.description}`);
  if (token) {
    console.log('Использую Hugging Face токен (Authorization: Bearer).');
  } else if (target.requiresAuthHint) {
    console.log(target.requiresAuthHint);
  }

  for (const url of target.files) {
    const fileName = path.basename(new URL(url).pathname);
    const dest = path.join(datasetDir, fileName);
    console.log(`  -> ${fileName}`);
    await downloadFile(url, dest, token);
  }

  console.log(`Файлы сохранены в ${datasetDir}`);
  if (dataset === 'sberquad') {
    console.log('\nДалее конвертируйте SberQuAD в формат базы знаний:');
    console.log(
      `  node scripts/import_sberquad.js --input ${path.join(datasetDir, 'train-v1.1.json')} --output data/knowledge/russian-open-qa.jsonl --limit 2000`
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Ошибка:', err.message);
    process.exit(1);
  });
}
