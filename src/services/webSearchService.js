const { logStep, logError, logDebug } = require("../utils/logger");

class WebSearchService {
  constructor({ baseUrl, apiKey, timeoutMs = 8000, defaultLimit = 5 } = {}) {
    this.baseUrl = baseUrl?.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.defaultLimit = defaultLimit;
  }

  isEnabled() {
    return Boolean(this.baseUrl);
  }

  async search(query, { limit, timeoutMs } = {}) {
    if (!this.isEnabled()) {
      return [];
    }

    const effectiveLimit = limit || this.defaultLimit;
    const effectiveTimeout = timeoutMs || this.timeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

    const fetchFn = (...args) =>
      typeof fetch !== "undefined"
        ? fetch(...args)
        : import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args));

    try {
      const response = await fetchFn(`${this.baseUrl}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ query, limit: effectiveLimit }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Web search service responded with ${response.status}`);
      }

      const data = await response.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      logDebug("WebSearch", "Получены результаты внешнего поиска", {
        results: results.length,
        timeoutMs: effectiveTimeout,
      });

      return this.normalizeResults(results);
    } catch (error) {
      clearTimeout(timeout);
      const isAbortError = error.name === "AbortError";
      logError("WebSearch", "Поиск в интернете недоступен", error);
      logStep("search:web:error", {
        timeout: isAbortError,
        message: error.message,
      });
      return [];
    }
  }

  normalizeResults(results = []) {
    return results.map((item, index) => ({
      score: item.score || Math.max(0.35, 0.9 - index * 0.1),
      methods: ["web_search"],
      document: {
        id: item.id || `web_${index}`,
        title: item.title || item.url || "Результат веб-поиска",
        content:
          item.snippet ||
          item.description ||
          item.content ||
          "Информация получена из внешнего поиска.",
        tags: ["internet", item.source || "web"].filter(Boolean),
        aliases: [],
        source: item.source || "web_search",
        url: item.url,
      },
    }));
  }
}

module.exports = { WebSearchService };
