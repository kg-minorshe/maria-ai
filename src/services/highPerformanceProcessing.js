const fs = require("fs");
const os = require("os");
const path = require("path");
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { streamArray } = require("stream-json/streamers/StreamArray");
const Piscina = require("piscina");

const { logStep } = require("../utils/logger");

const MAX_BATCH_SIZE = 2000;
const DEFAULT_BATCH_SIZE = 500;

const workerPool = new Piscina({
  filename: path.join(__dirname, "workers", "highPerformanceWorker.js"),
  minThreads: Math.max(2, Math.ceil(os.cpus().length / 2)),
  maxThreads: Math.max(4, os.cpus().length - 1),
  idleTimeout: 30_000,
});

async function dispatchBatch(batch, onBatchComplete) {
  if (!batch?.length) return null;

  const results = await workerPool.run({ batch });
  if (typeof onBatchComplete === "function") {
    await onBatchComplete(results);
  }

  return results;
}

async function processJsonArrayFile(filePath, { batchSize = DEFAULT_BATCH_SIZE, onBatchComplete } = {}) {
  const size = Math.min(Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE), MAX_BATCH_SIZE);

  const meta = { filePath, batchSize: size, workerThreads: workerPool.threads.length };
  logStep("🚄 Запуск потоковой обработки JSONL/Array", meta);

  const batches = [];
  let totalProcessed = 0;
  const startTime = Date.now();

  const processingPipeline = chain([
    fs.createReadStream(filePath),
    parser({ jsonStreaming: true }),
    streamArray(),
  ]);

  for await (const { value } of processingPipeline) {
    batches.push(value);

    if (batches.length >= size) {
      const processed = await dispatchBatch([...batches], onBatchComplete);
      totalProcessed += processed?.length || 0;
      batches.length = 0;
    }
  }

  if (batches.length) {
    const processed = await dispatchBatch([...batches], onBatchComplete);
    totalProcessed += processed?.length || 0;
  }

  const durationMs = Date.now() - startTime;
  logStep("✅ Потоковая обработка завершена", { ...meta, totalProcessed, durationMs });

  return { totalProcessed, durationMs };
}

async function warmupHighPerformancePool() {
  try {
    await workerPool.run({ batch: [] });
    logStep("🔥 Прогрев пула потоков Piscina завершён");
  } catch (error) {
    logStep("⚠️ Не удалось прогреть пул Piscina", { error: error.message });
  }
}

module.exports = {
  processJsonArrayFile,
  warmupHighPerformancePool,
  workerPool,
};
