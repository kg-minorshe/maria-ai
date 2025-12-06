# План внедрения MoE и оптимизации внимания

Документ покрывает анализ текущей модели (слои/головы), проектирование MoE-контура, изменения в механизме внимания и планирование нагрузочных тестов. Предполагаем базовый GPT-подобный стек с 32 слоями трансформера, размером модели 4096, 32 головами внимания и контекстом 8k токенов. При иных параметрах формулы и методики остаются неизменными.

## 1. Анализ текущей конфигурации и пропускной способности

### Архитектурные метрики
- **Глубина / ширина:** 32 слоя, hidden size 4096, MLP expansion 4x (≈16k), 32 головы, head dim 128. Суммарные параметры ≈6.7B (без embeddings), что соотносится с лимитом памяти A100 80GB/TPUv4 при bf16.
- **Тяжёлые узкие места:** матрицы QKV/FFN (≈60% FLOPs), внимание на длинных последовательностях (O(n²)).

### Пропускная способность (оценка)
- **Inference, batch=8, seq=2k**: ~75 ток/с на A100 80GB при FlashAttention/SDPA; без Flash — падение до ~45 ток/с.
- **Training, global batch=512 ток/оп, seq=2k, data-parallel=8**: ~180 TFLOPs эффективных, утилизация ≈0.55 без оптимизаций, целевой потолок 0.7 с FlashAttention + fused kernels.
- **Ключевые задачи:**
  - Диалог 2–4k: чувствителен к latency — целимся в P50 <150мс/ток, P95 <220мс/ток.
  - Длинные ответы 8–16k: throughput-критичный — целевой 35–40 ток/с/устройство.

## 2. Дизайн MoE

### Топология
- **Эксперты:** 8 экспертов на каждую MoE-FFN замену (можно 16 для более крупных моделей). Эксперты размещаются через 1–2 блока (Experts-in-FFN) начиная со слоя 8 для стабильности раннего обучения.
- **Роутинг:** топ-2 с вероятностным шумом (GShard/Router z-loss) + softmax-temperature 0.7 для улучшения баланса. Квота на эксперта = batch_tokens / num_experts * (1 + capacity_factor 0.25).
- **Балансировка:** combine load-balancing loss (auxiliary) с переменной λ от 0.01 → 0.1 в первые 10k шагов; дропаут экспертов 1–2% для предотвращения коллапса.

### Нагрузка на оборудование
- **GPU (A100/H100):**
  - Используем expert-parallel + data-parallel. Пара экспертов закрепляется за одной GPU для минимизации коммуникаций; для 8 экспертов на 8-GPU ноде — по одному эксперту на карту.
  - Коммуникации — all-to-all с NCCL; включить overlap с compute (pipeline_execution). При seq>4k добавить sequence_parallel в attention.
- **TPU (v4):**
  - Использовать Mesh TensorFlow/DTensor layout: `batch, model` → data/model; `experts` → expert mesh dim. Включить микробатчинг (8–16) для заполнения MXU.
  - Роутинг — `xmap`/`pjit` с `all_to_all`; избегать `all_gather` большого размера, отфильтровывать пустые токены до коммуникаций.

### Память и активации
- **Activation checkpointing** на всех нелинейностях, **bf16** веса + **fp32** мастер.
- **KV cache**: квантование до fp8/int8 с per-channel scale для длинных ответов; размер кэша ≈ batch * heads * seq * head_dim * dtype.

## 3. Sparsity-friendly attention

### Flash/SDPA
- Включить **PyTorch SDPA** (`torch.backends.cuda.enable_flash_sdp`) для seq ≤8k; fallback на **FlashAttention-2** при доступности (требует head_dim кратен 8/16).
- **Fused QKV + bias** и **context parallelism** для длинных последовательностей.

### Длинный контекст
- **Hybrid scheme:** локальное окно 1024 + глобальные ключи (stride 128) → сложность O(n·w + n·g). Для задач >8k включать **sliding window attention** с сохранением глобальных токенов.
- **Sparse блоки:** блок-схема 64×64 с пропуском пустых блоков; совместимо с FlashAttention-2 (block-sparse kernels).
- **RoPE extrapolation/NTK scaling** для устойчивости при 16k–32k.

### Интеграция с MoE
- Router logits считать до внимания, чтобы позволить эксперту знать о sparsity-паттерне (возможная future-work). Для текущей версии достаточно, чтобы MoE работал в FFN и не влиял на attention layout.

## 4. План тестирования throughput/latency

### Профилирование
- **Сбор метрик:** использовать `torch.profiler` или XLA профилировщик; логировать `tokens/s`, `latency/token (p50/p95)`, `GPU util`, `all-to-all time`.
- **Нагрузки:**
  - Chat: batch=4, seq in/out 2k/1k.
  - Long-form: batch=2, seq in/out 8k/4k.
  - Stress MoE: batch=8, seq=2k, эксперты=8–16.

### Чек-лист прогонов
- **Baseline dense** без MoE, без Flash — фиксируем отправную точку.
- **Flash/SDPA включен** — ожидаем ≥1.5× throughput.
- **MoE top-2** — проверяем balance loss <1e-2, капасити >0.9, удельная latency +15–20% максимум.
- **Long-context** — окно 8k/16k, проверяем рост O(n) вместо O(n²) по времени.

### Автоматизация
- Скрипт бенчмарка: `python benchmarks/moe_benchmark.py --config configs/moe.yaml --task chat`. Лог в JSON с полями `tokens_per_second`, `latency_ms_p50`, `latency_ms_p95`, `router_entropy`, `expert_load_std`.
- CI-триггер nightly на коротком прогоне (500 шагов) с synthetic data; долгие прогонки запускать вручную перед релизом.

## Краткие рекомендации
- Начать с 8 экспертов, top-2, capacity 1.25, включить Flash/SDPA и windowed attention; целевой прирост throughput 1.8–2.2× при сохранении latency P95 <220мс на чат-задачах.
- После стабилизации — увеличить экспертов до 16, ввести смешанное квантование KV-кэша и expert-parallel на несколько нод.
