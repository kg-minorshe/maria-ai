#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_URL = 'https://huggingface.co/datasets/ai-forever/sberquad/resolve/main/sberquad.tar.gz?download=1';
const FALLBACK_URL = 'https://huggingface.co/datasets/ai-forever/sberquad/resolve/main/sberquad.tar.gz';
const DIRECT_FILE_FALLBACK = [
  'https://huggingface.co/datasets/ai-forever/sberquad/resolve/main/train-v1.1.json',
  'https://huggingface.co/datasets/ai-forever/sberquad/resolve/main/dev-v1.1.json',
];
const tar = require('tar');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    url: DEFAULT_URL,
    outDir: path.join('data', 'downloads', 'sberquad'),
    extract: true,
    token: process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN,
  };

  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    const next = args[i + 1];

    if (key === '--no-extract') {
      parsed.extract = false;
      continue;
    }

    if (key === '--url' && next) {
      parsed.url = next;
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
      'User-Agent': 'maria-ai-dataset-downloader',
    };

    if (token) {
      requestOptions.headers.Authorization = `Bearer ${token}`;
    }

    https
      .get(requestOptions, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close(() => fs.unlink(dest, () => {}));
          if (redirectCount >= 5) {
            reject(new Error('Слишком много редиректов при скачивании файла.'));
            return;
          }

          const nextUrl = response.headers.location.startsWith('http')
            ? response.headers.location
            : new URL(response.headers.location, url).toString();
          downloadFile(nextUrl, dest, token, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Не удалось скачать файл. Код ответа: ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close(() => resolve(dest));
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

async function extractArchive(archivePath, targetDir) {
  await tar.x({ file: archivePath, cwd: targetDir });
  return targetDir;
}

async function main() {
  const { url, outDir, extract, token } = parseArgs();
  ensureDir(outDir);

  const archivePath = path.join(outDir, 'sberquad.tar.gz');
  console.log(`Скачиваю SberQuAD из ${url} ...`);

  try {
    await downloadFile(url, archivePath, token);
  } catch (primaryError) {
    if (url !== FALLBACK_URL && url !== DEFAULT_URL) {
      throw primaryError;
    }

    console.warn(
      'Основной URL недоступен. Пытаюсь скачать с зеркала Hugging Face:',
      FALLBACK_URL
    );
    try {
      await downloadFile(FALLBACK_URL, archivePath, token);
    } catch (fallbackError) {
      console.warn('Зеркало архива тоже недоступно. Пробую скачать файлы по отдельности...');
      await Promise.all(
        DIRECT_FILE_FALLBACK.map(async (fileUrl) => {
          const fileName = path.basename(new URL(fileUrl).pathname);
          const destPath = path.join(outDir, fileName);
          console.log(`  -> ${fileUrl}`);
          await downloadFile(fileUrl, destPath, token);
        })
      );

      console.log('Файлы train-v1.1.json и dev-v1.1.json скачаны напрямую без архива.');
      if (extract) {
        console.log('Извлечение архива пропущено, так как скачивание шло пофайлово.');
      }
      console.log('\nДалее конвертируйте датасет в JSONL базы знаний:');
      console.log(
        `  node scripts/import_sberquad.js --input ${path.join(outDir, 'train-v1.1.json')} --output data/knowledge/russian-open-qa.jsonl --limit 2000`
      );
      return;
    }
  }
  console.log(`Архив сохранён в ${archivePath}`);

  if (extract) {
    console.log('Распаковываю архив...');
    await extractArchive(archivePath, outDir);
    console.log(`Готово. Ищите файлы train-v1.1.json и dev-v1.1.json в ${outDir}`);
  } else {
    console.log('Извлечение отключено флагом --no-extract');
  }

  console.log('\nДалее конвертируйте датасет в JSONL базы знаний:');
  console.log(
    `  node scripts/import_sberquad.js --input ${path.join(outDir, 'train-v1.1.json')} --output data/knowledge/russian-open-qa.jsonl --limit 2000`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Ошибка:', err.message);
    process.exit(1);
  });
}
