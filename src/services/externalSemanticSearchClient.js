const { logStep, logDebug, logError } = require("../utils/logger");

class ExternalSemanticSearchClient {
    constructor({ baseUrl, apiKey, timeoutMs = 5000 } = {}) {
        this.baseUrl = baseUrl?.replace(/\/$/, "");
        this.apiKey = apiKey;
        this.timeoutMs = timeoutMs;
    }

    isEnabled() {
        return Boolean(this.baseUrl);
    }

    async scoreQuery(query, candidates, { limit, timeoutMs } = {}) {
        if (!this.isEnabled()) {
            return [];
        }

        const effectiveTimeout = timeoutMs || this.timeoutMs;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

        const fetchFn = (...args) => (typeof fetch !== "undefined"
            ? fetch(...args)
            : import("node-fetch").then(({ default: nodeFetch }) => nodeFetch(...args))
        );

        try {
            const response = await fetchFn(`${this.baseUrl}/semantic/score`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
                },
                body: JSON.stringify({
                    query,
                    candidates: candidates.slice(0, limit || candidates.length).map((document) => ({
                        id: document.id,
                        title: document.title,
                        content: document.content,
                        tags: document.tags,
                        aliases: document.aliases,
                    })),
                }),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`External semantic service responded with ${response.status}`);
            }

            const data = await response.json();
            const results = Array.isArray(data?.results) ? data.results : [];

            logDebug("SemanticSearch", "Сторонний сервис оценил кандидатов", {
                results: results.length,
                timeoutMs: effectiveTimeout,
            });

            return results;
        } catch (error) {
            clearTimeout(timeout);
            const isAbortError = error.name === "AbortError";
            logError("SemanticSearch", "Сторонний семантический сервис недоступен", error);
            logStep("search:semantic:external_error", {
                timeout: isAbortError,
                message: error.message,
            });
            return [];
        }
    }
}

module.exports = { ExternalSemanticSearchClient };
