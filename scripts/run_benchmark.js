const fs = require('fs');
const path = require('path');

const { SemanticSearchEngine } = require('../src/modules/search/SemanticSearchEngine');
const { LocalEmbeddingRuntime } = require('../src/services/localEmbeddingRuntime');
const { loadKnowledgeBase } = require('../src/services/knowledgeBase');

const ROOT_DIR = path.resolve(__dirname, '..');

function loadKB() {
  const { knowledgeBase } = loadKnowledgeBase({ rootDir: ROOT_DIR });
  return knowledgeBase;
}

function buildDataset(knowledgeBase) {
  const labeled = knowledgeBase.slice(0, 20).map((doc) => ({
    query: doc.aliases?.[0] || doc.title,
    expectedId: doc.id,
    type: 'kb_alias',
  }));

  const adversarialQueries = [
    'сколько стоит подписка',
    'как отменить оплату',
    'свяжите меня с оператором',
    'мобильное приложение вайлт',
    'официальный телефон поддержки',
    'скачать клиент whilet',
    'ошибка 500 при оплате',
    'хочу удалить аккаунт',
    'где сменить язык интерфейса',
    'как восстановить пароль',
    'не работает интеграция',
    'покажи код примера',
  ].map((query) => ({
    query,
    expectedId: null,
    type: 'adversarial',
  }));

  return [...labeled, ...adversarialQueries];
}

function evaluateDataset(searchEngine, dataset) {
  const results = dataset.map((item) => {
    const searchResults = searchEngine.search(item.query, {});
    const topResult = searchResults[0];
    const predictedId = topResult?.document?.id || null;

    const success = item.expectedId
      ? predictedId === item.expectedId
      : false;

    return {
      query: item.query,
      expectedId: item.expectedId,
      predictedId,
      topScore: topResult?.score || 0,
      success,
      type: item.type,
      topTitle: topResult?.document?.title,
      methods: topResult?.methods || [],
    };
  });

  const labeledResults = results.filter((r) => r.expectedId);
  const hits = labeledResults.filter((r) => r.success).length;
  const accuracy = labeledResults.length > 0 ? hits / labeledResults.length : 0;

  return { results, accuracy };
}

function persistOutputs(metrics, failures) {
  const reportsDir = path.join(ROOT_DIR, 'reports');
  const evalDir = path.join(ROOT_DIR, 'data', 'eval');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(evalDir, { recursive: true });

  const metricsPayload = {
    generatedAt: new Date().toISOString(),
    benchmark: 'knowledge_base_alias_top1',
    metric: 'accuracy',
    accuracy: Number(metrics.accuracy.toFixed(3)),
    totalCases: metrics.results.filter((r) => r.expectedId).length,
    hits: metrics.results.filter((r) => r.success).length,
  };

  fs.writeFileSync(
    path.join(reportsDir, 'benchmark_metrics.json'),
    JSON.stringify(metricsPayload, null, 2)
  );

  const failuresForExport = failures.slice(0, 20);

  fs.writeFileSync(
    path.join(evalDir, 'failure_cases.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalFailures: failuresForExport.length,
        cases: failuresForExport,
      },
      null,
      2
    )
  );
}

function main() {
  const knowledgeBase = loadKB();
  const embeddingRuntime = new LocalEmbeddingRuntime({ knowledgeBase });
  const searchEngine = new SemanticSearchEngine(knowledgeBase, { embeddingRuntime });
  const dataset = buildDataset(knowledgeBase);
  const metrics = evaluateDataset(searchEngine, dataset);
  const failures = metrics.results.filter((r) => !r.success);

  persistOutputs(metrics, failures);

  console.log('Benchmark accuracy (top-1):', metrics.accuracy.toFixed(3));
  console.log('Total cases:', metrics.results.filter((r) => r.expectedId).length);
  console.log('Failures captured:', failures.length);
}

if (require.main === module) {
  main();
}
