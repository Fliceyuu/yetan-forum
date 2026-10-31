import { db, now } from './db.js';
import { config } from './config.js';
import * as P from './posts.js';
import { HttpError, assert } from './utils.js';
import { publicUser } from './auth.js';
import { inspectImage } from './image-meta.js';
import { MEDIA_TYPES, kindLabel, safeName, guessMime } from './media.js';

export const REPORT_REASONS = {
  fake: '编造/引流',
  illegal: '违法或危险行为',
  harassment: '人身攻击、骚扰',
  privacy: '泄露他人隐私',
  other: '其他',
};

// ---------------- 评论 ----------------
export function listComments(postId, viewerId) {
  const rows = db
    .query(
      `SELECT c.id, c.post_id, c.user_id, c.parent_id, c.body, c.anonymous, c.created_at, u.alias, u.username
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? AND c.status = 'published' ORDER BY c.id ASC`
    )
    .all(postId);
  const map = new Map();
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      postId: r.post_id,
      parentId: r.parent_id,
      body: r.body,
      createdAt: r.created_at,
      author: r.anonymous ? { alias: P.aliasOf(r.user_id), anonymous: true } : { id: r.user_id, alias: r.alias, username: r.username },
      mine: viewerId === r.user_id,
      replies: [],
    });
  }
  const roots = [];
  for (const c of map.values()) {
    if (c.parentId && map.has(c.parentId)) map.get(c.parentId).replies.push(c);
    else roots.push(c);
  }
  return roots;
}

export function addComment(user, postId, { body, parentId, anonymous }) {
  const text = String(body ?? '').trim().slice(0, 2000);
  assert(text.length >= 1, '评论不能为空');
  const post = db.query('SELECT id, status, user_id FROM posts WHERE id = ?').get(postId);
  assert(post && post.status === 'published', '帖子不存在', 404);
  let parent = null;
  if (parentId) {
    parent = db.query('SELECT id, post_id, user_id FROM comments WHERE id = ?').get(parentId);
    assert(parent && parent.post_id === postId, '回复的评论不存在');
  }
  const t = now();
  const res = db
    .query('INSERT INTO comments (post_id, user_id, parent_id, body, anonymous, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(postId, user.id, parent?.id ?? null, text, anonymous ? 1 : 0, t);
  db.query('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?').run(postId);

  // 站内通知：被回复的人（不是自己）与楼主
  const targets = new Set();
  if (parent && parent.user_id !== user.id) targets.add(parent.user_id);
  if (post.user_id !== user.id) targets.add(post.user_id);
  for (const uid of targets) {
    notify(uid, 'reply', `有人在《${db.query('SELECT title FROM posts WHERE id = ?').get(postId).title}》回复了你`, postId);
  }
  return { id: Number(res.lastInsertRowid), createdAt: t };
}

// ---------------- 点赞 / 收藏 ----------------
export function toggleLike(user, postId) {
  const has = db.query('SELECT 1 AS x FROM likes WHERE user_id = ? AND post_id = ?').get(user.id, postId);
  if (has) {
    db.query('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(user.id, postId);
    db.query('UPDATE posts SET like_count = MAX(like_count - 1, 0) WHERE id = ?').run(postId);
  } else {
    db.query('INSERT INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)').run(user.id, postId, now());
    db.query('UPDATE posts SET like_count = like_count + 1 WHERE id = ?').run(postId);
  }
  const n = db.query('SELECT like_count FROM posts WHERE id = ?').get(postId);
  return { liked: !has, likes: n?.like_count ?? 0 };
}

export function toggleBookmark(user, postId) {
  const has = db.query('SELECT 1 AS x FROM bookmarks WHERE user_id = ? AND post_id = ?').get(user.id, postId);
  if (has) db.query('DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?').run(user.id, postId);
  else db.query('INSERT INTO bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?)').run(user.id, postId, now());
  return { bookmarked: !has };
}

export function viewerState(user, postId) {
  if (!user) return { liked: false, bookmarked: false };
  return {
    liked: !!db.query('SELECT 1 AS x FROM likes WHERE user_id = ? AND post_id = ?').get(user.id, postId),
    bookmarked: !!db.query('SELECT 1 AS x FROM bookmarks WHERE user_id = ? AND post_id = ?').get(user.id, postId),
  };
}

// ---------------- 举报 ----------------
export function addReport(user, { postId, commentId, reason, detail }) {
  assert(REPORT_REASONS[reason] || reason, '请选择举报原因');
  assert(postId || commentId, '举报对象缺失');
  const ip = user?.id ?? 0;
  db.query('INSERT INTO reports (user_id, post_id, comment_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    user?.id ?? null,
    postId ?? null,
    commentId ?? null,
    String(reason).slice(0, 40),
    String(detail ?? '').slice(0, 500),
    now()
  );
  return { ok: true, reporterRef: ip };
}

// ---------------- 通知（轻量站内消息） ----------------
export function notify(userId, kind, text, postId) {
  if (userId == null) return;
  db.query("INSERT INTO notifications (user_id, kind, text, post_id, meta, created_at) VALUES (?, ?, ?, ?, '{}', ?)").run(
    userId,
    kind,
    text,
    postId ?? null,
    now()
  );
}
// 社交模块（好友/私聊）自带带 meta 的通知实现

// ---------------- 附件：图片 / 视频 / 音频 / 文件 ----------------
const kindLimit = (kind) =>
  kind === 'video' ? config.maxVideoBytes : kind === 'file' ? config.maxFileBytes : config.maxUploadBytes;

export async function saveUploads(postId, files) {
  const list = files.filter((f) => f instanceof File && f.size > 0);
  assert(list.length <= config.maxFilesPerPost, `最多上传 ${config.maxFilesPerPost} 个文件`, 413);
  const saved = [];
  for (const file of list) {
    const mime = guessMime(file);
    const def = MEDIA_TYPES[mime];
    if (!def) {
      throw new HttpError(
        `不支持的文件类型：${file.type || mime}。可用：图片(png/jpg/webp/gif)、视频(mp4/webm/mov)、音频(mp3/m4a/ogg/wav)、文件(pdf/zip/txt)`,
        415
      );
    }
    const limit = kindLimit(def.kind);
    assert(file.size <= limit, `${kindLabel[def.kind]}不能超过 ${Math.round(limit / 1024 / 1024)}MB`, 413);
    // 图片：读头判断尺寸与像素量，防止超大图把读者手机撑爆；同时记录宽高供前端留位
    let dims = null;
    if (def.kind === 'image') {
      const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
      const info = inspectImage(bytes);
      if (!info.ok) throw new HttpError(info.reason || '图片无法识别', 415);
      dims = info;
    }
    const name = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${def.ext}`;
    await Bun.write(`${config.uploadDir}/${name}`, file);
    db.query(
      'INSERT INTO attachments (post_id, filename, original, mime, bytes, kind, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(postId, name, safeName(file.name, `file.${def.ext}`), mime, file.size, def.kind, dims?.width ?? null, dims?.height ?? null, now());
    saved.push({ url: `/uploads/${name}`, mime, bytes: file.size, kind: def.kind, width: dims?.width ?? null, height: dims?.height ?? null });
  }
  return saved;
}

// ---------------- 个人主页 ----------------
export function profileOf(userId, viewerId) {
  const u = db.query('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u) return null;
  const stats = db
    .query(
      `SELECT COUNT(*) AS posts, COALESCE(SUM(like_count),0) AS likes, COALESCE(SUM(comment_count),0) AS comments,
              COALESCE(SUM(views),0) AS views
       FROM posts WHERE user_id = ? AND status = 'published'`
    )
    .get(userId);
  return { user: publicUser(u), stats, isSelf: viewerId === userId };
}

export function adminStats() {
  const g = (sql, ...a) => db.query(sql).get(...a);
  return {
    users: g('SELECT COUNT(*) AS n FROM users').n,
    posts: g("SELECT COUNT(*) AS n FROM posts WHERE status = 'published'").n,
    pending: g("SELECT COUNT(*) AS n FROM posts WHERE status = 'pending'").n,
    comments: g('SELECT COUNT(*) AS n FROM comments').n,
    openReports: g("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").n,
    uploads: g('SELECT COUNT(*) AS n, COALESCE(SUM(bytes),0) AS b FROM attachments'),
    dm: {
      threads: g('SELECT COUNT(*) AS n FROM dm_threads').n,
      messages: g('SELECT COUNT(*) AS n FROM dm_messages').n,
      attachments: g('SELECT COUNT(*) AS n, COALESCE(SUM(bytes),0) AS b FROM dm_attachments'),
    },
    friends: g("SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted'").n,
    pendingFriends: g("SELECT COUNT(*) AS n FROM friendships WHERE status = 'pending'").n,
    stickers: g('SELECT COUNT(*) AS n FROM stickers').n,
    topCategories: db.query("SELECT category, COUNT(*) AS n FROM posts WHERE status = 'published' GROUP BY category ORDER BY n DESC").all(),
  };
}
