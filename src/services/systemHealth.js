function performSystemHealthCheck({
  knowledgeBase,
  contextManager,
  queryAnalyzer,
  searchEngine,
  responseGenerator,
  ambiguityResolver,
}) {
  const checks = {
    knowledgeBase: knowledgeBase.length > 0,
    contextManager: contextManager !== null,
    queryAnalyzer: queryAnalyzer !== null,
    searchEngine: searchEngine !== null,
    responseGenerator: responseGenerator !== null,
    ambiguityResolver: ambiguityResolver !== null,
  };

  const failedChecks = Object.entries(checks).filter(([_, passed]) => !passed);

  if (failedChecks.length > 0) {
    console.error(
      "❌ Проверка системы не пройдена:",
      failedChecks.map(([key]) => key)
    );
    throw new Error("Система не готова к работе");
  }

  console.log("✅ Система прошла проверку готовности");
}

module.exports = { performSystemHealthCheck };
