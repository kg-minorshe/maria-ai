const sanitizeHtml = require("sanitize-html");

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
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ query, limit: effectiveLimit }),
        signal: controller.signal,
      });

      const contentType = response.headers?.get?.("content-type") || "";
      const rawBody = await response.text();
      const bodyStart = rawBody.trimStart();

      const parsedContentType = contentType.toLowerCase();
      const isHtmlResponse =
        parsedContentType.includes("text/html") ||
        bodyStart.startsWith("<!DOCTYPE html") ||
        bodyStart.startsWith("<html");

      if (response.ok && isHtmlResponse) {
        const fallbackResults = this.extractResultsFromHtml(
          rawBody,
          effectiveLimit
        );

        if (fallbackResults.length > 0) {
          logStep("search:web:html_fallback", {
            results: fallbackResults.length,
            timeoutMs: effectiveTimeout,
          });
          return this.normalizeResults(fallbackResults);
        }
      }

      if (!response.ok) {
        throw new Error(
          `Web search service responded with ${response.status} (${contentType}): ${rawBody.slice(
            0,
            300
          )}`
        );
      }

      let data;
      try {
        data = JSON.parse(rawBody);
      } catch (parseError) {
        if (isHtmlResponse) {
          const fallbackResults = this.extractResultsFromHtml(
            rawBody,
            effectiveLimit
          );

          if (fallbackResults.length > 0) {
            logStep("search:web:html_fallback", {
              results: fallbackResults.length,
              timeoutMs: effectiveTimeout,
            });
            return this.normalizeResults(fallbackResults);
          }
        }

        throw new Error(
          `Unexpected web search payload (${contentType || "unknown"}): ${rawBody
            .slice(0, 300)
            .replace(/\s+/g, " ")}`
        );
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      logDebug("WebSearch", "Получены результаты внешнего поиска", {
        results: results.length,
        timeoutMs: effectiveTimeout,
      });

      return this.normalizeResults(results);
    } catch (error) {
      const isAbortError = error.name === "AbortError";
      logError("WebSearch", "Поиск в интернете недоступен", error);
      logStep("search:web:error", {
        timeout: isAbortError,
        message: error.message,
      });
      return [];
    } finally {
      clearTimeout(timeout);
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

  extractResultsFromHtml(html, limit) {
    const cleanedHtml = html.replace(/\n+/g, "\n");
    const linkRegex = /<a\s+[^>]*href="(https?:\/\/[^"#]+)"[^>]*>(.*?)<\/a>/gim;
    const blockedHosts = ["yabs.yandex", "clck.yandex", "yandex.ru/clck"];
    const results = [];

    const stripTags = (value) =>
      sanitizeHtml(value, {
        allowedTags: [],
        allowedAttributes: {},
      })
        .replace(/\s+/g, " ")
        .trim();

    let match;
    while ((match = linkRegex.exec(cleanedHtml)) && results.length < limit) {
      const url = match[1];
      if (blockedHosts.some((host) => url.includes(host))) {
        continue;
      }

      const title = stripTags(match[2]);
      if (!title) {
        continue;
      }

      if (results.some((item) => item.url === url)) {
        continue;
      }

      const snippetSearchArea = cleanedHtml.slice(match.index, match.index + 500);
      const snippetMatch = snippetSearchArea.match(
        /<p[^>]*>(.*?)<\/p>|<div[^>]*class="[^"]*(?:snippet|text)[^"]*"[^>]*>(.*?)<\/div>/i
      );
      const snippetRaw = snippetMatch?.[1] || snippetMatch?.[2] || "";

      results.push({
        title,
        url,
        snippet: stripTags(snippetRaw) || "Информация получена из внешнего поиска.",
        source: "html_fallback",
      });
    }

    return results;
  }
}

module.exports = { WebSearchService };
