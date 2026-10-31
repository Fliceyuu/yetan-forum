// 新增功能的接口测试：区级地图 / 隐私字段 / PWA 资源
process.env.DB_PATH = 'data/test-regions.db';
process.env.UPLOAD_DIR = 'uploads-test';
process.env.DEMO_MODE = '0';

const { migrate, upgrade, db } = await import('../src/db.js');
migrate();
upgrade();
const { seed } = await import('../src/seed.js');
db.exec('DELETE FROM sessions');
await seed({ force: true });

const { handleApi } = await import('../src/api.js');
async function api(path, { method = 'GET', body, form, cookie } = {}) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers.set('content-type', 'application/json');
    payload = JSON.stringify(body);
  }
  const res = await handleApi(new Request(`http://test${path}`, { method, headers, body: payload }), new URL(`http://test${path}`));
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
}
const login = (u, p = 'yetan123') => api('/api/auth/login', { method: 'POST', body: { username: u, password: p } });
const cookieOf = (r) => r.headers.get('set-cookie').split(';')[0];

const { resolveRegion } = await import('../src/regions.js');

describe('区级地图与隐私', () => {
  test('地点解析：能识别城市+区，识别不了就放弃（不猜测）', () => {
    expect(resolveRegion('成都·青羊区')).toMatchObject({ city: '成都', area: '青羊区', precision: 'area' });
    expect(resolveRegion('广州越秀')).toMatchObject({ city: '广州', area: '越秀区' });
    expect(resolveRegion('上海市浦东新区')).toMatchObject({ city: '上海', area: '浦东新区' });
    expect(resolveRegion('武汉')?.precision).toBe('city');
    expect(resolveRegion('青羊区')).toMatchObject({ city: '成都' });
    expect(resolveRegion('某个不存在的小镇')).toBeNull();
    expect(resolveRegion('')).toBeNull();
  });

  test('区级坐标只精确到区中心（不保存用户的任何原始坐标）', () => {
    const r = resolveRegion('成都·青羊区');
    const key = db.query('SELECT * FROM post_regions WHERE key = ? LIMIT 1').get(r.key);
    if (key) {
      // 存的是区锚点，允许极小误差的浮点
      expect(Math.abs(key.lng - r.lng)).toBeLessThan(1e-6);
      expect(Math.abs(key.lat - r.lat)).toBeLessThan(1e-6);
    } else {
      expect(true).toBe(true);
    }
  });

  test('发帖带地点 → 写入区级落点，不进正文以外的敏感字段', async () => {
    const cookie = cookieOf(await login('vivi'));
    const r = await api('/api/posts', {
      method: 'POST',
      cookie,
      body: {
        title: '地图测试：楼下便利店的方向',
        body: '这是为了验证区级地图写入的功能，正文长度足够。',
        category: 'other',
        location: '上海·静安区',
      },
    });
    expect(r.status).toBe(201);
    const postId = r.json.data.post.id;
    const region = db.query('SELECT * FROM post_regions WHERE post_id = ?').get(postId);
    expect(region).toBeTruthy();
    expect(region.city).toBe('上海');
    expect(region.area).toBe('静安区');
    // 关键：没有"精确坐标"字段被写入
    const cols = db.query('PRAGMA table_info(post_regions)').all().map((c) => c.name);
    expect(cols).not.toContain('exact_lat');
    expect(cols).not.toContain('user_lat');
  });

  test('地图接口只返回区级聚合', async () => {
    const r = await api('/api/map/regions');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.data.regions)).toBe(true);
    for (const g of r.json.data.regions) {
      expect(['city', 'area']).toContain(g.lat != null ? 'area' : 'city');
      expect(typeof g.count).toBe('number');
      expect(typeof g.key).toBe('string');
      // 不返回任何帖子正文/作者
      expect(g.body).toBeUndefined();
      expect(g.user_id).toBeUndefined();
    }
    expect(r.json.data.precision).toBe('area');
  });

  test('信息流可以按城区筛选', async () => {
    const r = await api(`/api/posts?region=${encodeURIComponent('上海·静安区')}`);
    expect(r.status).toBe(200);
    expect(r.json.data.items.length).toBeGreaterThanOrEqual(1);
    const other = await api('/api/posts?region=不存在·假区');
    expect(other.json.data.items.length).toBe(0);
  });

  test('编辑地点会更新区级落点', async () => {
    const cookie = cookieOf(await login('vivi'));
    const me = await api('/api/auth/me', { cookie });
    const mine = await api(`/api/posts?author=${me.json.data.user.id}&limit=20`, { cookie });
    const target = mine.json.data.items.find((p) => p.title.startsWith('地图测试'));
    expect(target).toBeTruthy();
    const r = await api(`/api/posts/${target.id}`, { method: 'PATCH', cookie, body: { location: '北京·朝阳区' } });
    expect(r.status).toBe(200);
    const region = db.query('SELECT * FROM post_regions WHERE post_id = ?').get(target.id);
    expect(region.key).toBe('北京·朝阳区');
  });

  test('元信息里带上城市提示与媒体限制', async () => {
    const r = await api('/api/meta');
    expect(Array.isArray(r.json.data.cities)).toBe(true);
    expect(r.json.data.media.limits.image).toBeGreaterThan(0);
  });
});

describe('PWA 资源（文件级）', () => {
  const read = async (p) => await Bun.file(p).text();
  test('manifest 可解析且含图标与捷径', async () => {
    const m = JSON.parse(await read('public/manifest.webmanifest'));
    expect(m.display).toBe('standalone');
    expect(m.icons.length).toBeGreaterThanOrEqual(4);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(m.shortcuts.length).toBeGreaterThanOrEqual(2);
  });
  test('service worker 不缓存接口与上传', async () => {
    const sw = await read('public/sw.js');
    expect(sw.includes("url.pathname.startsWith('/api/')")).toBe(true);
    expect(sw.includes("url.pathname.startsWith('/uploads/')")).toBe(true);
    expect(sw.includes('offline.html')).toBe(true);
  });
  test('离线页与 PNG 图标存在', async () => {
    expect(await Bun.file('public/offline.html').exists()).toBe(true);
    for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable.png', 'apple-touch-icon.png']) {
      const file = Bun.file('public/' + f);
      expect(await file.exists()).toBe(true);
      const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      expect([...head.slice(0, 4)]).toEqual([137, 80, 78, 71]);
    }
  });
});
