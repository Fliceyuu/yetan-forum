// 前端核心工具：API 封装、路由、DOM helper、SVG 图标、时间格式化
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(path, { method = 'GET', body, raw } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (raw) {
    opts.body = raw;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 非 JSON */
  }
  if (!res.ok || !json?.ok) {
    const msg = json?.error || `请求失败（${res.status}）`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

// ---- toast ----
let toastTimer;
export function toast(msg, kind = 'ok') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${kind === 'err' ? 'err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2400);
}

// ---- 时间 ----
export function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return '刚刚';
  if (d < 3600) return `${Math.floor(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} 天前`;
  const dt = new Date(ts);
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`;
}
export const num = (n) => (n >= 10000 ? `${(n / 10000).toFixed(1)}w` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0));

// ---- SVG 图标（简洁线条，统一 24 视框） ----
const ic = (paths, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${paths}</svg>`;
export const icons = {
  home: ic('<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10.5V20h12v-9.5"/>'),
  flame: ic('<path d="M12 3c1.8 3.2 1 5-1 6.5 2.6-.4 3.6 1.6 3.6 3.2A2.6 2.6 0 0 1 12 15.4 2.6 2.6 0 0 1 9.4 12.8C9.4 9 12 7.4 12 3Z"/><path d="M12 15.4c2.6 0 5 1.4 5 3.6H7c0-2.2 2.4-3.6 5-3.6Z"/>'),
  layers: ic('<path d="m12 3 8 4.5-8 4.5L4 7.5 12 3Z"/><path d="m4 12 8 4.5 8-4.5"/><path d="m4 16.5 8 4.5 8-4.5"/>'),
  user: ic('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.4 3.6-5 7-5s6.2 1.6 7 5"/>'),
  heart: ic('<path d="M12 20s-7-4.3-7-9.3A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.7C19 15.7 12 20 12 20Z"/>'),
  heartFill: ic('<path d="M12 20s-7-4.3-7-9.3A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.7C19 15.7 12 20 12 20Z" fill="currentColor"/>'),
  mark: ic('<path d="M6 4h12v16l-6-4-6 4V4Z"/>'),
  markFill: ic('<path d="M6 4h12v16l-6-4-6 4V4Z" fill="currentColor"/>'),
  chat: ic('<path d="M20 12a7.5 7.5 0 0 1-7.5 7.5H7L4 22v-5.2A7.5 7.5 0 0 1 12.5 4.5 7.5 7.5 0 0 1 20 12Z"/>'),
  eye: ic('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  flag: ic('<path d="M6 21V4h11l-1.6 3.8L17 11.6H6"/>'),
  bell: ic('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  search: ic('<circle cx="11" cy="11" r="6.2"/><path d="m16 16 4 4"/>'),
  back: ic('<path d="M15 5l-7 7 7 7"/>'),
  moon: ic('<path d="M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>'),
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>'),
  trash: ic('<path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13"/>'),
  edit: ic('<path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="m14 6 4 4"/>'),
  shield: ic('<path d="M12 3 5 6v6c0 4 3 7.4 7 9 4-1.6 7-5 7-9V6l-7-3Z"/>'),
  audio: ic('<path d="M4 14v-4M8 17V7M12 20V4M16 17V7M20 14v-4"/>'),
  image: ic('<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10.5" r="1.6"/><path d="m5 17 4.5-4.5L14 17l3-3 2.5 2.5"/>'),
  tag: ic('<path d="M11 3.5H4v7l9.5 9.5 7-7L11 3.5Z"/><circle cx="8" cy="8" r="1.3"/>'),
  pin: ic('<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z"/><circle cx="12" cy="11" r="2.2"/>'),
  clock: ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  // 社交相关
  users: ic('<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20c.7-3.2 3.2-4.8 6-4.8s5.3 1.6 6 4.8"/><path d="M16 5.2a3.2 3.2 0 0 1 0 6.6"/><path d="M18 15.4c2 .6 3 2.2 3 4.6"/>'),
  userPlus: ic('<circle cx="10" cy="8.5" r="3.4"/><path d="M4 20c.7-3.4 3.4-5 6-5 1 0 2 .2 2.8.7"/><path d="M18 13v6M15 16h6"/>'),
  userCheck: ic('<circle cx="10" cy="8.5" r="3.4"/><path d="M4 20c.7-3.4 3.4-5 6-5 1 0 2 .2 2.8.7"/><path d="m15.5 16.5 1.8 1.8 3.2-3.6"/>'),
  send: ic('<path d="M4.5 12 20 5l-5.5 15-3-6.5L4.5 12Z"/><path d="M11.5 13.5 20 5"/>'),
  smile: ic('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.2c.9 1.2 2 1.8 3.5 1.8s2.6-.6 3.5-1.8"/><circle cx="9.2" cy="10" r=".9" fill="currentColor"/><circle cx="14.8" cy="10" r=".9" fill="currentColor"/>'),
  video: ic('<rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 11 6-3.5v9L15 13"/>'),
  file: ic('<path d="M14 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5l-5-5Z"/><path d="M14 3.5v5h5"/><path d="M9 13h6M9 16.5h4"/>'),
  paperclip: ic('<path d="M20 12.5 12.5 20a4.6 4.6 0 0 1-6.5-6.5l7.8-7.8a3.1 3.1 0 0 1 4.4 4.4l-7.8 7.8a1.6 1.6 0 0 1-2.2-2.2l7.1-7.1"/>'),
  messages: ic('<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v4A2.5 2.5 0 0 1 13.5 13H9l-4 3v-3H6.5"/> <path d="M18 9.5h.5A1.5 1.5 0 0 1 20 11v6l-2.5-2H14a1.5 1.5 0 0 1-1.5-1.5"/>'),
  block: ic('<circle cx="12" cy="12" r="8.5"/><path d="m6.5 6.5 11 11"/>'),
  check: ic('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  close: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
  undo: ic('<path d="M4 10h9a5 5 0 0 1 0 10h-4"/><path d="m8 6-4 4 4 4"/>'),
  zoom: ic('<circle cx="11" cy="11" r="6.2"/><path d="m16 16 4 4M9 11h4M11 9v4"/>'),
};

// ---- 路由（History API） ----
const listeners = new Set();
export function navigate(to, { replace = false } = {}) {
  if (to === location.pathname + location.search) return;
  if (replace) history.replaceState({}, '', to);
  else history.pushState({}, '', to);
  listeners.forEach((fn) => fn());
  window.scrollTo({ top: 0 });
}
export function onRouteChange(fn) {
  listeners.add(fn);
}
export function routePath() {
  return location.pathname;
}

// 让页面里所有带 data-link 的 a 走前端路由
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http')) return;
  e.preventDefault();
  navigate(href);
});
window.addEventListener('popstate', () => listeners.forEach((fn) => fn()));

// ---- 简单的转义模板：t`...` ----
export const t = (strings, ...vals) => strings.reduce((out, s, i) => out + s + (vals[i] ?? ''), '');

/* ---------------- 头像 ---------------- */
const AVATAR_COLORS = ['#3f5b7d', '#5b4a72', '#7a4a4a', '#3d6b62', '#6b5a3d', '#4a5a7a', '#6a4a5a', '#455c6b'];
export function avatar(name = '匿', size = 26) {
  const ch = String(name).replace(/^匿名·/, '匿').slice(0, 1) || '匿';
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  const color = AVATAR_COLORS[h % AVATAR_COLORS.length];
  return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.44)}px;background:color-mix(in srgb, ${color} 55%, #0b0d12);border-color:color-mix(in srgb, ${color} 70%, #000)" title="${esc(name)}">${esc(ch)}</span>`;
}
