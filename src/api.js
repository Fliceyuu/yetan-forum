import { db, now } from './db.js';
import { config, CATEGORIES } from './config.js';
import { ok, fail, handled, HttpError, assert, clean, pagination, rateLimit, clientIp, int } from './utils.js';
import {
  currentUser,
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
  requireUser,
  requireAdmin,
  publicUser,
  sessionCookie,
  clearCookie,
} from './auth.js';
import * as P from './posts.js';
import * as F from './features.js';
import * as R from './regions-store.js';
import * as S from './social.js';

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/;

function validateRegister({ username, password, alias }) {
  username = clean(username, 20);
  assert(USERNAME_RE.test(username), '用户名 2-20 位，只能包含中英文、数字、下划线');
  assert(typeof password === 'string' && password.length >= 6, '密码至少 6 位');
  assert(password.length <= 72, '密码太长');
  const name = clean(alias, 20) || username;
  return { username, password, alias: name };
}

async function readBody(req) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await req.json().catch(() => ({}))) || {};
  if (ct.includes('form') || ct.includes('multipart')) return await req.formData();
  return {};
}

const safeJson = (s) => {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
};

async function routeApi(req, url, app) {
  const user = await currentUser(req);
  const { pathname } = url;
  const method = req.method;
  const seg = pathname.split('/').filter(Boolean).slice(1); // 去掉 api
  const ip = clientIp(req);
  const route = `${method} ${pathname}`;

  // ---------- 元信息 ----------
  if (route === 'GET /api/meta') {
    const t = db.query("SELECT tag, COUNT(*) AS n FROM tags GROUP BY tag ORDER BY n DESC LIMIT 16").all();
    return ok({
      site: { name: config.siteName, tagline: config.siteTagline },
      categories: CATEGORIES,
      demoMode: config.demoMode,
      tags: t,
      media: {
        post: { image: 'image/png,image/jpeg,image/webp,image/gif', video: 'video/mp4,video/webm,video/quicktime', audio: 'audio/mpeg,audio/mp4,audio/webm,audio/ogg,audio/wav', file: 'application/pdf,application/zip,text/plain' },
        limits: {
          image: config.maxUploadBytes,
          video: config.maxVideoBytes,
          audio: config.maxUploadBytes,
          file: config.maxFileBytes,
          sticker: config.maxStickerBytes,
        },
        filesPerPost: config.maxFilesPerPost,
        filesPerMessage: config.maxFilesPerMessage,
      },
      dmStranger: config.dmStranger,
      cities: R.cityHints().map((r) => r.city),
      regionKeys: R.regionCounts().map((r) => r.key),
      rules: [
        '写经历，不写教程：请勿发布任何形式的做法、招魂、仪式步骤。',
        '真实优先：编造、剧本、引流一律下架。',
        '别泄隐私：请模糊处理门牌、单位、他人姓名与正脸。',
        '不吓人、不害人：不要鼓励他人前往危险地点或尝试危险行为。',
        '身体与心理不适请先就医，这里不提供医疗与占卜结论。',
      ],
    });
  }

  // ---------- 认证 ----------
  if (route === 'POST /api/auth/register') {
    if (!rateLimit(`reg:${ip}`, 10, 60_000)) throw new HttpError('操作太频繁，稍后再试', 429);
    const body = await readBody(req);
    const { username, password, alias } = validateRegister(body);
    assert(!db.query('SELECT 1 AS x FROM users WHERE username = ?').get(username), '这个用户名已经有人用了');
    const hash = await hashPassword(password);
    const res = db
      .query('INSERT INTO users (username, alias, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(username, alias, hash, now());
    const id = Number(res.lastInsertRowid);
    const { token, expiresAt } = await createSession(id);
    return ok({ user: publicUser(db.query('SELECT * FROM users WHERE id = ?').get(id)), token, expiresAt }, {
      headers: { 'Set-Cookie': sessionCookie(token, expiresAt) },
    });
  }

  if (route === 'POST /api/auth/login') {
    if (!rateLimit(`login:${ip}`, 20, 60_000)) throw new HttpError('尝试过于频繁，请稍后再试', 429);
    const body = await readBody(req);
    const username = clean(body.username, 20);
    const row = db.query('SELECT * FROM users WHERE username = ?').get(username);
    const good = row && (await verifyPassword(String(body.password ?? ''), row.password_hash));
    // 统一错误信息，避免用户名枚举
    assert(good, '用户名或密码不正确', 401);
    const { token, expiresAt } = await createSession(row.id);
    return ok({ user: publicUser(row), token, expiresAt }, {
      headers: { 'Set-Cookie': sessionCookie(token, expiresAt) },
    });
  }

  if (route === 'POST /api/auth/logout') {
    await destroySession(req.headers.get('cookie')?.match(/sid=([^;]+)/)?.[1]);
    return ok({ loggedOut: true }, { headers: { 'Set-Cookie': clearCookie() } });
  }

  if (route === 'GET /api/auth/me') {
    if (!user) return ok({ user: null });
    const unread = db.query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(user.id).n;
    const pendingFriends = db
      .query("SELECT COUNT(*) AS n FROM friendships WHERE (user_a = ? OR user_b = ?) AND status = 'pending' AND requested_by != ?")
      .get(user.id, user.id, user.id).n;
    return ok({ user: publicUser(user), unread, unreadDm: S.unreadTotal(user.id), pendingFriends });
  }

  if (route === 'POST /api/auth/profile') {
    requireUser(user);
    const body = await readBody(req);
    db.query('UPDATE users SET bio = ?, alias = COALESCE(NULLIF(?, \'\'), alias) WHERE id = ?').run(
      clean(body.bio, 120),
      clean(body.alias, 20),
      user.id
    );
    return ok({ user: publicUser(db.query('SELECT * FROM users WHERE id = ?').get(user.id)) });
  }

  if (route === 'POST /api/auth/password') {
    requireUser(user);
    const body = await readBody(req);
    assert(await verifyPassword(String(body.oldPassword ?? ''), user.password_hash), '原密码不正确', 403);
    assert(String(body.newPassword ?? '').length >= 6, '新密码至少 6 位');
    db.query('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(String(body.newPassword)), user.id);
    return ok({ changed: true });
  }

  // ---------- 帖子 ----------
  if (route === 'GET /api/posts') {
    const q = url.searchParams;
    const { limit, page } = pagination(url);
    const category = q.get('category');
    const result = P.listPosts({
      viewerId: user?.id,
      category: category && category !== 'all' ? category : null,
      q: clean(q.get('q'), 60) || null,
      sort: q.get('sort') || 'new',
      page,
      limit,
      tag: clean(q.get('tag'), 20) || null,
      region: clean(q.get('region'), 40) || null,
      userId: q.get('author') ? int(q.get('author')) : null,
    });
    return ok(result);
  }

  if (route === 'POST /api/posts') {
    requireUser(user);
    if (!rateLimit(`post:${user.id}`, 6, 10 * 60_000)) throw new HttpError('发帖太频繁了，喝口水再写', 429);
    const ct = req.headers.get('content-type') || '';
    let input;
    let files = [];
    if (ct.includes('multipart')) {
      const form = await readBody(req);
      input = {
        title: form.get('title'),
        body: form.get('body'),
        category: form.get('category'),
        location: form.get('location'),
        happenedAt: form.get('happenedAt'),
        anonymous: form.get('anonymous') === 'true' || form.get('anonymous') === 'on',
      };
      files = form.getAll('files');
    } else {
      input = await readBody(req);
    }
    const { id, status } = P.createPost(user, input);
    let uploadError = null;
    if (files.length) {
      try {
        await F.saveUploads(id, files);
      } catch (e) {
        // 正文已入库：附件不合法时保留正文，但把原因如实告诉用户（旧版这里是静默吞掉的）
        uploadError = e.message;
        console.error('[upload]', e.message);
      }
    }
    const post = P.getPost(id, user.id);
    return ok({ post, status, uploadError }, { status: 201 });
  }

  if (seg[0] === 'posts' && seg[1]) {
    const postId = int(seg[1]);
    const row = db.query('SELECT id, user_id, status FROM posts WHERE id = ?').get(postId);
    if (!row) throw new HttpError('帖子不存在', 404);
    const mine = user && row.user_id === user.id;
    if (row.status !== 'published' && !mine && !user?.is_admin) throw new HttpError('帖子不存在', 404);

    if (method === 'GET' && seg.length === 2) {
      const post = P.getPost(postId, user?.id);
      const fresh = seg.length === 2 && !url.searchParams.get('nohit');
      if (fresh && !(user && post.mine)) {
        P.incrementViews(postId);
        post.views += 1;
      }
      return ok({
        post,
        comments: F.listComments(postId, user?.id),
        viewer: F.viewerState(user, postId),
        reportReasons: F.REPORT_REASONS,
      });
    }

    if (method === "PATCH" && seg.length === 2) {
      requireUser(user);
      assert(mine || user.is_admin, "只能编辑自己的帖子", 403);
      const ct = req.headers.get("content-type") || "";
      let uploadError = null;
      let body;
      if (ct.includes("multipart")) {
        const form = await readBody(req);
        body = {
          title: form.get("title"),
          body: form.get("body"),
          category: form.get("category"),
          location: form.get("location"),
          happenedAt: form.get("happenedAt"),
          anonymous: form.get("anonymous") === "true",
        };
        try {
          const added = await F.saveUploads(postId, form.getAll("files"));
          body.addedFiles = added.length;
        } catch (e) {
          uploadError = e.message;
        }
      } else {
        body = await readBody(req);
      }
      const title = body.title != null ? clean(body.title, 80) : null;
      const text = body.body != null ? clean(body.body, 8000) : null;
      if (title != null) assert(title.length >= 2, '标题至少 2 个字');
      if (text != null) assert(text.length >= 10, '正文至少 10 个字');
      const cat = body.category ? P.normalizeCategory(body.category) : null;
      if (body.category) assert(cat, '分类不存在');
      db.query(
        `UPDATE posts SET title = COALESCE(?, title), body = COALESCE(?, body), category = COALESCE(?, category),
           location = COALESCE(?, location), happened_at = COALESCE(?, happened_at), anonymous = COALESCE(?, anonymous), updated_at = ?
         WHERE id = ?`
      ).run(
        title,
        text,
        cat,
        body.location != null ? clean(body.location, 40) : null,
        body.happenedAt != null ? clean(body.happenedAt, 20) : null,
        body.anonymous != null ? (body.anonymous ? 1 : 0) : null,
        now(),
        postId
      );
      if (body.location != null) {
        try {
          R.saveRegion(postId, clean(body.location, 40));
        } catch (e) {
          console.error('[region]', e.message);
        }
      }
      return ok({ post: P.getPost(postId, user.id), uploadError });
    }

    if (method === 'DELETE' && seg.length === 2) {
      requireUser(user);
      assert(mine || user.is_admin, '只能删除自己的帖子', 403);
      for (const f of db.query('SELECT filename FROM attachments WHERE post_id = ?').all(postId)) {
        try {
          await Bun.file(`${config.uploadDir}/${f.filename}`).delete();
        } catch {}
      }
      db.query('DELETE FROM posts WHERE id = ?').run(postId);
      return ok({ deleted: true });
    }

    if (method === 'POST' && seg[2] === 'like') {
      requireUser(user);
      return ok(F.toggleLike(user, postId));
    }
    if (method === 'POST' && seg[2] === 'bookmark') {
      requireUser(user);
      return ok(F.toggleBookmark(user, postId));
    }
    if (method === 'POST' && seg[2] === 'comments') {
      requireUser(user);
      if (!rateLimit(`cmt:${user.id}`, 30, 5 * 60_000)) throw new HttpError('评论太快了，歇一下', 429);
      const body = await readBody(req);
      const res = F.addComment(user, postId, body);
      return ok({ comment: res, comments: F.listComments(postId, user.id) }, { status: 201 });
    }
    if (method === 'POST' && seg[2] === 'report') {
      if (!rateLimit(`rep:${ip}`, 10, 10 * 60_000)) throw new HttpError('举报太频繁', 429);
      const body = await readBody(req);
      F.addReport(user, { postId, reason: body.reason, detail: body.detail });
      return ok({ reported: true });
    }
    if (method === 'GET' && seg[2] === 'attachments') {
      const files = db.query('SELECT * FROM attachments WHERE post_id = ?').all(postId);
      return ok({ files });
    }
  }

  // ---------- 评论独立操作 ----------
  if (method === 'DELETE' && seg[0] === 'comments' && seg[1]) {
    requireUser(user);
    const c = db.query('SELECT id, post_id, user_id FROM comments WHERE id = ?').get(int(seg[1]));
    assert(c, '评论不存在', 404);
    assert(c.user_id === user.id || user.is_admin, '只能删除自己的评论', 403);
    db.query("UPDATE comments SET status = 'removed', body = '[该评论已删除]' WHERE id = ?").run(c.id);
    db.query('UPDATE posts SET comment_count = MAX(comment_count - 1, 0) WHERE id = ?').run(c.post_id);
    return ok({ deleted: true });
  }
  if (method === 'POST' && seg[0] === 'comments' && seg[2] === 'report') {
    assert(rateLimit(`rep:${ip}`, 10, 10 * 60_000), '举报太频繁', 429);
    const body = await readBody(req);
    F.addReport(user, { commentId: int(seg[1]), reason: body.reason, detail: body.detail });
    return ok({ reported: true });
  }

  // ---------- 收藏 / 通知 / 我的 ----------
  if (route === 'GET /api/me/bookmarks') {
    requireUser(user);
    const rows = db
      .query(
        `SELECT ${'p.id, p.title, p.body, p.category, p.location, p.happened_at, p.anonymous, p.status, p.views, p.like_count, p.comment_count, p.created_at, p.user_id, u.alias AS author_alias, u.username AS author_username'}
         FROM bookmarks b JOIN posts p ON p.id = b.post_id JOIN users u ON u.id = p.user_id
         WHERE b.user_id = ? AND p.status = 'published' ORDER BY b.created_at DESC LIMIT 100`
      )
      .all(user.id);
    const items = rows.map((r) => P.postSummary(r, user.id));
    P.attachMedia(items.map((i) => i.id), items);
    return ok({ items, total: items.length });
  }

  if (route === 'GET /api/notifications') {
    requireUser(user);
    const rows = db.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(user.id);
    return ok({
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        text: r.text,
        postId: r.post_id,
        meta: safeJson(r.meta),
        read: !!r.read_at,
        createdAt: r.created_at,
      })),
    });
  }
  if (route === 'POST /api/notifications/read') {
    requireUser(user);
    db.query('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now(), user.id);
    return ok({ read: true });
  }

  // ---------- 好友 ----------
  if (seg[0] === 'friends') {
    requireUser(user);
    if (method === 'GET' && seg.length === 1) {
      return ok({ items: S.listFriends(user.id), requests: S.listFriendRequests(user.id) });
    }
    if (method === 'GET' && seg[1] === 'search') {
      const q = clean(url.searchParams.get('q'), 30);
      assert(q.length >= 1, '输入用户名或代号搜索');
      const rows = db
        .query('SELECT id, alias, username, bio FROM users WHERE (username LIKE ? OR alias LIKE ?) AND id != ? LIMIT 20')
        .all(`%${q}%`, `%${q}%`, user.id);
      return ok({
        items: rows.map((r) => ({ ...r, relation: S.friendState(user.id, r.id) })),
      });
    }
    if (method === 'POST' && seg[1] === 'request' && seg[2]) {
      const limitOk = rateLimit(`freq:${user.id}`, 20, 10 * 60_000);
      assert(limitOk, '申请太频繁，稍后再试', 429);
      return ok(S.requestFriend(user, int(seg[2])));
    }
    if (method === 'POST' && seg[1] && seg[2] === 'accept') return ok(S.acceptFriend(user, int(seg[1])));
    if (method === 'DELETE' && seg[1]) return ok(S.deleteFriend(user, int(seg[1])));
    if (method === 'POST' && seg[1] === 'block' && seg[2]) return ok(S.blockUser(user, int(seg[2])));
  }

  // ---------- 私聊 ----------
  if (seg[0] === 'dm') {
    requireUser(user);
    if (route === 'GET /api/dm/unread') return ok({ total: S.unreadTotal(user.id) });

    if (seg[1] === 'threads') {
      if (method === 'GET' && seg.length === 2) return ok({ items: S.listThreads(user.id) });
      // 新建/进入与某人的会话
      if (method === 'POST' && seg.length === 2) {
        const body = await readBody(req);
        const targetId = int(body.userId);
        assert(targetId && targetId !== user.id, '会话对象不正确');
        const t = S.ensureThread(user.id, targetId);
        return ok({ threadId: t.id, canSend: S.canMessage(user.id, targetId) });
      }
    }

    if (method === 'GET' && seg[1] === 'threads' && seg[2] && seg.length === 3) {
      const data = S.listMessages(int(seg[2]), user.id, {
        after: int(url.searchParams.get('after')),
        before: int(url.searchParams.get('before')),
        limit: Math.min(Math.max(int(url.searchParams.get('limit'), 40), 1), 100),
      });
      // 打开会话即算读到最新
      const lastId = data.messages.length ? data.messages[data.messages.length - 1].id : 0;
      if (lastId) S.markRead(user, int(seg[2]), lastId);
      return ok(data);
    }

    if (method === 'POST' && seg[1] === 'threads' && seg[2] && seg[3] === 'messages') {
      const threadId = int(seg[2]);
      const okRate = rateLimit(`dm:${user.id}`, 60, 60_000);
      assert(okRate, '发消息太快了，缓一下', 429);
      const ct = req.headers.get('content-type') || '';
      let payload;
      let files = [];
      if (ct.includes('multipart')) {
        const form = await readBody(req);
        payload = { body: form.get('body'), replyTo: form.get('replyTo') ? int(form.get('replyTo')) : null, stickerId: form.get('stickerId') };
        files = form.getAll('files');
      } else {
        payload = await readBody(req);
      }
      if (payload.stickerId) return ok({ message: await S.sendSticker(user, threadId, int(payload.stickerId)) });
      const message = await S.sendMessage(user, threadId, {
        body: payload.body,
        replyTo: payload.replyTo ? int(payload.replyTo) : null,
        files,
      });
      return ok({ message }, { status: 201 });
    }

    if (method === 'POST' && seg[1] === 'threads' && seg[2] && seg[3] === 'read') {
      const body = await readBody(req).catch(() => ({}));
      return ok(S.markRead(user, int(seg[2]), int(body.lastReadId)));
    }
    if (method === 'DELETE' && seg[1] === 'threads' && seg[2]) {
      return ok(await S.deleteThread(user, int(seg[2])));
    }
    if (method === 'DELETE' && seg[1] === 'messages' && seg[2]) return ok(S.revokeMessage(user, int(seg[2])));
  }

  // ---------- 表情包 ----------
  if (seg[0] === 'stickers') {
    if (method === 'GET') return ok({ items: S.listStickers() });
    if (method === 'POST') {
      requireAdmin(user);
      const form = await readBody(req);
      const file = form instanceof FormData ? form.get('file') : null;
      assert(file instanceof File && file.size > 0, '请选择表情图片');
      return ok(await S.addSticker(file, form.get('name')), { status: 201 });
    }
    if (method === 'DELETE' && seg[1]) {
      requireAdmin(user);
      return ok(S.removeSticker(user, int(seg[1])));
    }
  }

  // ---------- 同城经历地图：只返回区级聚合 ----------
  if (route === 'GET /api/map/regions') {
    const regions = R.regionCounts();
    return ok({ regions, cities: R.cityHints(), precision: 'area' });
  }

  // ---------- 个人主页 ----------
  if (seg[0] === 'users' && seg[1] && method === 'GET') {
    const data = F.profileOf(int(seg[1]), user?.id);
    assert(data, '用户不存在', 404);
    const posts = P.listPosts({ viewerId: user?.id, userId: int(seg[1]), limit: 20 });
    const card = S.userCard(user?.id, int(seg[1]));
    return ok({ ...data, posts, card });
  }

  // ---------- 管理员 ----------
  if (seg[0] === 'admin') {
    requireAdmin(user);
    if (route === 'GET /api/admin/stats') return ok(F.adminStats());
    if (route === 'GET /api/admin/reports') {
      const rows = db
        .query(
          `SELECT r.*, p.title AS post_title, c.body AS comment_body FROM reports r
           LEFT JOIN posts p ON p.id = r.post_id LEFT JOIN comments c ON c.id = r.comment_id
           ORDER BY (r.status = 'open') DESC, r.id DESC LIMIT 100`
        )
        .all();
      return ok({ items: rows });
    }
    if (method === 'POST' && seg[1] === 'reports' && seg[3] === 'resolve') {
      db.query("UPDATE reports SET status = 'resolved' WHERE id = ?").run(int(seg[2]));
      return ok({ resolved: true });
    }
    if (method === 'POST' && seg[1] === 'posts' && seg[3] === 'status') {
      const body = await readBody(req);
      assert(['published', 'pending', 'removed'].includes(body.status), '状态不合法');
      db.query('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?').run(body.status, now(), int(seg[2]));
      return ok({ updated: true });
    }
    if (route === 'GET /api/admin/pending') {
      const rows = db
        .query(`SELECT p.id, p.title, p.body, p.category, p.created_at, u.alias FROM posts p JOIN users u ON u.id = p.user_id WHERE p.status = 'pending' ORDER BY p.id DESC`)
        .all();
      return ok({ items: rows });
    }
  }

  return fail('接口不存在', 404);
}

export function handleApi(req, url, app) {
  return handled(() => routeApi(req, url, app));
}
