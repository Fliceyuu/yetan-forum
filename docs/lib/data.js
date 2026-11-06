// 静态站用的"假后端"：把 api() 的实现换成读本地 JSON。
// 前端视图代码一行不用改，仍然调 api('/api/posts')，只是数据来自 data.json。
let DATA = null;

// 相对路径由浏览器按页面地址解析，部署在子目录（如 GitHub Pages 的 /yetan-forum/）下也正确
const DATA_URL = './data.json';

export async function loadData() {
  if (DATA) return DATA;
  const r = await fetch(DATA_URL, { cache: 'no-cache' });
  DATA = await r.json();
  return DATA;
}

const ok = (data) => ({ ok: true, data });

// 模拟服务端分页与筛选，保证和真接口行为一致
export function queryPosts({ category, q, region, page = 1, limit = 12 } = {}) {
  let list = DATA.posts;
  if (category) list = list.filter((p) => p.category === category);
  if (region) list = list.filter((p) => p.region?.key === region);
  if (q) {
    const kw = q.toLowerCase();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(kw) ||
        p.body.toLowerCase().includes(kw) ||
        p.tags.some((t) => t.toLowerCase().includes(kw))
    );
  }
  const total = list.length;
  const start = (page - 1) * limit;
  return { items: list.slice(start, start + limit), page, total, hasMore: start + limit < total };
}

export function getPost(id) {
  return DATA.posts.find((p) => p.id === Number(id)) ?? null;
}

export function allTags() {
  const m = new Map();
  for (const p of DATA.posts) for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([tag, n]) => ({ tag, n }));
}
