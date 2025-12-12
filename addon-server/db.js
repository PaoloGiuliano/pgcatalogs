const Database = require("better-sqlite3");
const path = require("path");

// Path to SQLite file inside addon-server
const db = new Database(path.join(__dirname, "db.sqlite"));

// Enable foreign keys (better-sqlite3 does NOT enable automatically)
db.pragma("foreign_keys = ON");

// -------------------------------------------
// USERS TABLE
// -------------------------------------------
// We add user_uuid so each user has a safe filesystem identifier,
// separate from Google ID or email.
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_uuid TEXT UNIQUE NOT NULL,
    google_id TEXT UNIQUE,
    name TEXT,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// -------------------------------------------
// CATALOGS TABLE
// -------------------------------------------
db.prepare(`
  CREATE TABLE IF NOT EXISTS catalogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    generated_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    last_generated_at DATETIME,
    is_enabled INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`).run();

module.exports = db;

