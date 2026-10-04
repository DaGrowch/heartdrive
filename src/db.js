const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'heartdrive.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pseudo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a INTEGER NOT NULL REFERENCES users(id),
  user_b INTEGER NOT NULL REFERENCES users(id),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | active | ended | declined
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  ended_at INTEGER
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL REFERENCES links(id),
  size INTEGER NOT NULL,
  themes TEXT NOT NULL,          -- JSON array
  question_ids TEXT NOT NULL,    -- JSON array
  status TEXT NOT NULL DEFAULT 'active', -- active | done | abandoned
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  answer TEXT NOT NULL,
  image_url TEXT,
  image_thumb TEXT,
  image_credit TEXT,
  image_status TEXT NOT NULL DEFAULT 'pending', -- pending | ok | none
  created_at INTEGER NOT NULL,
  UNIQUE(game_id, idx, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL REFERENCES links(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,        -- text | voice | photo
  body TEXT,
  file_name TEXT,
  mime TEXT,
  duration REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_link ON messages(link_id, id);
CREATE INDEX IF NOT EXISTS idx_games_link ON games(link_id);
`);

// Migrations légères (ajout de colonnes)
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('users', 'avatar', 'TEXT');
addColumn('users', 'bio', 'TEXT');
addColumn('links', 'label_a', 'TEXT');   // nom donné au lien par user_a
addColumn('links', 'label_b', 'TEXT');   // nom donné au lien par user_b
addColumn('links', 'read_a', 'INTEGER NOT NULL DEFAULT 0'); // dernier message lu par user_a
addColumn('links', 'read_b', 'INTEGER NOT NULL DEFAULT 0');

module.exports = { db, DATA_DIR, UPLOAD_DIR };
