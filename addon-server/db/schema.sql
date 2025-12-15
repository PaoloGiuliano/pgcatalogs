CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_uuid TEXT UNIQUE,
  google_id TEXT UNIQUE,
  email TEXT,
  display_name TEXT
);

CREATE TABLE catalogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  generated_path TEXT,
  last_generated_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
