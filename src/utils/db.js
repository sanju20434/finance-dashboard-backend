const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

function getDbPath() {
  const url = process.env.DATABASE_URL || "file:./data/finance.db";
  return path.join(process.cwd(), url.replace(/^file:/, ""));
}

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();
  const DB_PATH = getDbPath();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new SQL.Database();
  }

  initSchema();
  migrateRecordsTable();
  return db;
}

function saveDb() {
  if (!db) return;
  const DB_PATH = getDbPath();
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, buffer);
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);
  saveDb();
}

/** Older DBs used \`notes\`; assignment uses \`description\`. */
function migrateRecordsTable() {
  const stmt = db.prepare("PRAGMA table_info(records)");
  const names = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    names.push(row.name);
  }
  stmt.free();

  if (names.includes("description")) return;

  if (names.includes("notes")) {
    try {
      db.run("ALTER TABLE records RENAME COLUMN notes TO description");
    } catch {
      db.run("ALTER TABLE records ADD COLUMN description TEXT");
      db.run("UPDATE records SET description = notes WHERE notes IS NOT NULL");
    }
    saveDb();
  }
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function resetDb() {
  db = null;
}

module.exports = { getDb, run, get, all, saveDb, resetDb };
