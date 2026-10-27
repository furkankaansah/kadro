'use strict';

require('./check-node'); // eski Node'da açık bir mesajla dur
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const C = require('./constants');

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(process.env.DB_FILE || path.join(dataDir, 'kadro.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  discord TEXT NOT NULL DEFAULT '',
  langs TEXT NOT NULL DEFAULT 'tr',
  hours TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  platforms TEXT NOT NULL DEFAULT 'pc',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_games (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'mid',
  ign TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, game_id)
);

-- "rooms": üç tür sohbet aynı tabloda:
--   lfg       oyun grubu: bir oyuna bağlı, herkese açık, geçici (uzun süre mesaj yazılmazsa kalkar)
--   community kalıcı arkadaş grubu: özel, davetle girilir, silinmez
--   dm        iki arkadaş arasındaki birebir mesajlaşma
-- (level/lang/voice/platform/starts_at sütunları eski sürümden kalma; artık kullanılmıyor.)
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('lfg', 'community', 'dm')),
  game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_public INTEGER NOT NULL DEFAULT 1,
  invite_code TEXT NOT NULL UNIQUE,
  max_members INTEGER NOT NULL DEFAULT 5,
  level TEXT NOT NULL DEFAULT 'any',
  lang TEXT NOT NULL DEFAULT 'any',
  voice TEXT NOT NULL DEFAULT 'optional',
  platform TEXT NOT NULL DEFAULT 'any',
  starts_at INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rooms_kind ON rooms(kind, status, created_at);

CREATE TABLE IF NOT EXISTS room_members (
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON room_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, id);

-- Arkadaşlık: user_a < user_b olacak şekilde tek satır. status: 'pending' (istek bekliyor) | 'accepted'
CREATE TABLE IF NOT EXISTS friendships (
  user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX IF NOT EXISTS idx_friend_b ON friendships(user_b);
`);

// Eski sürümden gelen veritabanları için eksik sütunu ekle.
const memberCols = db.prepare('PRAGMA table_info(room_members)').all().map((c) => c.name);
if (!memberCols.includes('last_read_id')) {
  db.exec('ALTER TABLE room_members ADD COLUMN last_read_id INTEGER NOT NULL DEFAULT 0');
}

// E-posta doğrulama sütunları (hem yeni hem eski veritabanlarında tek yolla eklenir).
// Eski hesaplar e-postasız olduğu için doğrulanmış sayılır (email_verified varsayılanı 1);
// yeni kayıtlar bunu açıkça 0 yazar.
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
const addUserCol = (name, ddl) => {
  if (!userCols.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${ddl}`);
};
addUserCol('email', 'TEXT COLLATE NOCASE');
addUserCol('email_verified', 'INTEGER NOT NULL DEFAULT 1');
addUserCol('verify_code_hash', 'TEXT');
addUserCol('verify_token_hash', 'TEXT');
addUserCol('verify_expires', 'INTEGER NOT NULL DEFAULT 0');
addUserCol('verify_attempts', 'INTEGER NOT NULL DEFAULT 0');
addUserCol('verify_sent_at', 'INTEGER NOT NULL DEFAULT 0');
// Şifre sıfırlama, oturum sürümü (şifre değişince eski oturumlar düşer), yasaklama ve şartların kabulü.
addUserCol('reset_code_hash', 'TEXT');
addUserCol('reset_token_hash', 'TEXT');
addUserCol('reset_expires', 'INTEGER NOT NULL DEFAULT 0');
addUserCol('reset_attempts', 'INTEGER NOT NULL DEFAULT 0');
addUserCol('reset_sent_at', 'INTEGER NOT NULL DEFAULT 0');
addUserCol('session_ver', 'INTEGER NOT NULL DEFAULT 0');
addUserCol('banned_at', 'INTEGER');
addUserCol('ban_reason', "TEXT NOT NULL DEFAULT ''");
addUserCol('accepted_terms_at', 'INTEGER');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token_hash) WHERE reset_token_hash IS NOT NULL');

// Moderasyon: engellemeler ve şikâyetler.
db.exec(`
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

-- Şikâyet: kanıt olarak içerik o anki haliyle (snapshot) saklanır; mesaj/grup sonradan silinse de yönetici görebilir.
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('user', 'message', 'group')),
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_username TEXT NOT NULL DEFAULT '',
  target_room_id INTEGER,
  target_message_id INTEGER,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  snapshot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT NOT NULL DEFAULT '',
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_user_id);

-- Yönetici işlemlerinin kaydı (kim, ne zaman, ne yaptı).
CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_username TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_verify_token ON users(verify_token_hash) WHERE verify_token_hash IS NOT NULL');

const upsertGame = db.prepare(
  `INSERT INTO games (id, name, color, platforms, sort) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color,
     platforms = excluded.platforms, sort = excluded.sort`
);
C.GAMES.forEach((g, i) => upsertGame.run(g.id, g.name, g.color, '', i));

const cache = new Map();
/** Hazır ifadeleri önbellekler (aynı SQL için tekrar tekrar derlemeyi önler). */
function prep(sql) {
  let st = cache.get(sql);
  if (!st) {
    st = db.prepare(sql);
    cache.set(sql, st);
  }
  return st;
}

/** Tek bir işlem (transaction) içinde çalıştırır; hata olursa geri alır. */
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* zaten kapanmış olabilir */
    }
    throw err;
  }
}

module.exports = { db, prep, tx, dataDir };
