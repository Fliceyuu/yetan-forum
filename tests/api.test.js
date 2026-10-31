// 端到端接口测试：bun test
// 使用临时数据库与上传目录，不碰正式数据。
process.env.DB_PATH = 'data/test-forum.db';
process.env.UPLOAD_DIR = 'uploads-test';
process.env.DEMO_MODE = '0';

const { migrate, upgrade, db } = await import('../src/db.js');
migrate();
upgrade();
const { seed } = await import('../src/seed.js');
db.exec('DELETE FROM sessions');
await seed({ force: true });

const { handleApi } = await import('../src/api.js');

// 直接调用路由层，免得起端口
async function api(path, { method = 'GET', body, form, cookie } = {}) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers.set('content-type', 'application/json');
    payload = JSON.stringify(body);
  }
  const req = new Request(`http://test${path}`, { method, headers, body: payload });
  const res = await handleApi(req, new URL(`http://test${path}`));
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

const login = (username, password = 'yetan123') =>
  api('/api/auth/login', { method: 'POST', body: { username, password } });

const cookieOf = (r) => r.headers.get('set-cookie').split(';')[0];
// 造一张头部合法的 PNG（服务端会读宽高做兜底校验）
const pngBytes = (w = 800, h = 600) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const dv = new DataView(b.buffer);
  dv.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  b[24] = 8;
  b[25] = 6;
  return b;
};
const postBy = (id) => db.query('SELECT * FROM posts WHERE id = ?').get(id);

const state = { cookie: '', uid: 0 };

describe('夜谭论坛 API', () => {
  test('元信息与分类', async () => {
    const r = await api('/api/meta');
    expect(r.status).toBe(200);
    expect(r.json.data.categories.length).toBe(7);
    expect(r.json.data.rules.length).toBeGreaterThan(3);
  });

  test('信息流、排序、分类、搜索、标签', async () => {
    const all = await api('/api/posts?limit=3');
    expect(all.json.data.items.length).toBe(3);
    expect(all.json.data.total).toBeGreaterThanOrEqual(8);
    // 默认按时间倒序
    const ts = all.json.data.items.map((p) => p.createdAt);
    expect(ts[0]).toBeGreaterThanOrEqual(ts[1]);

    const hot = await api('/api/posts?sort=hot&limit=2');
    expect(hot.status).toBe(200);

    const dream = await api('/api/posts?category=dream');
    expect(dream.json.data.items.length).toBeGreaterThan(0);
    expect(dream.json.data.items.every((p) => p.category === 'dream')).toBe(true);

    const search = await api(`/api/posts?q=${encodeURIComponent('走廊')}`);
    expect(search.json.data.items.length).toBeGreaterThanOrEqual(1);

    const bad = await api('/api/posts?category=不存在的分类');
    expect(bad.json.data.items.length).toBe(0);
  });

  test('注册 / 登录 / 密码错误 / 未登录拦截', async () => {
    const bad = await login('vivi', 'wrong-password');
    expect(bad.status).toBe(401);
    expect(bad.json.ok).toBe(false);

    const res = await login('vivi');
    expect(res.status).toBe(200);
    expect(res.json.data.user.alias).toBe('阿维');
    state.uid = res.json.data.user.id;
    state.cookie = cookieOf(res);

    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { username: '测试用户_' + Date.now(), password: 'abc123456', alias: '夜行人' },
    });
    expect(reg.status).toBe(200);
    expect(reg.json.data.user.alias).toBe('夜行人');

    const dup = await api('/api/auth/register', { method: 'POST', body: { username: 'vivi', password: 'abc123456' } });
    expect(dup.status).toBe(400);

    const short = await api('/api/auth/register', { method: 'POST', body: { username: 'abc', password: '1' } });
    expect(short.status).toBe(400);

    const anon = await api('/api/posts', { method: 'POST', body: { title: '标题啊', body: '这是一段足够长的正文内容' } });
    expect(anon.status).toBe(401);
  });

  test('发帖校验、自动分类、标签、匿名代号', async () => {
    const cookie = state.cookie;
    const tooShort = await api('/api/posts', { method: 'POST', cookie, body: { title: '短', body: '太短了' } });
    expect(tooShort.status).toBe(400);

    // 不传分类时按关键词猜测（"梦" 类词命中最多 → dream）
    const auto = await api('/api/posts', {
      method: 'POST',
      cookie,
      body: { title: '我做了一个梦', body: '我梦见同一段楼梯，梦里一直往下走，醒不过来。#楼梯 #梦', anonymous: true },
    });
    expect(auto.status).toBe(201);
    expect(auto.json.data.post.category).toBe('dream');
    expect(auto.json.data.post.anonymous).toBe(true);
    expect(auto.json.data.post.author.alias.startsWith('匿名·')).toBe(true);
    expect(auto.json.data.post.author.id).toBeUndefined();

    const id = auto.json.data.post.id;
    const tags = await api(`/api/posts?tag=${encodeURIComponent('楼梯')}`);
    expect(tags.json.data.items.some((p) => p.id === id)).toBe(true);
  });

  test('附件上传：多部分表单 + 类型白名单', async () => {
    const fd = new FormData();
    fd.set('title', '带照片的经历');
    fd.set('body', '这段经历我留了一张现场照片，大家自己看。');
    fd.set('category', 'other');
    const png = pngBytes(640, 480);
    fd.append('files', new File([png], 'a.png', { type: 'image/png' }));
    const r = await api('/api/posts', { method: 'POST', cookie: state.cookie, form: fd });
    expect(r.status).toBe(201);
    const att = r.json.data.post.attachments;
    expect(att.length).toBe(1);
    expect(att[0].url.startsWith('/uploads/')).toBe(true);
    expect(att[0].kind).toBe('image');

    const bad = new FormData();
    bad.set('title', '非法文件类型');
    bad.set('body', '这个文件类型应该被拒绝，但正文要保住。');
    bad.append('files', new File([new Uint8Array([1, 2, 3])], 'x.exe', { type: 'application/x-msdownload' }));
    const r2 = await api('/api/posts', { method: 'POST', cookie: state.cookie, form: bad });
    expect(r2.status).toBe(201);
    expect(r2.json.data.post.attachments.length).toBe(0);
  });

  test('互动：点赞、收藏、评论嵌套、通知', async () => {
    // 每次跑测试都会复用同一个库，选一个当前用户还没赞过的帖子
    const target = db
      .query(
        `SELECT id FROM posts p WHERE p.status='published'
         AND NOT EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) ORDER BY p.id LIMIT 1`
      )
      .get(state.uid).id;
    const like1 = await api(`/api/posts/${target}/like`, { method: 'POST', cookie: state.cookie });
    expect(like1.json.data.liked).toBe(true);
    const like2 = await api(`/api/posts/${target}/like`, { method: 'POST', cookie: state.cookie });
    expect(like2.json.data.liked).toBe(false);

    const bm = await api(`/api/posts/${target}/bookmark`, { method: 'POST', cookie: state.cookie });
    expect(bm.json.data.bookmarked).toBe(true);
    const saved = await api('/api/me/bookmarks', { cookie: state.cookie });
    expect(saved.json.data.items.some((p) => p.id === target)).toBe(true);

    const c1 = await api(`/api/posts/${target}/comments`, { method: 'POST', cookie: state.cookie, body: { body: '我来回应一下' } });
    expect(c1.status).toBe(201);
    const cid = c1.json.data.comment.id;
    const c2 = await api(`/api/posts/${target}/comments`, {
      method: 'POST',
      cookie: state.cookie,
      body: { body: '再补一句', parentId: cid },
    });
    const root = c2.json.data.comments.find((x) => x.id === cid);
    expect(root.replies.length).toBe(1);

    const empty = await api(`/api/posts/${target}/comments`, { method: 'POST', cookie: state.cookie, body: { body: '   ' } });
    expect(empty.status).toBe(400);

    const n = await api('/api/notifications', { cookie: state.cookie });
    expect(Array.isArray(n.json.data.items)).toBe(true);
  });

  test('越权与权限边界', async () => {
    const other = db.query('SELECT id FROM posts WHERE user_id != ? ORDER BY id LIMIT 1').get(state.uid).id;
    const del = await api(`/api/posts/${other}`, { method: 'DELETE', cookie: state.cookie });
    expect(del.status).toBe(403);

    const stats = await api('/api/admin/stats', { cookie: state.cookie });
    expect(stats.status).toBe(403);

    const adminCookie = cookieOf(await login('守夜人'));
    const ok = await api('/api/admin/stats', { cookie: adminCookie });
    expect(ok.status).toBe(200);
    expect(ok.json.data.users).toBeGreaterThanOrEqual(6);
  });

  test('举报与下架', async () => {
    // 选一个不是当前用户发的帖子（下架后自己仍能看，看不到的是别人）
    const target = db.query("SELECT id FROM posts WHERE user_id != ? AND status='published' ORDER BY id LIMIT 1").get(state.uid).id;
    const r = await api(`/api/posts/${target}/report`, {
      method: 'POST',
      cookie: state.cookie,
      body: { reason: 'fake', detail: '看起来像编的' },
    });
    expect(r.json.data.reported).toBe(true);

    const adminCookie = cookieOf(await login('守夜人'));
    const down = await api(`/api/admin/posts/${target}/status`, {
      method: 'POST',
      cookie: adminCookie,
      body: { status: 'removed' },
    });
    expect(down.status).toBe(200);
    const gone = await api(`/api/posts/${target}`, { cookie: state.cookie });
    expect(gone.status).toBe(404);
    const reports = await api('/api/admin/reports', { cookie: adminCookie });
    expect(reports.json.data.items.length).toBeGreaterThanOrEqual(1);
  });

  test('编辑自己的帖子（含追加附件）', async () => {
    const mine = await api(`/api/posts?author=${state.uid}&limit=5`);
    const id = mine.json.data.items[0].id;
    const r = await api(`/api/posts/${id}`, { method: 'PATCH', cookie: state.cookie, body: { title: '改过的标题' } });
    expect(r.status).toBe(200);
    expect(r.json.data.post.title).toBe('改过的标题');

    const fd = new FormData();
    fd.set('title', '改过的标题');
    fd.set('body', '编辑时追加一张附件，正文保持不变也应当允许。');
    fd.set('anonymous', 'false');
    fd.append('files', new File([pngBytes(1024, 768)], 'b.png', { type: 'image/png' }));
    const r2 = await api(`/api/posts/${id}`, { method: 'PATCH', cookie: state.cookie, form: fd });
    expect(r2.status).toBe(200);
    expect(r2.json.data.post.attachments.some((a) => a.mime === 'image/png')).toBe(true);
  });
});
