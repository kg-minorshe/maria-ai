const tf = require("@tensorflow/tfjs");
const path = require("path");
const { PersistentLRUCache } = require("./persistentLRUCache");
const { logDebug } = require("../utils/logger");

class LocalEmbeddingRuntime {
  constructor({
    knowledgeBase = [],
    embeddingSize = 256,
    cacheLimit = 5000,
    cacheDir = path.join(process.cwd(), "data/cache/embeddings/local"),
  } = {}) {
    this.embeddingSize = embeddingSize;
    this.tfAvailable = Boolean(tf);
    this.cache = new PersistentLRUCache({
      maxMemoryEntries: cacheLimit,
      persistDir: cacheDir,
      serialize: (value) => JSON.stringify(Array.from(value)),
      deserialize: (raw) => Float32Array.from(JSON.parse(raw)),
    });
    this.stopWords = new Set([
      "the",
      "and",
      "a",
      "to",
      "of",
      "в",
      "на",
      "и",
      "с",
      "для",
      "что",
      "как",
    ]);
    this.indexKnowledgeBase(knowledgeBase);
  }

  indexKnowledgeBase(knowledgeBase = []) {
    if (!Array.isArray(knowledgeBase)) return;
    knowledgeBase.forEach((item) => {
      if (!item.embedding) {
        item.embedding = this.embedText(item.content || item.title || "");
      }

      const normalizedKey = this.normalizeInput(item.content || item.title || "");
      if (normalizedKey && item.embedding) {
        this.cache.set(normalizedKey, this.ensureFloatVector(item.embedding));
      }
    });
  }

  embedText(text = "") {
    const normalizedText = this.normalizeInput(text);
    if (!normalizedText) {
      return this.zeroVector();
    }

    const cached = this.cache.get(normalizedText);
    if (cached) {
      logDebug("EmbeddingRuntime", "Кэшированный эмбеддинг", {
        tokenCount: cached.length,
        cached: true,
      });
      return cached;
    }

    const embedStart = Date.now();
    const tokens = this.tokenize(normalizedText);
    if (!tokens.length) {
      return this.zeroVector();
    }

    const embedding = this.tfAvailable
      ? this.buildTensorEmbedding(tokens)
      : this.buildFallbackEmbedding(tokens);

    this.cache.set(normalizedText, embedding);
    logDebug("EmbeddingRuntime", "Эмбеддинг создан", {
      durationMs: Date.now() - embedStart,
      tokenCount: tokens.length,
    });
    return embedding;
  }

  buildTensorEmbedding(tokens) {
    const weighted = this.buildTokenWeights(tokens);
    const vector = tf.tidy(() => {
      const tensor = tf.tensor1d(weighted);
      const norm = tf.norm(tensor).add(1e-6);
      return tf.div(tensor, norm).dataSync();
    });

    return Float32Array.from(vector);
  }

  buildFallbackEmbedding(tokens) {
    const vector = this.buildTokenWeights(tokens);
    return this.normalizeVector(vector);
  }

  buildTokenWeights(tokens) {
    const buffer = new Float32Array(this.embeddingSize).fill(0);
    tokens.forEach((token) => {
      const idx = this.hashToken(token) % this.embeddingSize;
      const weight = 1 + Math.log(1 + token.length);
      buffer[idx] += weight;
    });
    return buffer;
  }

  normalizeVector(buffer) {
    let norm = 0;
    for (let i = 0; i < buffer.length; i++) {
      norm += buffer[i] * buffer[i];
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] /= norm;
    }
    return buffer;
  }

  ensureFloatVector(vector) {
    if (!vector || vector.length !== this.embeddingSize) {
      return this.zeroVector();
    }
    return vector instanceof Float32Array ? vector : Float32Array.from(vector);
  }

  zeroVector() {
    return new Float32Array(this.embeddingSize).fill(0);
  }

  normalizeInput(text) {
    if (text === undefined || text === null) return "";
    return text
      .toString()
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  hashToken(token) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash << 5) - hash + token.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  tokenize(text) {
    return text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((token) => token && token.length > 1 && !this.stopWords.has(token));
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  buildQueryEmbedding(query) {
    return this.embedText(query);
  }

  calculateSimilarity(textA, textB) {
    const embeddingA = this.embedText(textA);
    const embeddingB = this.embedText(textB);
    return this.cosineSimilarity(embeddingA, embeddingB);
  }

  calculateSimilarityWithEmbedding(queryEmbedding, document) {
    if (!queryEmbedding || !document) return 0;
    const documentEmbedding =
      document.embedding || this.embedText(document.content || document.title || "");

    const normalizedDocumentEmbedding = this.ensureFloatVector(documentEmbedding);
    if (!document.embedding) {
      document.embedding = normalizedDocumentEmbedding;
    }

    return this.cosineSimilarity(
      this.ensureFloatVector(queryEmbedding),
      normalizedDocumentEmbedding
    );
  }
}

module.exports = {
  LocalEmbeddingRuntime,
};
