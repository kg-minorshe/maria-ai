const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const mysql = require("mysql2/promise");

const DEFAULT_DB_PATH = path.join(
  path.resolve(__dirname, "../.."),
  "data",
  "knowledge",
  "knowledge-cache.db"
);

const DEFAULT_MYSQL_CONFIG = {
  host: process.env.KB_MYSQL_HOST || process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.KB_MYSQL_PORT || process.env.MYSQL_PORT) || 3306,
  user: process.env.KB_MYSQL_USER || process.env.MYSQL_USER || "root",
  password: process.env.KB_MYSQL_PASSWORD || process.env.MYSQL_PASSWORD || "",
  database:
    process.env.KB_MYSQL_DATABASE ||
    process.env.MYSQL_DATABASE ||
    process.env.MYSQL_DB ||
    "maria_knowledge",
  connectionLimit: Number(process.env.KB_MYSQL_POOL) || 10,
};

let mysqlPoolPromise = null;

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

async function getMysqlPool(customConfig = {}) {
  if (!mysqlPoolPromise) {
    const mergedConfig = { ...DEFAULT_MYSQL_CONFIG, ...customConfig };
    const pool = mysql.createPool(mergedConfig);

    mysqlPoolPromise = pool
      .getConnection()
      .then(async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS knowledge_entries (
            id VARCHAR(191) PRIMARY KEY,
            title TEXT,
            aliases JSON,
            content LONGTEXT,
            tags JSON,
            category VARCHAR(191),
            lastUpdated VARCHAR(191),
            contentLength INT,
            aliasCount INT,
            tagCount INT,
            source VARCHAR(191)
          ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        `);

        // MySQL не поддерживает IF NOT EXISTS для индексов, поэтому
        // пытаемся создать индекс и игнорируем ошибку дубликата.
        try {
          await conn.query(
            "CREATE INDEX idx_knowledge_category ON knowledge_entries(category)"
          );
        } catch (indexError) {
          if (indexError?.code !== "ER_DUP_KEYNAME") {
            console.warn(
              `⚠️ Не удалось создать индекс knowledge_entries.category: ${indexError.message}`
            );
          }
        }

        conn.release();
        return pool;
      })
      .catch((error) => {
        mysqlPoolPromise = null;
        throw error;
      });
  }

  return mysqlPoolPromise;
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

async function saveKnowledgeBaseEntriesToMysql(
  entries,
  { mysqlConfig = {} } = {}
) {
  const pool = await getMysqlPool(mysqlConfig);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM knowledge_entries");

    const batchSize = 1000;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize).map((entry) => [
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
      ]);

      await connection.query(
        `INSERT INTO knowledge_entries (
          id, title, aliases, content, tags, category, lastUpdated,
          contentLength, aliasCount, tagCount, source
        ) VALUES ?`,
        [batch]
      );

      const inserted = Math.min(entries.length, i + batchSize);
      if (inserted % 1000 === 0) {
        console.log(`📥 Загружено ${inserted} записей в базу знаний (MySQL)`);
      }
    }

    await connection.commit();
    console.log(`✅ Все данные (${entries.length} записей) сохранены в базе знаний (MySQL)`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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

async function loadKnowledgeBaseFromMysql({ mysqlConfig = {} } = {}) {
  const pool = await getMysqlPool(mysqlConfig);
  const [rows] = await pool.query("SELECT * FROM knowledge_entries");

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

async function countKnowledgeBaseEntriesMysql({ mysqlConfig = {} } = {}) {
  const pool = await getMysqlPool(mysqlConfig);
  const [rows] = await pool.query("SELECT COUNT(1) as total FROM knowledge_entries");
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
  saveKnowledgeBaseEntriesToMysql,
  loadKnowledgeBaseFromDb,
  loadKnowledgeBaseFromMysql,
  countKnowledgeBaseEntries,
  countKnowledgeBaseEntriesMysql,
  DEFAULT_DB_PATH,
  DEFAULT_MYSQL_CONFIG,
};
