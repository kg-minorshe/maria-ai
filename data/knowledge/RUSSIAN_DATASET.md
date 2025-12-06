# Русскоязычный датасет

В код добавлена поддержка отдельного русскоязычного корпуса, который подмешивается к вашей базе знаний. По умолчанию используется файл `data/knowledge/russian-open-qa.jsonl` (JSONL), который можно заменить реальными данными.

## Где взять готовый корпус
- **SberQuAD** — открытый QA-датасет на русском языке. Самый быстрый вариант — скачать архив напрямую через Node-скрипт:

  ```bash
  node scripts/download_sberquad.js --outDir data/downloads/sberquad
  ```

  По умолчанию скрипт скачивает архив с Hugging Face (`https://huggingface.co/datasets/ai-forever/sberquad/resolve/main/sberquad.tar.gz?download=1`), автоматически следует HTTP‑редиректам и при неудаче пробует запасной URL `https://huggingface.co/datasets/ai-forever/sberquad/resolve/main/sberquad.tar.gz`. При желании вы можете передать свой источник через `--url <ссылка>`.

- После скачивания возьмите файл `train-v1.1.json` или `dev-v1.1.json` и сконвертируйте его в JSONL формата базы знаний.

## Импорт в формат базы знаний
Запустите конвертацию через вспомогательный скрипт:

```bash
node scripts/import_sberquad.js --input /path/to/train-v1.1.json --output data/knowledge/russian-open-qa.jsonl --limit 2000
```

Поля конвертируются в структуру:
```json
{
  "id": "sberquad_0_0_0",
  "title": "<вопрос>",
  "aliases": ["<вопрос>"],
  "content": "<контекст параграфа>",
  "tags": ["sberquad", "russian"],
  "category": "Русский датасет"
}
```

После обновления файла перезапустите приложение или дерните эндпоинт перезагрузки базы, чтобы новые статьи попали в поиск.
