// Service Worker：壳页面走网络优先（保证内容新），静态资源缓存优先（秒开 + 离线可读）
const CACHE = 'yetan-v1';
const SHELL = ['/', '/styles.css', '/app.js', '/icon.svg', '/manifest.webmanifest', '/offline.html',
  '/lib/core.js', '/lib/store.js', '/lib/ui.js', '/lib/nav.js', '/lib/media.js', '/lib/geo.js', '/lib/offline.js',
  '/views/feed.js', '/views/post.js', '/views/compose.js', '/views/auth.js', '/views/me.js', '/views/admin.js', '/views/map.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // 接口与上传：永远走网络，不缓存（隐私 + 新鲜度）
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match('/offline.html')) || new Response('离线', { status: 503 }))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
