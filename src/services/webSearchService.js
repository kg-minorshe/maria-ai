"use strict";

const sanitizeHtml = require("sanitize-html");
const { logStep, logError, logDebug } = require("../utils/logger");

/**
 * SearXNG-backed WebSearchService
 *
 * baseUrl examples:
 *   - https://search.whilet.ru
 *   - http://127.0.0.1:3040
 */
class WebSearchService {
  constructor({
    baseUrl,
    apiKey, // не нужен для SearXNG, но оставил для совместимости
    timeoutMs = 8000,
    defaultLimit = 5,

    // SearXNG-specific defaults
    defaultLanguage = "ru-RU", // можно "en", "ru", "ru-RU"
    safeSearch = 1, // 0..2 (0=off, 1=moderate, 2=strict)
    defaultCategories = null, // например: "general" или "general,news"
  } = {}) {
    this.baseUrl = baseUrl?.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.defaultLimit = defaultLimit;

    this.defaultLanguage = defaultLanguage;
    this.safeSearch = safeSearch;
    this.defaultCategories = defaultCategories;
  }

  isEnabled() {
    return Boolean(this.baseUrl);
  }

  async search(query, { limit, timeoutMs, language, categories, safesearch } = {}) {
    if (!this.isEnabled()) return [];
    if (!query || !String(query).trim()) return [];

    const effectiveLimit = Number(limit || this.defaultLimit) || 5;
    const effectiveTimeout = Number(timeoutMs || this.timeoutMs) || 8000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

    const fetchFn = (...args) =>
      typeof fetch !== "undefined"
        ? fetch(...args)
        : import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args));

    try {
      // 1) Пробуем через SearXNG JSON API
      const searxResults = await this.searchViaSearxng(fetchFn, query, {
        limit: effectiveLimit,
        language: language ?? this.defaultLanguage,
        categories: categories ?? this.defaultCategories,
        safesearch: typeof safesearch === "number" ? safesearch : this.safeSearch,
        signal: controller.signal,
      });

      if (searxResults.length > 0) {
        logStep("search:web:searxng", {
          results: searxResults.length,
          timeoutMs: effectiveTimeout,
        });
        return this.normalizeResults(searxResults);
      }

      // 2) На всякий случай — если ты оставишь старый эндпоинт /search (POST),
      // можно попробовать fallback. Но для SearXNG это обычно не нужно.
      // Если baseUrl у тебя не SearXNG, а свой внешний сервис, этот блок полезен.
      const legacyResults = await this.searchViaLegacyPost(fetchFn, query, {
        limit: effectiveLimit,
        signal: controller.signal,
      });

      if (legacyResults.length > 0) {
        logStep("search:web:legacy_post", {
          results: legacyResults.length,
          timeoutMs: effectiveTimeout,
        });
        return this.normalizeResults(legacyResults);
      }

      // 3) Последний fallback — HTML парсинг (если вдруг кто-то вернул HTML)
      // (Для SearXNG JSON обычно доступен и это не нужно)
      logStep("search:web:empty", { timeoutMs: effectiveTimeout });
      return [];
    } catch (error) {
      const isAbortError = error?.name === "AbortError";
      logError("WebSearch", "Поиск в интернете недоступен", error);
      logStep("search:web:error", {
        timeout: isAbortError,
        message: error?.message,
      });
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * SearXNG JSON API:
   * GET {baseUrl}/search?q=...&format=json
   */
  async searchViaSearxng(fetchFn, query, { limit, language, categories, safesearch, signal } = {}) {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");

    // SearXNG: pageno начинается с 1
    url.searchParams.set("pageno", "1");

    // language параметр в searxng обычно "en", "ru", иногда принимает "ru-RU"
    if (language) url.searchParams.set("language", String(language));

    if (typeof safesearch === "number") url.searchParams.set("safesearch", String(safesearch));

    // categories: "general" | "news" | "images" etc. можно несколько через запятую
    if (categories) url.searchParams.set("categories", String(categories));

    // В SearXNG нет стандартного "limit", поэтому просто обрежем результаты на своей стороне
    const response = await fetchFn(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        // иногда полезно:
        "User-Agent": "maria-ai-websearch/1.0",
      },
      signal,
    });

    const contentType = response.headers?.get?.("content-type") || "";
    const rawBody = await response.text();
    const bodyStart = rawBody.trimStart();

    if (!response.ok) {
      // Если вдруг включил limiter и получил 429 — можно логировать отдельно
      const msg = `SearXNG responded with ${response.status} (${contentType}): ${rawBody
        .slice(0, 300)
        .replace(/\s+/g, " ")}`;
      throw new Error(msg);
    }

    // Если почему-то отдали HTML — пробуем старый html fallback
    const parsedContentType = contentType.toLowerCase();
    const isHtmlResponse =
      parsedContentType.includes("text/html") ||
      bodyStart.startsWith("<!DOCTYPE html") ||
      bodyStart.startsWith("<html");

    if (isHtmlResponse) {
      const fallbackResults = this.extractResultsFromHtml(rawBody, limit);
      return fallbackResults.slice(0, limit);
    }

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch (e) {
      // если JSON сломан, попробуем html fallback
      const fallbackResults = this.extractResultsFromHtml(rawBody, limit);
      return fallbackResults.slice(0, limit);
    }

    // SearXNG JSON schema: { results: [{ title, url, content, score, engine, ...}] }
    const results = Array.isArray(data?.results) ? data.results : [];
    const mapped = results
      .map((r, idx) => ({
        id: r?.url ? `searx_${this.simpleHash(r.url)}` : `searx_${idx}`,
        title: r?.title || r?.url || "Результат поиска",
        url: r?.url,
        snippet: r?.content || r?.snippet || r?.description || "",
        source: r?.engine || r?.engines?.[0] || "searxng",
        score: typeof r?.score === "number" ? r.score : undefined,
      }))
      .filter((r) => r.url && r.title)
      .slice(0, limit);

    logDebug("WebSearch", "Получены результаты SearXNG", {
      results: mapped.length,
      language,
      categories,
      safesearch,
    });

    return mapped;
  }

  /**
   * Legacy POST API (твоя старая схема):
   * POST {baseUrl}/search  body: {query, limit}
   */
  async searchViaLegacyPost(fetchFn, query, { limit, signal } = {}) {
    // если baseUrl указывает на SearXNG — этот запрос не нужен и может вернуть 404
    // но он не ломает, просто вернём []
    try {
      const response = await fetchFn(`${this.baseUrl}/search`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ query, limit }),
        signal,
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
        return this.extractResultsFromHtml(rawBody, limit);
      }

      if (!response.ok) return [];

      let data;
      try {
        data = JSON.parse(rawBody);
      } catch (e) {
        if (isHtmlResponse) return this.extractResultsFromHtml(rawBody, limit);
        return [];
      }

      const results = Array.isArray(data?.results) ? data.results : [];
      return results;
    } catch {
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
        tags: ["internet", item.source || "searxng"].filter(Boolean),
        aliases: [],
        source: item.source || "searxng",
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
      sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
        .replace(/\s+/g, " ")
        .trim();

    let match;
    while ((match = linkRegex.exec(cleanedHtml)) && results.length < limit) {
      const url = match[1];
      if (blockedHosts.some((host) => url.includes(host))) continue;

      const title = stripTags(match[2]);
      if (!title) continue;

      if (results.some((item) => item.url === url)) continue;

      const snippetSearchArea = cleanedHtml.slice(match.index, match.index + 800);
      const snippetMatch = snippetSearchArea.match(
        /<p[^>]*>(.*?)<\/p>|<div[^>]*class="[^"]*(?:snippet|text|content)[^"]*"[^>]*>(.*?)<\/div>/i
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

  simpleHash(str) {
    // маленький стабильный хэш для id
    let h = 0;
    for (let i = 0; i < str.length; i += 1) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return String(Math.abs(h));
  }
}

module.exports = { WebSearchService };
