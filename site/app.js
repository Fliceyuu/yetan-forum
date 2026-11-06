import { loadData, queryPosts, getPost, allTags } from './lib/data.js';

const CATEGORIES = [
  { key: 'ghost', name: '撞邪', glyph: '影' },
  { key: 'dream', name: '梦魇', glyph: '寐' },
  { key: 'haunt', name: '旧屋', glyph: '宅' },
  { key: 'fengshui', name: '风水', glyph: '舆' },
  { key: 'ritual', name: '玄门', glyph: '符' },
  { key: 'deja', name: '心证', glyph: '证' },
  { key: 'other', name: '杂谈', glyph: '谈' },
];
const CAT = new Map(CATEGORIES.map((c) => [c.key, c]));

const app = document.getElementById('app');

// ---------- 工具 ----------
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return '刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 2592000) return `${Math.floor(d / 86400)} 天前`;
  const dt = new Date(ts);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// ---------- 主题 ----------
const root = document.documentElement;
const savedTheme = localStorage.getItem('yetan:theme') || 'dark';
root.dataset.theme = savedTheme;
document.getElementById('theme').onclick = () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'paper' : 'dark';
  localStorage.setItem('yetan:theme', root.dataset.theme);
};

// ---------- 路由（History API，带 hash 兜底） ----------
function route() {
  const hash = location.hash.replace(/^#/, '');
  const p = hash || location.pathname.replace(/^.*\/site/, '') || '/';
  if (p.startsWith('/post/')) return { name: 'post', id: p.slice(6) };
  if (p === '/map') return { name: 'map' };
  return { name: 'feed' };
}

function go(path) {
  location.hash = path;
}

window.addEventListener('hashchange', render);

// ---------- 渲染：列表 ----------
function renderFeed(state = {}) {
  const { q = '', category = '', page = 1 } = state;
  const res = queryPosts({ q, category, page, limit: 12 });
  const tags = allTags().slice(0, 8);

  const chips = [
    `<button class="chip ${!category ? 'on' : ''}" data-cat="">全部</button>`,
    ...CATEGORIES.map(
      (c) => `<button class="chip ${category === c.key ? 'on' : ''}" data-cat="${c.key}">${c.glyph} ${c.name}</button>`
    ),
  ].join('');

  const list = res.items.length
    ? res.items.map(postCard).join('')
    : `<div class="empty">没有找到相关的经历</div>`;

  app.innerHTML = `
    <section class="hero">
      <h1>把说不出口的经历，留在这里</h1>
      <p>${res.total} 段亲历故事 · 照片已去元数据 · 地点只到区级</p>
    </section>

    <div class="notice">
      <b>这是静态演示站</b>：可以浏览全部内容、搜索、切换主题，但注册与发帖需要后端服务器。
      完整版仓库在 <a href="https://github.com/Fliceyuu/yetan-forum" target="_blank" rel="noopener" style="color:inherit">GitHub</a>。
    </div>

    <input class="search" id="q" placeholder="搜索标题、正文或标签…" value="${esc(q)}" autocomplete="off">

    <div class="chips" id="chips">${chips}</div>

    <div id="list">${list}</div>

    ${tags.length ? `<div style="margin-top:24px;font-size:12px;opacity:.45">标签：${tags.map((t) => `<a class="tag" href="javascript:void 0" data-tag="${esc(t.tag)}">#${esc(t.tag)}</a>`).join(' ')}</div>` : ''}

    ${res.hasMore ? `<button class="btn" id="more" style="width:100%;margin-top:16px">加载更多</button>` : ''}
  `;

  const input = document.getElementById('q');
  let timer;
  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => renderFeed({ ...state, q: input.value.trim(), page: 1 }), 220);
  };

  document.getElementById('chips').onclick = (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    renderFeed({ ...state, category: btn.dataset.cat, page: 1 });
  };

  app.querySelectorAll('[data-tag]').forEach((el) => {
    el.onclick = () => renderFeed({ q: el.dataset.tag, category: '', page: 1 });
  });

  const more = document.getElementById('more');
  if (more) more.onclick = () => renderFeed({ ...state, page: page + 1 });
}

function postCard(p) {
  const cat = CAT.get(p.category);
  const excerpt = p.body.replace(/\s+/g, ' ').slice(0, 90);
  return `
    <a class="card post-card" href="#/post/${p.id}">
      <h3>${esc(p.title)}</h3>
      <p class="excerpt">${esc(excerpt)}${p.body.length > 90 ? '…' : ''}</p>
      <div class="meta">
        ${cat ? `<span class="badge">${cat.glyph} ${cat.name}</span>` : ''}
        ${p.region ? `<span>${esc(p.region.city)} · ${esc(p.region.area || '')}</span>` : ''}
        <span>${esc(p.author.alias)}</span>
        <span>${timeAgo(p.createdAt)}</span>
        <span>${p.commentCount} 评论</span>
      </div>
    </a>`;
}

// ---------- 渲染：详情 ----------
function renderPost(id) {
  const p = getPost(id);
  if (!p) {
    app.innerHTML = `<div class="empty">这篇经历不存在或已下架<br><br><a class="back" href="#/">← 回到列表</a></div>`;
    return;
  }
  const cat = CAT.get(p.category);
  const body = p.body.split(/\n{2,}/).map((para) => `<p>${esc(para)}</p>`).join('');

  const comments = p.comments.length
    ? p.comments.map((c) => renderComment(c)).join('')
    : `<div style="opacity:.35;font-size:13.5px;padding:20px 0">还没有评论</div>`;

  app.innerHTML = `
    <a class="back" href="#/">← 回到列表</a>
    <article class="detail">
      <h1>${esc(p.title)}</h1>
      <div class="meta">
        ${cat ? `<span class="badge">${cat.glyph} ${cat.name}</span>` : ''}
        ${p.region ? `<span>${esc(p.region.city)} · ${esc(p.region.area || '')}</span>` : ''}
        <span>${esc(p.author.alias)}</span>
        <span>${timeAgo(p.createdAt)}</span>
        ${p.happenedAt ? `<span>发生于 ${esc(p.happenedAt)}</span>` : ''}
      </div>
      ${p.images.length ? `<div style="margin:16px 0"><div class="notice" style="margin:0">照片已去除 EXIF 与定位信息</div></div>` : ''}
      <div class="body">${body}</div>
      ${p.tags.length ? `<div style="margin:16px 0">${p.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(' ')}</div>` : ''}
    </article>

    <h2 style="font-family:var(--serif);font-size:16px;margin:32px 0 4px">评论 · ${p.comments.length}</h2>
    ${comments}
  `;
  window.scrollTo(0, 0);
}

function renderComment(c) {
  const replies = (c.replies || []).map((r) => renderComment({ ...r, isReply: true })).join('');
  return `
    <div class="comment ${c.isReply ? 'reply' : ''}">
      <div class="who">${esc(c.author?.alias ?? '匿名')} · ${timeAgo(c.createdAt)}</div>
      <div class="txt">${esc(c.body)}</div>
      ${replies}
    </div>`;
}

// ---------- 渲染：地图（区级） ----------
async function renderMap() {
  const d = await loadData();
  const regions = d.regions;
  const max = Math.max(...regions.map((r) => r.count), 1);

  // 区级散点：刻意不做精确定位，只呈现"哪个城区有故事"
  const dots = regions
    .map((r, i) => {
      const angle = (i / regions.length) * Math.PI * 2;
      const radius = 40 + (1 - r.count / max) * 90;
      const x = 150 + Math.cos(angle) * radius;
      const y = 150 + Math.sin(angle) * radius * 0.82;
      const size = 8 + (r.count / max) * 16;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(1)}"
        fill="var(--blood)" opacity="${(0.2 + (r.count / max) * 0.5).toFixed(2)}">
        <title>${esc(r.city)} ${esc(r.area || '')} · ${r.count} 段经历</title>
      </circle>
      <text x="${x.toFixed(1)}" y="${(y + size + 13).toFixed(1)}" text-anchor="middle"
        font-size="9" fill="currentColor" opacity=".5">${esc(r.area || r.city)}</text>`;
    })
    .join('');

  app.innerHTML = `
    <a class="back" href="#/">← 回到列表</a>
    <h1 style="font-family:var(--serif);font-size:22px;margin:20px 0 6px">同城经历</h1>
    <p style="font-size:13px;opacity:.55;line-height:1.8;margin:0 0 8px">
      只精确到城区。我们不保存街道、门牌或任何原始坐标——<br>
      因为「我遇到怪事的地方」很容易变成「我一个人住的地方」。
    </p>
    <div class="card" style="padding:8px 0">
      <svg viewBox="0 0 300 300" style="width:100%;height:auto;color:var(--text)">
        <circle cx="150" cy="150" r="130" fill="none" stroke="var(--line)" stroke-dasharray="3 5"/>
        ${dots}
      </svg>
    </div>
    <div style="margin-top:16px">
      ${regions
        .sort((a, b) => b.count - a.count)
        .map(
          (r) => `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line-soft);font-size:13.5px">
            <span>${esc(r.city)} · ${esc(r.area || '')}</span>
            <span style="opacity:.5">${r.count} 段</span>
          </div>`
        )
        .join('')}
    </div>
  `;
}

// ---------- 主循环 ----------
let current = {};
async function render() {
  await loadData();
  const r = route();
  current = r;
  if (r.name === 'post') return renderPost(r.id);
  if (r.name === 'map') return renderMap();
  return renderFeed(current = { ...(current.name === 'feed' ? current : {}), name: 'feed', q: '', category: '', page: 1 });
}

render();
