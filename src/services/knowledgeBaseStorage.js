const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DEFAULT_DB_PATH = path.join(
  path.resolve(__dirname, "../.."),
  "data",
  "knowledge",
  "knowledge-cache.db"
);

function ensureDatabaseDirectory(dbPath = DEFAULT_DB_PATH) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
}

function allAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

async function initializeDatabase(dbPath = DEFAULT_DB_PATH) {
  ensureDatabaseDirectory(dbPath);

  const db = new sqlite3.Database(dbPath);
  await runAsync(
    db,
    `CREATE TABLE IF NOT EXISTS knowledge_entries (
      id TEXT PRIMARY KEY,
      title TEXT,
      aliases TEXT,
      content TEXT,
      tags TEXT,
      category TEXT,
      lastUpdated TEXT,
      contentLength INTEGER,
      aliasCount INTEGER,
      tagCount INTEGER,
      source TEXT
    )`
  );

  await runAsync(
    db,
    `CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_entries(category)`
  );

  return db;
}

async function saveKnowledgeBaseEntries(entries, { dbPath = DEFAULT_DB_PATH } = {}) {
  const db = await initializeDatabase(dbPath);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      db.run("DELETE FROM knowledge_entries", (clearError) => {
        if (clearError) {
          db.close();
          return reject(clearError);
        }

        const stmt = db.prepare(
          `INSERT INTO knowledge_entries (
            id, title, aliases, content, tags, category, lastUpdated,
            contentLength, aliasCount, tagCount, source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        entries.forEach((entry, index) => {
          stmt.run(
            [
              entry.id,
              entry.title,
              JSON.stringify(entry.aliases || []),
              entry.content,
              JSON.stringify(entry.tags || []),
              entry.category,
              entry.lastUpdated,
              entry.contentLength || 0,
              entry.aliasCount || 0,
              entry.tagCount || 0,
              entry.source || "unknown",
            ],
            (err) => {
              if (err) {
                db.close();
                reject(err);
              }
            }
          );

          if ((index + 1) % 1000 === 0) {
            console.log(
              `📥 Загружено ${index + 1} записей в базу знаний (SQLite)`
            );
          }
        });

        stmt.finalize((finalizeError) => {
          if (finalizeError) {
            db.close();
            return reject(finalizeError);
          }

          db.run("COMMIT", (commitError) => {
            if (commitError) {
              db.close();
              return reject(commitError);
            }

            console.log(
              `✅ Все данные (${entries.length} записей) сохранены в базе знаний`
            );
            db.close();
            resolve();
          });
        });
      });
    });
  });
}

async function loadKnowledgeBaseFromDb({ dbPath = DEFAULT_DB_PATH } = {}) {
  const db = await initializeDatabase(dbPath);
  const rows = await allAsync(db, "SELECT * FROM knowledge_entries");
  db.close();

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    aliases: safeParse(row.aliases, []),
    content: row.content,
    tags: safeParse(row.tags, []),
    category: row.category,
    lastUpdated: row.lastUpdated,
    contentLength: row.contentLength,
    aliasCount: row.aliasCount,
    tagCount: row.tagCount,
    source: row.source || "unknown",
  }));
}

async function countKnowledgeBaseEntries({ dbPath = DEFAULT_DB_PATH } = {}) {
  const db = await initializeDatabase(dbPath);
  const rows = await allAsync(
    db,
    "SELECT COUNT(1) as total FROM knowledge_entries"
  );
  db.close();
  return rows[0]?.total || 0;
}

function safeParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  saveKnowledgeBaseEntries,
  loadKnowledgeBaseFromDb,
  countKnowledgeBaseEntries,
  DEFAULT_DB_PATH,
};
