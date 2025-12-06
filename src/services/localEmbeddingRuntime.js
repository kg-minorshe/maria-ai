const ort = require("onnxruntime-node");
const tf = require("@tensorflow/tfjs-node");

class LocalEmbeddingRuntime {
  constructor({ knowledgeBase = [], embeddingSize = 256 } = {}) {
    this.embeddingSize = embeddingSize;
    this.ortAvailable = Boolean(ort);
    this.tfAvailable = Boolean(tf);
    this.indexKnowledgeBase(knowledgeBase);
  }

  indexKnowledgeBase(knowledgeBase = []) {
    if (!Array.isArray(knowledgeBase)) return;
    knowledgeBase.forEach((item) => {
      if (!item.embedding) {
        item.embedding = this.embedText(item.content || item.title || "");
      }
    });
  }

  embedText(text = "") {
    if (!text || typeof text !== "string") {
      return new Float32Array(this.embeddingSize).fill(0);
    }

    const tokens = this.tokenize(text);
    if (!tokens.length) {
      return new Float32Array(this.embeddingSize).fill(0);
    }

    if (this.tfAvailable) {
      return this.buildTensorEmbedding(tokens);
    }

    return this.buildFallbackEmbedding(tokens);
  }

  buildTensorEmbedding(tokens) {
    const hashed = tokens.map((token) => this.hashToken(token) % this.embeddingSize);

    const vector = tf.tidy(() => {
      const indices = tf.tensor1d(hashed, "int32");
      const oneHot = tf.oneHot(indices, this.embeddingSize);
      const pooled = tf.mean(oneHot, 0);
      const normalized = tf.div(pooled, tf.norm(pooled).add(1e-6));
      return normalized.dataSync();
    });

    return Float32Array.from(vector);
  }

  buildFallbackEmbedding(tokens) {
    const buffer = new Float32Array(this.embeddingSize).fill(0);
    tokens.forEach((token) => {
      const idx = this.hashToken(token) % this.embeddingSize;
      buffer[idx] += 1;
    });

    const norm = Math.sqrt(buffer.reduce((acc, val) => acc + val * val, 0)) || 1;
    return buffer.map((val) => val / norm);
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
      .toLowerCase()
      .replace(/[^a-zа-я0-9\s]/gi, " ")
      .split(/\s+/)
      .filter(Boolean);
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
    const documentEmbedding = document.embedding || this.embedText(document.content || document.title || "");
    return this.cosineSimilarity(queryEmbedding, documentEmbedding);
  }
}

module.exports = {
  LocalEmbeddingRuntime,
};
