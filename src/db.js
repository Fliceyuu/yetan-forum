import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });
mkdirSync(config.uploadDir, { recursive: true });

export const db = new Database(config.dbPath, { create: true });
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

export function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    alias         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    body          TEXT NOT NULL,
    category      TEXT NOT NULL DEFAULT 'other',
    location      TEXT NOT NULL DEFAULT '',
    happened_at   TEXT NOT NULL DEFAULT '',
    anonymous     INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'published',
    views         INTEGER NOT NULL DEFAULT 0,
    like_count    INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_posts_cat  ON posts(status, category, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    anonymous  INTEGER NOT NULL DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'published',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, id);

  CREATE TABLE IF NOT EXISTS attachments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    mime       TEXT NOT NULL,
    bytes      INTEGER NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'image',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attachments_post ON attachments(post_id);

  CREATE TABLE IF NOT EXISTS likes (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    reason     TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

  CREATE TABLE IF NOT EXISTS tags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag     TEXT NOT NULL,
    PRIMARY KEY (post_id, tag)
  );
  CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    text       TEXT NOT NULL,
    post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    read_at    INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);

  -- ===== 好友：一条记录代表"一对"关系，user_a < user_b 归一化，避免重复 =====
  CREATE TABLE IF NOT EXISTS friendships (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'pending', -- pending 待通过 / accepted 好友 / blocked 已拉黑
    requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (user_a, user_b),
    CHECK (user_a < user_b)
  );
  CREATE INDEX IF NOT EXISTS idx_friend_a ON friendships(user_a, status);
  CREATE INDEX IF NOT EXISTS idx_friend_b ON friendships(user_b, status);

  -- ===== 私聊 =====
  CREATE TABLE IF NOT EXISTS dm_threads (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_message_id INTEGER,
    last_at        INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL,
    UNIQUE (user_a, user_b),
    CHECK (user_a < user_b)
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id  INTEGER NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
    sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL DEFAULT '',
    reply_to   INTEGER REFERENCES dm_messages(id) ON DELETE SET NULL,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dm_msg_thread ON dm_messages(thread_id, id);

  -- 会话内已读水位：读取到哪条消息
  CREATE TABLE IF NOT EXISTS dm_reads (
    thread_id  INTEGER NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_id INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (thread_id, user_id)
  );

  -- 消息附件（图片/视频/音频/文件/表情包）
  CREATE TABLE IF NOT EXISTS dm_attachments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    original   TEXT NOT NULL DEFAULT '',
    mime       TEXT NOT NULL,
    bytes      INTEGER NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'image', -- image / video / audio / file / sticker
    width      INTEGER,
    height     INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dm_att_msg ON dm_attachments(message_id);

  -- 表情包库（管理员上传，所有人可用）
  CREATE TABLE IF NOT EXISTS stickers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT NOT NULL,
    name       TEXT NOT NULL DEFAULT '表情',
    mime       TEXT NOT NULL,
    bytes      INTEGER NOT NULL DEFAULT 0,
    sort       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  -- ===== 区级地域：只在能识别出城区时写入；绝不保存街道、门牌、用户坐标 =====
  CREATE TABLE IF NOT EXISTS post_regions (
    post_id    INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    city       TEXT NOT NULL,
    area       TEXT,
    key        TEXT NOT NULL,
    lat        REAL NOT NULL,
    lng        REAL NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_post_regions_key ON post_regions(key);
  CREATE INDEX IF NOT EXISTS idx_post_regions_city ON post_regions(city);
  `);
}

// 老库平滑升级（幂等）
export function upgradeRegions() {
  const cols = db.query('PRAGMA table_info(posts)').all().map((r) => r.name);
  if (!cols.includes('region_key')) db.exec('ALTER TABLE posts ADD COLUMN region_key TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_posts_region ON posts(region_key)');
}

// 老库升级：给早先的表补字段（PRAGMA 判断，幂等）
export function upgrade() {
  const cols = (table) => new Set(db.query(`PRAGMA table_info(${table})`).all().map((r) => r.name));
  const add = (table, col, ddl) => {
    if (!cols(table).has(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
  };
  // 帖子附件：补保存的文件名，方便详情页显示"xx.jpg"
  add('attachments', 'original', "TEXT NOT NULL DEFAULT ''");
  add('attachments', 'width', 'INTEGER');
  add('attachments', 'height', 'INTEGER');
  // 用户：公开主页与个性签名
  add('users', 'bio', "TEXT NOT NULL DEFAULT ''");
  add('users', 'last_seen_at', 'INTEGER NOT NULL DEFAULT 0');
  // 通知：携带跳转信息（私聊会话、好友申请等）
  add('notifications', 'meta', "TEXT NOT NULL DEFAULT '{}'");
  upgradeRegions();
}


export const now = () => Date.now();
