const path = require("path");
const { pipeline } = require("@xenova/transformers");
const { logDebug, logError } = require("../utils/logger");
const { PersistentLRUCache } = require("./persistentLRUCache");

class SemanticEmbeddingRuntime {
  constructor({
    modelId = "Xenova/all-MiniLM-L6-v2",
    cacheDir,
    cacheLimit = 2000,
    cachePersistDir = path.join(process.cwd(), "data/cache/embeddings/semantic"),
  } = {}) {
    this.modelId = modelId;
    this.cacheDir = cacheDir;
    this.cache = new PersistentLRUCache({
      maxMemoryEntries: cacheLimit,
      persistDir: cachePersistDir,
      serialize: (value) => JSON.stringify(Array.from(value)),
      deserialize: (raw) => Float32Array.from(JSON.parse(raw)),
    });
    this.initialized = false;
    this.embeddingSize = 384;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    try {
      this.embedder = await pipeline("feature-extraction", this.modelId, {
        cache_dir: this.cacheDir,
        quantized: true,
      });
      this.embeddingSize = this.embedder?.config?.hidden_size || this.embeddingSize;
      this.initialized = true;
      logDebug("SemanticEmbeddingRuntime", "Модель эмбеддингов готова", {
        modelId: this.modelId,
        embeddingSize: this.embeddingSize,
      });
    } catch (error) {
      logError("SemanticEmbeddingRuntime", "Не удалось инициализировать модель", {
        error: error.message,
      });
      throw error;
    }
  }

  async indexKnowledgeBase(knowledgeBase = []) {
    await this.ensureInitialized();
    const indexingStart = Date.now();
    await Promise.all(
      knowledgeBase.map(async (item) => {
        const sourceText = item.content || item.title || "";
        const normalizedKey = this.normalizeInput(sourceText);

        if (!normalizedKey) return;

        if (!item.embedding) {
          item.embedding = await this.embedText(sourceText);
        }

        this.cache.set(normalizedKey, this.ensureFloatVector(item.embedding));
      })
    );
    logDebug("SemanticEmbeddingRuntime", "База знаний проиндексирована", {
      durationMs: Date.now() - indexingStart,
      indexed: knowledgeBase.length,
    });
  }

  async embedText(text = "") {
    await this.ensureInitialized();
    const normalizedText = this.normalizeInput(text);
    if (!normalizedText) {
      return this.zeroVector();
    }

    const cached = this.cache.get(normalizedText);
    if (cached) {
      return cached;
    }

    const embedStart = Date.now();
    const output = await this.embedder(normalizedText, {
      pooling: "mean",
      normalize: true,
    });

    const vector = this.ensureFloatVector(output?.data);
    this.cache.set(normalizedText, vector);
    logDebug("SemanticEmbeddingRuntime", "Эмбеддинг создан", {
      durationMs: Date.now() - embedStart,
      tokenCount: Array.isArray(output?.data) ? output.data.length : vector.length,
    });
    return vector;
  }

  async buildQueryEmbedding(query) {
    return this.embedText(query);
  }

  async calculateSimilarity(textA, textB) {
    const embeddingA = await this.embedText(textA);
    const embeddingB = await this.embedText(textB);
    return this.cosineSimilarity(embeddingA, embeddingB);
  }

  async calculateSimilarityWithEmbedding(queryEmbedding, document) {
    if (!queryEmbedding || !document) return 0;
    const documentEmbedding = document.embedding
      ? this.ensureFloatVector(document.embedding)
      : await this.embedText(document.content || document.title || "");

    if (!document.embedding) {
      document.embedding = documentEmbedding;
    }

    return this.cosineSimilarity(this.ensureFloatVector(queryEmbedding), documentEmbedding);
  }

  ensureFloatVector(vector) {
    if (!vector) {
      return this.zeroVector();
    }

    const floatVector = vector instanceof Float32Array ? vector : Float32Array.from(vector);
    if (!floatVector.length) {
      return this.zeroVector();
    }

    if (floatVector.length !== this.embeddingSize) {
      return this.normalizeVector(floatVector, this.embeddingSize);
    }

    return floatVector;
  }

  normalizeVector(vector, targetSize) {
    const normalized = new Float32Array(targetSize).fill(0);
    const limit = Math.min(vector.length, targetSize);
    let norm = 0;

    for (let i = 0; i < limit; i++) {
      normalized[i] = vector[i];
      norm += vector[i] * vector[i];
    }

    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < limit; i++) {
      normalized[i] /= norm;
    }

    return normalized;
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
}

module.exports = {
  SemanticEmbeddingRuntime,
};
