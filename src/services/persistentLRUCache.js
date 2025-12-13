const crypto = require("crypto");
const path = require("path");
const fs = require("fs-extra");

/**
 * Небольшой гибридный кэш: горячие данные держим в оперативке,
 * остальное складываем на диск, чтобы не раздувать память на гигабайты.
 */
class PersistentLRUCache {
  constructor({
    maxMemoryEntries = 2000,
    persistDir,
    serialize = (value) => JSON.stringify(value),
    deserialize = (raw) => JSON.parse(raw),
  } = {}) {
    this.maxMemoryEntries = maxMemoryEntries;
    this.serialize = serialize;
    this.deserialize = deserialize;
    this.persistDir = persistDir || path.join(process.cwd(), "data/cache/hybrid");
    this.memoryMap = new Map();

    fs.ensureDirSync(this.persistDir);
  }

  /**
   * Возвращает значение по ключу. Сначала смотрим в горячем LRU, затем на диске.
   */
  get(key) {
    if (!key) return undefined;

    if (this.memoryMap.has(key)) {
      const value = this.memoryMap.get(key);
      this._bump(key, value);
      return value;
    }

    const filePath = this._filePath(key);
    if (!fs.existsSync(filePath)) {
      return undefined;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const value = this.deserialize(raw);
      this._setInMemory(key, value);
      return value;
    } catch (error) {
      console.warn(`⚠️  Не удалось прочитать кэш с диска: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Сохраняет значение в горячий кэш и на диск.
   */
  set(key, value) {
    if (!key) return;

    this._setInMemory(key, value);

    try {
      fs.writeFileSync(this._filePath(key), this.serialize(value), "utf8");
    } catch (error) {
      console.warn(`⚠️  Не удалось записать кэш на диск: ${error.message}`);
    }
  }

  has(key) {
    if (this.memoryMap.has(key)) return true;
    return fs.existsSync(this._filePath(key));
  }

  stats() {
    return {
      memoryEntries: this.memoryMap.size,
      persistDir: this.persistDir,
    };
  }

  _setInMemory(key, value) {
    if (this.memoryMap.has(key)) {
      this.memoryMap.delete(key);
    }
    this.memoryMap.set(key, value);

    if (this.memoryMap.size > this.maxMemoryEntries) {
      // LRU — удаляем самую старую запись
      const oldestKey = this.memoryMap.keys().next().value;
      this.memoryMap.delete(oldestKey);
    }
  }

  _bump(key, value) {
    this.memoryMap.delete(key);
    this.memoryMap.set(key, value);
  }

  _filePath(key) {
    const hashed = crypto.createHash("sha1").update(String(key)).digest("hex");
    return path.join(this.persistDir, `${hashed}.cache`);
  }
}

module.exports = { PersistentLRUCache };
