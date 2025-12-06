# Русскоязычный датасет

В код добавлена поддержка отдельного русскоязычного корпуса, который подмешивается к вашей базе знаний. По умолчанию используется файл `data/knowledge/russian-open-qa.jsonl` (JSONL), который можно заменить реальными данными.

## Где взять готовый корпус
- **SberQuAD** — открытый QA-датасет на русском языке. Скачать архив можно с Hugging Face: https://huggingface.co/datasets/ai-forever/sberquad (доступен также зеркалированный файл `https://storage.yandexcloud.net/nlpcourse/data/sberquad.tar.gz`).
- После скачивания распакуйте архив, возьмите файл `train-v1.1.json` или `dev-v1.1.json` и сконвертируйте его в JSONL формата базы знаний.

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
