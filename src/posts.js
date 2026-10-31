import { db, now } from './db.js';
import { config, CATEGORY_MAP } from './config.js';
import { HttpError, assert, clean } from './utils.js';
import { saveRegion, regionOf } from './regions-store.js';

// 世界线标记：用户未选分类时按关键词粗判
const HINTS = [
  // 只保留"专属于这一类"的词，避免"床、楼、门"这类泛词把所有帖子都判成风水
  ['dream', /做梦|梦里|梦见|梦到|睡梦|梦魇|鬼压床|醒不过来|入睡/],
  ['fengshui', /风水|动土|朝向|罗盘|煞|床位|镜子对|摆件|户型|床头/],
  ['ritual', /烧纸|请神|算命|开光|法事|符纸|香火|拜神|咒语|做法|灵位|祖先/],
  ['haunt', /老宅|旧屋|出租屋|宿舍|医院|学校|坟|祠堂|灵堂|楼道|走廊|地下室/],
  ['deja', /预感|第六感|似曾相识|巧合|梦到后来|突然觉得|既视感/],
];

export function detectCategory(title, body) {
  const text = `${title} ${body}`;
  let [best, max] = ['', 0];
  for (const [key, re] of HINTS) {
    const hits = text.match(new RegExp(re.source, 'gu'))?.length ?? 0;
    if (hits > max) {
      max = hits;
      best = key;
    }
  }
  return best || 'ghost';
}

export function extractTags(text, limit = 4) {
  const found = new Set();
  const re = /#([\p{Script=Han}A-Za-z0-9_]{1,12})/gu;
  let m;
  while ((m = re.exec(text)) && found.size < limit) found.add(m[1]);
  return [...found];
}

export function normalizeCategory(c) {
  return CATEGORY_MAP.has(c) ? c : null;
}

export function createPost(user, input) {
  const title = clean(input.title, 80);
  const body = clean(input.body, 8000);
  assert(title.length >= 2, '标题至少 2 个字');
  assert(body.length >= 10, '经历至少写 10 个字，别让读者一头雾水');
  const category = normalizeCategory(input.category) || detectCategory(title, body);
  const anonymous = input.anonymous ? 1 : 0;
  const location = clean(input.location, 40);
  const happenedAt = clean(input.happenedAt, 20);
  const status = config.postNeedsReview && !user.is_admin ? 'pending' : 'published';
  const t = now();
  const res = db
    .query(
      `INSERT INTO posts (user_id, title, body, category, location, happened_at, anonymous, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(user.id, title, body, category, location, happenedAt, anonymous, status, t, t);
  const id = Number(res.lastInsertRowid);
  for (const tag of extractTags(`${title} ${body}`)) {
    db.query('INSERT OR IGNORE INTO tags (post_id, tag) VALUES (?, ?)').run(id, tag);
  }
  // 区级落点（可选）：只存城区，不存街道/门牌/坐标原值
  try {
    saveRegion(id, location);
  } catch (e) {
    console.error('[region]', e.message);
  }
  return { id, status };
}

const POST_COLUMNS = `p.id, p.title, p.body, p.category, p.location, p.happened_at,
  p.anonymous, p.status, p.views, p.like_count, p.comment_count, p.created_at,
  p.user_id, u.alias AS author_alias, u.username AS author_username`;

export function postSummary(row, viewerId) {
  if (!row) return null;
  const anonymous = !!row.anonymous;
  return {
    id: row.id,
    title: row.title,
    excerpt: row.body.replace(/\s+/g, ' ').slice(0, 120),
    category: row.category,
    location: row.location,
    happenedAt: row.happened_at,
    anonymous,
    status: row.status,
    views: row.views,
    likes: row.like_count,
    comments: row.comment_count,
    createdAt: row.created_at,
    author: anonymous
      ? { alias: aliasOf(row.user_id), anonymous: true }
      : { id: row.user_id, alias: row.author_alias, username: row.author_username, anonymous: false },
    mine: viewerId && row.user_id === viewerId,
    attachments: [],
  };
}

// 匿名也要有稳定代号，否则读者无法区分"是不是同一个人"
const ADJ = ['湿冷', '褪色', '无灯', '回声', '静默', '半醒', '旧漆', '断线', '尘封', '凌晨'];
const NOUN = ['楼道', '灯绳', '木门', '水声', '镜子', '钟摆', '窗缝', '台阶', '空床', '影子'];
export function aliasOf(userId) {
  const a = ADJ[(userId * 7) % ADJ.length];
  const n = NOUN[(userId * 13) % NOUN.length];
  return `匿名·${a}${n}`;
}

export function listPosts({ viewerId, category, q, sort = 'new', page = 1, limit = 12, tag, userId, region, status = 'published' }) {
  const where = ['p.status = ?'];
  const args = [status];
  if (category) {
    where.push('p.category = ?');
    args.push(category);
  }
  if (userId) {
    where.push('p.user_id = ?');
    args.push(userId);
  }
  if (tag) {
    where.push('p.id IN (SELECT post_id FROM tags WHERE tag = ?)');
    args.push(tag);
  }
  if (q) {
    where.push('(p.title LIKE ? OR p.body LIKE ?)');
    args.push(`%${q}%`, `%${q}%`);
  }
  if (region) {
    where.push('p.id IN (SELECT post_id FROM post_regions WHERE key = ?)');
    args.push(region);
  }
  const order =
    sort === 'hot'
      ? '(p.like_count * 3 + p.comment_count * 2 + p.views * 0.2) DESC, p.created_at DESC, p.id DESC'
      : sort === 'discussed'
        ? 'p.comment_count DESC, p.created_at DESC, p.id DESC'
        : 'p.created_at DESC, p.id DESC';

  const offset = (page - 1) * limit;
  const rows = db
    .query(
      `SELECT ${POST_COLUMNS} FROM posts p JOIN users u ON u.id = p.user_id
       WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset);
  const total = db.query(`SELECT COUNT(*) AS n FROM posts p WHERE ${where.join(' AND ')}`).get(...args).n;
  const items = rows.map((r) => postSummary(r, viewerId));
  attachMedia(items.map((i) => i.id).filter(Boolean), items);
  return { items, total, page, limit };
}

// 批量挂上附件（一次查询，避免 N+1）
export function attachMedia(postIds, targets) {
  if (!postIds.length) return;
  const rows = db
    .query(
      `SELECT id, post_id, filename, original, mime, bytes, kind, width, height FROM attachments WHERE post_id IN (${postIds.map(() => '?').join(',')}) ORDER BY id`
    )
    .all(...postIds);
  const map = new Map();
  for (const r of rows) {
    const list = map.get(r.post_id) || [];
    list.push({
      id: r.id,
      url: `/uploads/${r.filename}`,
      name: r.original || r.filename,
      mime: r.mime,
      bytes: r.bytes,
      width: r.width ?? null,
      height: r.height ?? null,
      kind: r.kind || (r.mime.startsWith('video') ? 'video' : r.mime.startsWith('audio') ? 'audio' : 'image'),
    });
    map.set(r.post_id, list);
  }
  for (const t of targets) t.attachments = map.get(t.id) || [];
}

export function getPost(id, viewerId) {
  const row = db.query(`SELECT ${POST_COLUMNS} FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`).get(id);
  if (!row) return null;
  if (row.status !== 'published' && row.user_id !== viewerId) {
    throw new HttpError('帖子不存在或未通过审核', 404);
  }
  const post = postSummary(row, viewerId);
  post.body = row.body;
  attachMedia([post.id], [post]);
  post.region = regionOf(post.id);
  post.mediaNote = post.attachments.some((a) => a.kind === 'image');
  return post;
}

export function incrementViews(id) {
  db.query('UPDATE posts SET views = views + 1 WHERE id = ?').run(id);
}
