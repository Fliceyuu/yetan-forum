// 好友关系 + 私聊 + 附件保存
import { db, now } from './db.js';
import { config } from './config.js';
import { MEDIA_TYPES, STICKER_TYPES, safeName, guessMime, kindLabel } from './media.js';
import { HttpError, assert, clean } from './utils.js';
import { aliasOf } from './posts.js';

/* =========================== 好友 =========================== */

const pairKey = (x, y) => (x < y ? [x, y] : [y, x]);

export function friendshipBetween(a, b) {
  if (!a || !b || a === b) return null;
  const [ua, ub] = pairKey(a, b);
  return db.query('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?').get(ua, ub) || null;
}

export function areFriends(a, b) {
  const f = friendshipBetween(a, b);
  return !!f && f.status === 'accepted';
}

export function isBlocked(a, b) {
  const f = friendshipBetween(a, b);
  return !!f && f.status === 'blocked';
}

// 关系视角：给 UI 用
export function friendState(viewerId, targetId) {
  if (!viewerId) return { state: 'anonymous' };
  if (viewerId === targetId) return { state: 'self' };
  if (isBlocked(viewerId, targetId) || isBlocked(targetId, viewerId)) return { state: 'blocked' };
  const f = friendshipBetween(viewerId, targetId);
  if (!f) return { state: 'none' };
  if (f.status === 'accepted') return { state: 'friends', since: f.updated_at };
  if (f.status === 'pending') {
    return f.requested_by === viewerId
      ? { state: 'requested', since: f.created_at, friendshipId: f.id }
      : { state: 'incoming', since: f.created_at, friendshipId: f.id };
  }
  return { state: 'none' };
}

export function requestFriend(viewer, targetId) {
  assert(viewer.id !== targetId, '不能加自己', 400);
  const target = db.query('SELECT id, alias FROM users WHERE id = ?').get(targetId);
  assert(target, '用户不存在', 404);
  const st = friendState(viewer.id, targetId);
  if (st.state === 'friends') throw new HttpError('你们已经是好友了');
  if (st.state === 'requested') throw new HttpError('申请已发出，等对方通过');
  if (st.state === 'blocked') throw new HttpError('对方已把你拉黑，无法申请', 403);
  if (st.state === 'incoming') {
    // 对方先申请过 → 直接互为好友（双向奔赴）
    return acceptFriend(viewer, st.friendshipId);
  }
  const [ua, ub] = pairKey(viewer.id, targetId);
  const t = now();
  db.query(
    'INSERT INTO friendships (user_a, user_b, status, requested_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(ua, ub, 'pending', viewer.id, t, t);
  notify(targetId, 'friend_request', `${viewer.alias} 想加你为好友`, null, { from: viewer.id });
  return { state: 'requested' };
}

export function acceptFriend(viewer, friendshipId) {
  const f = db.query('SELECT * FROM friendships WHERE id = ?').get(friendshipId);
  assert(f, '好友申请不存在', 404);
  assert(f.user_a === viewer.id || f.user_b === viewer.id, '无权操作', 403);
  assert(f.status === 'pending', '该申请已处理');
  const otherId = f.user_a === viewer.id ? f.user_b : f.user_a;
  db.query("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?").run(now(), f.id);
  notify(otherId, 'friend_accept', `${viewer.alias} 通过了你的好友申请`, null, { from: viewer.id });
  // 自动建会话，便于直接开聊
  ensureThread(viewer.id, otherId);
  return { state: 'friends' };
}

export function deleteFriend(viewer, targetId) {
  const f = friendshipBetween(viewer.id, targetId);
  assert(f, '你们还不是好友', 404);
  assert(f.user_a === viewer.id || f.user_b === viewer.id, '无权操作', 403);
  db.query('DELETE FROM friendships WHERE id = ?').run(f.id);
  return { state: 'none' };
}

export function blockUser(viewer, targetId) {
  assert(viewer.id !== targetId, '不能拉黑自己');
  const [ua, ub] = pairKey(viewer.id, targetId);
  const t = now();
  const f = friendshipBetween(viewer.id, targetId);
  if (f) db.query("UPDATE friendships SET status = 'blocked', requested_by = ?, updated_at = ? WHERE id = ?").run(viewer.id, t, f.id);
  else db.query('INSERT INTO friendships (user_a, user_b, status, requested_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(ua, ub, 'blocked', viewer.id, t, t);
  return { state: 'blocked' };
}

export function unblock(viewer, targetId) {
  const f = friendshipBetween(viewer.id, targetId);
  assert(f && f.status === 'blocked', '没有被拉黑', 404);
  db.query('DELETE FROM friendships WHERE id = ?').run(f.id);
  return { state: 'none' };
}

export function listFriends(userId) {
  const rows = db
    .query(
      `SELECT f.id AS friendship_id, f.status, f.requested_by, f.created_at, f.updated_at,
              u.id, u.alias, u.username, u.bio, u.last_seen_at
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
       WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'accepted'
       ORDER BY u.alias`
    )
    .all(userId, userId, userId);
  return rows.map((r) => ({
    friendshipId: r.friendship_id,
    user: { id: r.id, alias: r.alias, username: r.username, bio: r.bio, lastSeenAt: r.last_seen_at },
    since: r.updated_at,
  }));
}

export function listFriendRequests(userId) {
  const incoming = db
    .query(
      `SELECT f.id AS friendship_id, f.created_at, u.id, u.alias, u.username
       FROM friendships f JOIN users u ON u.id = f.requested_by
       WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'pending' AND f.requested_by != ?
       ORDER BY f.created_at DESC`
    )
    .all(userId, userId, userId);
  const outgoing = db
    .query(
      `SELECT f.id AS friendship_id, f.created_at, u.id, u.alias, u.username
       FROM friendships f JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
       WHERE (f.user_a = ? OR f.user_b = ?) AND f.status = 'pending' AND f.requested_by = ?
       ORDER BY f.created_at DESC`
    )
    .all(userId, userId, userId, userId);
  return {
    incoming: incoming.map((r) => ({ friendshipId: r.friendship_id, at: r.created_at, user: { id: r.id, alias: r.alias, username: r.username } })),
    outgoing: outgoing.map((r) => ({ friendshipId: r.friendship_id, at: r.created_at, user: { id: r.id, alias: r.alias, username: r.username } })),
  };
}

/* =========================== 私聊 =========================== */

export function ensureThread(a, b) {
  assert(a !== b, '不能和自己私聊');
  const [ua, ub] = pairKey(a, b);
  let t = db.query('SELECT * FROM dm_threads WHERE user_a = ? AND user_b = ?').get(ua, ub);
  if (t) return t;
  const ts = now();
  db.query('INSERT INTO dm_threads (user_a, user_b, last_at, created_at) VALUES (?, ?, ?, ?)').run(ua, ub, ts, ts);
  return db.query('SELECT * FROM dm_threads WHERE user_a = ? AND user_b = ?').get(ua, ub);
}

export function canMessage(senderId, targetId) {
  if (config.dmStranger) return true;
  if (areFriends(senderId, targetId)) return true;
  // 已有会话（曾经是好友或之前聊过）允许继续
  const [ua, ub] = pairKey(senderId, targetId);
  return !!db.query('SELECT 1 AS x FROM dm_threads WHERE user_a = ? AND user_b = ?').get(ua, ub);
}

function threadOf(threadId, viewerId) {
  const t = db.query('SELECT * FROM dm_threads WHERE id = ?').get(threadId);
  assert(t, '会话不存在', 404);
  assert(t.user_a === viewerId || t.user_b === viewerId, '无权查看该会话', 403);
  return t;
}

const otherOf = (thread, uid) => (thread.user_a === uid ? thread.user_b : thread.user_a);

export function listThreads(viewerId) {
  const rows = db
    .query(
      `SELECT t.*, u.id AS other_id, u.alias AS other_alias, u.username AS other_username, u.last_seen_at AS other_seen
       FROM dm_threads t
       JOIN users u ON u.id = CASE WHEN t.user_a = ? THEN t.user_b ELSE t.user_a END
       WHERE t.user_a = ? OR t.user_b = ?
       ORDER BY t.last_at DESC, t.id DESC`
    )
    .all(viewerId, viewerId, viewerId);

  return rows.map((t) => {
    const last = t.last_message_id ? db.query('SELECT * FROM dm_messages WHERE id = ?').get(t.last_message_id) : null;
    const lastAtt = last ? db.query('SELECT kind, mime FROM dm_attachments WHERE message_id = ? LIMIT 1').get(last.id) : null;
    const read = db.query('SELECT last_read_id FROM dm_reads WHERE thread_id = ? AND user_id = ?').get(t.id, viewerId);
    const unread = db
      .query('SELECT COUNT(*) AS n FROM dm_messages WHERE thread_id = ? AND sender_id != ? AND id > ? AND revoked_at IS NULL')
      .get(t.id, viewerId, read?.last_read_id ?? 0).n;
    return {
      id: t.id,
      other: { id: t.other_id, alias: t.other_alias, username: t.other_username, lastSeenAt: t.other_seen },
      lastAt: t.last_at,
      unread,
      preview: last
        ? {
            id: last.id,
            mine: last.sender_id === viewerId,
            body: last.revoked_at ? '[消息已撤回]' : last.body.slice(0, 60),
            kind: lastAtt?.kind || null,
            revoked: !!last.revoked_at,
          }
        : null,
    };
  });
}

export function unreadTotal(viewerId) {
  const rows = db
    .query(
      `SELECT t.id FROM dm_threads t WHERE t.user_a = ? OR t.user_b = ?`
    )
    .all(viewerId, viewerId);
  let n = 0;
  for (const t of rows) {
    const read = db.query('SELECT last_read_id FROM dm_reads WHERE thread_id = ? AND user_id = ?').get(t.id, viewerId);
    n += db
      .query('SELECT COUNT(*) AS c FROM dm_messages WHERE thread_id = ? AND sender_id != ? AND id > ? AND revoked_at IS NULL')
      .get(t.id, viewerId, read?.last_read_id ?? 0).c;
  }
  return n;
}

function msgAttachments(ids) {
  if (!ids.length) return new Map();
  const rows = db
    .query(`SELECT * FROM dm_attachments WHERE message_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`)
    .all(...ids);
  const map = new Map();
  for (const r of rows) {
    const list = map.get(r.message_id) || [];
    list.push({
      id: r.id,
      url: `/uploads/${r.filename}`,
      name: r.original || r.filename,
      mime: r.mime,
      bytes: r.bytes,
      kind: r.kind,
      width: r.width,
      height: r.height,
    });
    map.set(r.message_id, list);
  }
  return map;
}

export function listMessages(threadId, viewerId, { after = 0, before = 0, limit = 40 } = {}) {
  const t = threadOf(threadId, viewerId);
  const other = otherOf(t, viewerId);
  let rows;
  if (after) {
    rows = db
      .query('SELECT * FROM dm_messages WHERE thread_id = ? AND id > ? ORDER BY id ASC LIMIT ?')
      .all(threadId, after, limit);
  } else if (before) {
    rows = db
      .query('SELECT * FROM dm_messages WHERE thread_id = ? AND id < ? ORDER BY id DESC LIMIT ?')
      .all(threadId, before, limit);
    rows.reverse();
  } else {
    rows = db.query('SELECT * FROM dm_messages WHERE thread_id = ? ORDER BY id DESC LIMIT ?').all(threadId, limit);
    rows.reverse();
  }
  const atts = msgAttachments(rows.map((r) => r.id));
  const prev = rows.length ? db.query('SELECT id FROM dm_messages WHERE thread_id = ? AND id < ? ORDER BY id DESC LIMIT 1').get(threadId, rows[0].id) : null;
  const next = rows.length ? db.query('SELECT id FROM dm_messages WHERE thread_id = ? AND id > ? ORDER BY id ASC LIMIT 1').get(threadId, rows[rows.length - 1].id) : null;
  const otherUser = db.query('SELECT id, alias, username, last_seen_at FROM users WHERE id = ?').get(other);
  return {
    thread: { id: t.id, other: { id: otherUser.id, alias: otherUser.alias, username: otherUser.username, lastSeenAt: otherUser.last_seen_at }, friendState: friendState(viewerId, other) },
    messages: rows.map((r) => messageDto(r, viewerId, atts.get(r.id) || [])),
    hasPrev: !!prev,
    hasNext: !!next,
    canSend: canMessage(viewerId, other) && !isBlocked(other, viewerId),
  };
}

const messageDto = (r, viewerId, attachments) => ({
  id: r.id,
  threadId: r.thread_id,
  mine: r.sender_id === viewerId,
  senderId: r.sender_id,
  body: r.revoked_at ? '' : r.body,
  revoked: !!r.revoked_at,
  createdAt: r.created_at,
  replyTo: r.reply_to,
  attachments,
  status: r.sender_id === viewerId ? 'sent' : 'received',
});

export async function sendMessage(viewer, threadId, { body, replyTo, files = [] }) {
  const t = threadOf(threadId, viewer.id);
  const other = otherOf(t, viewer.id);
  assert(!isBlocked(other, viewer.id), '你已被对方拉黑，无法发送', 403);
  assert(!isBlocked(viewer.id, other), '你已拉黑对方，先解除拉黑', 403);
  assert(canMessage(viewer.id, other), '需要先成为好友才能私聊', 403);

  const text = clean(body, 2000);
  const list = files.filter((f) => f instanceof File && f.size > 0);
  assert(list.length <= config.maxFilesPerMessage, `每条消息最多 ${config.maxFilesPerMessage} 个附件`, 413);
  assert(text.length > 0 || list.length > 0, '消息不能为空');

  const ts = now();
  const res = db
    .query('INSERT INTO dm_messages (thread_id, sender_id, body, reply_to, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(threadId, viewer.id, text, replyTo || null, ts);
  const id = Number(res.lastInsertRowid);

  const saved = [];
  for (const file of list) {
    const mime = guessMime(file);
    const def = MEDIA_TYPES[mime];
    if (!def) throw new HttpError(`不支持的文件类型：${mime}`, 415);
    const limit = def.kind === 'video' ? config.maxVideoBytes : def.kind === 'file' ? config.maxFileBytes : config.maxUploadBytes;
    assert(file.size <= limit, `${kindLabel[def.kind]}不能超过 ${Math.round(limit / 1024 / 1024)}MB`, 413);
    const filename = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${def.ext}`;
    await Bun.write(`${config.uploadDir}/${filename}`, file);
    db.query(
      'INSERT INTO dm_attachments (message_id, filename, original, mime, bytes, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, filename, safeName(file.name, `file.${def.ext}`), mime, file.size, def.kind, ts);
    saved.push({ url: `/uploads/${filename}`, mime, kind: def.kind });
  }

  db.query('UPDATE dm_threads SET last_message_id = ?, last_at = ? WHERE id = ?').run(id, ts, threadId);
  // 对方未读计数靠 dm_reads 水位自动变化；这里只发一条站内提示（不刷屏：同一会话 10 分钟内只提示一次）
  const recent = db
    .query("SELECT 1 AS x FROM notifications WHERE user_id = ? AND kind = 'dm' AND post_id IS NULL AND created_at > ?")
    .get(other, ts - 10 * 60 * 1000);
  if (!recent) notify(other, 'dm', `${viewer.alias} 在私聊里找你`, null, { from: viewer.id, threadId });

  const row = db.query('SELECT * FROM dm_messages WHERE id = ?').get(id);
  return messageDto(row, viewer.id, msgAttachments([id]).get(id) || []);
}

export function revokeMessage(viewer, messageId) {
  const m = db.query('SELECT * FROM dm_messages WHERE id = ?').get(messageId);
  assert(m, '消息不存在', 404);
  assert(m.sender_id === viewer.id, '只能撤回自己的消息', 403);
  assert(now() - m.created_at <= 2 * 60 * 1000, '超过 2 分钟不能撤回');
  db.query('UPDATE dm_messages SET revoked_at = ?, body = ? WHERE id = ?').run(now(), '', messageId);
  return { revoked: true };
}

export function markRead(viewer, threadId, lastReadId) {
  const t = threadOf(threadId, viewer.id);
  const cur = db.query('SELECT last_read_id FROM dm_reads WHERE thread_id = ? AND user_id = ?').get(threadId, viewer.id);
  const nid = Math.max(lastReadId || 0, cur?.last_read_id || 0);
  if (cur) db.query('UPDATE dm_reads SET last_read_id = ?, updated_at = ? WHERE thread_id = ? AND user_id = ?').run(nid, now(), threadId, viewer.id);
  else db.query('INSERT INTO dm_reads (thread_id, user_id, last_read_id, updated_at) VALUES (?, ?, ?, ?)').run(threadId, viewer.id, nid, now());
  return { lastReadId: nid, threadId: t.id };
}

export async function deleteThread(viewer, threadId) {
  const t = threadOf(threadId, viewer.id);
  const ids = db.query('SELECT id FROM dm_messages WHERE thread_id = ?').all(threadId).map((r) => r.id);
  if (ids.length) {
    const files = db.query(`SELECT filename FROM dm_attachments WHERE message_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    for (const f of files) {
      try {
        await Bun.file(`${config.uploadDir}/${f.filename}`).delete();
      } catch {}
    }
  }
  db.query('DELETE FROM dm_threads WHERE id = ?').run(t.id);
  return { deleted: true };
}

/* =========================== 表情包 =========================== */

export function listStickers() {
  return db.query('SELECT * FROM stickers ORDER BY sort, id').all().map((s) => ({
    id: s.id,
    // 内置表情放在 public/stickers（受信任的静态资源），上传的表情在 uploads；地址统一走 /uploads
    url: `/uploads/${s.filename}`,
    name: s.name,
    bytes: s.bytes,
  }));
}

export function stickerFiles() {
  return db.query('SELECT filename FROM stickers').all().map((r) => r.filename);
}

export async function addSticker(file, name = '') {
  const mime = guessMime(file);
  assert(STICKER_TYPES[mime], '表情包只收 png / jpg / webp / gif', 415);
  assert(file.size <= config.maxStickerBytes, `表情包不能超过 ${Math.round(config.maxStickerBytes / 1024 / 1024)}MB`, 413);
  const filename = `sticker-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}.${STICKER_TYPES[mime]}`;
  await Bun.write(`${config.uploadDir}/${filename}`, file);
  const sort = db.query('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM stickers').get().s;
  const res = db
    .query('INSERT INTO stickers (filename, name, mime, bytes, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(filename, clean(name, 20) || '表情', mime, file.size, sort, now());
  return { id: Number(res.lastInsertRowid), url: `/uploads/${filename}`, name: clean(name, 20) || '表情' };
}

export function removeSticker(viewer, id) {
  const s = db.query('SELECT * FROM stickers WHERE id = ?').get(id);
  assert(s, '表情不存在', 404);
  db.query('DELETE FROM stickers WHERE id = ?').run(id);
  try {
    Bun.file(`${config.uploadDir}/${s.filename}`).delete();
  } catch {}
  return { deleted: true };
}

// 表情包也作为一条"图片消息"存在 dm_attachments 里，kind = sticker
export async function sendSticker(viewer, threadId, stickerId) {
  const t = threadOf(threadId, viewer.id);
  const other = otherOf(t, viewer.id);
  assert(!isBlocked(other, viewer.id) && !isBlocked(viewer.id, other), '无法发送', 403);
  assert(canMessage(viewer.id, other), '需要先成为好友才能私聊', 403);
  const s = db.query('SELECT * FROM stickers WHERE id = ?').get(stickerId);
  assert(s, '表情不存在', 404);
  const ts = now();
  const res = db
    .query('INSERT INTO dm_messages (thread_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(threadId, viewer.id, '', ts);
  const id = Number(res.lastInsertRowid);
  db.query(
    'INSERT INTO dm_attachments (message_id, filename, original, mime, bytes, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, s.filename, s.name, s.mime, s.bytes, 'sticker', ts);
  db.query('UPDATE dm_threads SET last_message_id = ?, last_at = ? WHERE id = ?').run(id, ts, threadId);
  const row = db.query('SELECT * FROM dm_messages WHERE id = ?').get(id);
  return messageDto(row, viewer.id, msgAttachments([id]).get(id) || []);
}

/* =========================== 通用：通知 =========================== */

export function notify(userId, kind, text, postId, extra = {}) {
  if (userId == null) return;
  db.query('INSERT INTO notifications (user_id, kind, text, post_id, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    userId,
    kind,
    text,
    postId ?? null,
    JSON.stringify(extra),
    now()
  );
}

// 资料卡：给"用户主页"用
export function userCard(viewerId, userId) {
  const u = db.query('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u) return null;
  const stats = db
    .query(
      `SELECT COUNT(*) AS posts, COALESCE(SUM(like_count),0) AS likes, COALESCE(SUM(comment_count),0) AS comments, COALESCE(SUM(views),0) AS views
       FROM posts WHERE user_id = ? AND status = 'published'`
    )
    .get(userId);
  const thread = viewerId && viewerId !== userId ? ensureThreadQuiet(viewerId, userId) : null;
  return {
    user: { id: u.id, alias: u.alias, username: u.username, bio: u.bio, isAdmin: !!u.is_admin, createdAt: u.created_at, lastSeenAt: u.last_seen_at },
    stats,
    anonymous: u.id === userId ? aliasOf(u.id) : null,
    relation: friendState(viewerId, u.id),
    canMessage: viewerId ? canMessage(viewerId, userId) : false,
    threadId: thread?.id ?? null,
  };
}

function ensureThreadQuiet(a, b) {
  const [ua, ub] = pairKey(a, b);
  return db.query('SELECT * FROM dm_threads WHERE user_a = ? AND user_b = ?').get(ua, ub) || null;
}
