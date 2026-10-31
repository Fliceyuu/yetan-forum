import { config, CATEGORIES } from './config.js';
import { migrate, upgrade, db } from './db.js';
import { handleApi } from './api.js';
import { currentUser } from './auth.js';
import { shell, renderFallbackPosts } from './render.js';
import * as P from './posts.js';

migrate();
upgrade();

const MIME = {
  html: 'text/html; charset=utf-8',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  webmanifest: 'application/manifest+json',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
};

const SKELETON = `<section class="pad"><div class="skeleton h1"></div><div class="skeleton card"></div><div class="skeleton card"></div><div class="skeleton card"></div></section>`;
// JS 正常时隐藏 SSR 降级列表；JS 挂了则隐藏骨架、露出降级内容

function serveFile(path, cache = 'public, max-age=300') {
  const file = Bun.file(path);
  return file.exists().then((exists) => {
    if (!exists) return new Response('Not found', { status: 404 });
    const ext = path.split('.').pop().toLowerCase();
    return new Response(file, {
      headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' },
    });
  });
}

const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // 安全头
    const withHeaders = (res) => {
      const h = new Headers(res.headers);
      h.set('X-Content-Type-Options', 'nosniff');
      h.set('Referrer-Policy', 'same-origin');
      h.set('X-Frame-Options', 'DENY');
      return new Response(res.body, { status: res.status, headers: h });
    };

    try {
      if (pathname.startsWith('/api/')) {
        return withHeaders(await handleApi(req, url));
      }

      // Service Worker 必须在根作用域且不能被缓存，否则更新永远不生效
      if (pathname === '/sw.js' || pathname === '/manifest.webmanifest') {
        const file = Bun.file(`public${pathname}`);
        if (!(await file.exists())) return new Response('Not found', { status: 404 });
        const ext = pathname.split('.').pop();
        return withHeaders(
          new Response(file, { headers: { 'Content-Type': MIME[ext] || 'text/javascript', 'Cache-Control': 'no-cache' } })
        );
      }

      if (pathname.startsWith('/uploads/')) {
        const name = pathname.slice('/uploads/'.length);
        if (!/^[\w.-]+$/.test(name)) return new Response('Bad path', { status: 400 });
        // 内置表情：随代码发布的可信 SVG，单独放行
        if (name.startsWith('sticker-yetan-') && name.endsWith('.svg')) {
          const builtIn = Bun.file(`public/stickers/${name}`);
          if (await builtIn.exists()) {
            return withHeaders(
              new Response(builtIn, {
                headers: {
                  'Content-Type': 'image/svg+xml',
                  'Cache-Control': 'public, max-age=604800',
                  // 即便内置也加上隔离头，防止被当作文档执行脚本
                  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
                  'X-Content-Type-Options': 'nosniff',
                },
              })
            );
          }
        }
        // 其余附件：只公开数据库里登记过的文件（帖子附件 / 私聊附件 / 上传的表情），删除后立即失效
        const known =
          db.query('SELECT 1 AS x FROM attachments WHERE filename = ?').get(name) ||
          db.query('SELECT 1 AS x FROM dm_attachments WHERE filename = ?').get(name) ||
          db.query('SELECT 1 AS x FROM stickers WHERE filename = ?').get(name);
        if (!known) return new Response('Not found', { status: 404 });
        return withHeaders(await serveFile(`${config.uploadDir}/${name}`, 'public, max-age=86400'));
      }

      // 静态资源
      if (!pathname.startsWith('/api/') && !pathname.startsWith('/uploads/') && /\.(css|js|svg|webmanifest|html|png|jpe?g|webp|ico)$/i.test(pathname)) {
        if (pathname.includes('..')) return new Response('Bad path', { status: 400 });
        return withHeaders(await serveFile(`public${pathname}`));
      }

      if (pathname === '/healthz') return Response.json({ ok: true, uptime: process.uptime() });

      if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

      // 页面路由：返回带首屏骨架的 HTML，数据由前端拉取；同时内嵌首屏内容做降级
      const user = await currentUser(req);
      if (pathname === '/') {
        const { items } = P.listPosts({ viewerId: user?.id, limit: 6 });
        return withHeaders(
          new Response(
            shell({
              title: '夜里的故事 · 灵异玄学经历社区',
              description: `${config.siteName}：一个只收集"亲历"的地方。撞邪、梦魇、旧屋、风水、玄门、心证，写下你亲眼见过的事。`,
              body: `<div id="root">${SKELETON}</div><div class="ssr-only" style="display:none">${renderFallbackPosts(items, '最近的经历')}</div>`,
            }),
            { headers: { 'Content-Type': MIME.html } }
          )
        );
      }

      if (pathname.startsWith('/p/')) {
        const id = Number(pathname.split('/')[2]);
        let post = null;
        try {
          post = Number.isFinite(id) ? P.getPost(id, user?.id) : null;
        } catch {
          post = null;
        }
        if (post && post.status === 'published') P.incrementViews(id);
        const title = post ? post.title : '帖子不存在';
        const desc = post ? post.body.slice(0, 100) : config.siteTagline;
        return withHeaders(
          new Response(shell({ title, description: desc, body: `<div id="root">${SKELETON}</div>` }), {
            headers: { 'Content-Type': MIME.html },
            status: post ? 200 : 404,
          })
        );
      }

      const pages = {
        '/new': '记录一段经历',
        '/categories': '门类',
        '/me': '我的',
        '/login': '登录',
        '/register': '加入夜谭',
        '/bookmarks': '我的收藏',
        '/notifications': '有人回应你',
        '/friends': '好友',
        '/messages': '私信',
        '/map': '同城经历',
        '/admin': '守夜人后台',
        '/about': '这里的规矩',
      };
      if (pages[pathname] || /^\/(messages|dm)\/[0-9]+$/.test(pathname)) {
        return withHeaders(
          new Response(shell({ title: titleOf(pathname), body: `<div id="root">${SKELETON}</div>` }), {
            headers: { 'Content-Type': MIME.html },
          })
        );
      }

      // Service Worker 必须在根作用域，且不能被长缓存
      if (pathname === '/sw.js' || pathname === '/manifest.webmanifest') {
        const file = Bun.file(`public${pathname}`);
        if (!(await file.exists())) return new Response('Not found', { status: 404 });
        const ext = pathname.split('.').pop();
        return withHeaders(
          new Response(file, {
            headers: { 'Content-Type': MIME[ext] || 'text/javascript', 'Cache-Control': 'no-cache' },
          })
        );
      }

      return withHeaders(new Response(shell({ title: '走错门了', body: `<div id="root">${SKELETON}</div>` }), { status: 404, headers: { 'Content-Type': MIME.html } }));
    } catch (err) {
      console.error('[error]', req.method, pathname, err?.stack || err);
      if (pathname.startsWith('/api/')) {
        return Response.json({ ok: false, error: err?.message || '服务器开小差' }, { status: err?.status || 500 });
      }
      return new Response('出了点问题，稍后再试', { status: 500 });
    }
  },
});

console.log(`🕯  ${config.siteName} 已点亮：http://localhost:${server.port}  (categories: ${CATEGORIES.length})`);
console.log(`   数据库: ${config.dbPath}   上传目录: ${config.uploadDir}`);

// 页面标题：静态页 + 动态路由（私聊会话 / 用户主页）
function titleOf(pathname) {
  const staticPages = {
    '/new': '记录一段经历',
    '/categories': '门类',
    '/me': '我的',
    '/login': '登录',
    '/register': '加入夜谭',
    '/bookmarks': '我的收藏',
    '/notifications': '有人回应你',
    '/friends': '好友',
    '/messages': '私信',
    '/admin': '守夜人后台',
    '/map': '同城经历',
    '/about': '这里的规矩',
  };
  if (staticPages[pathname]) return staticPages[pathname];
  if (/^\/messages\/\d+$/.test(pathname)) return '私聊';
  if (/^\/dm\/\d+$/.test(pathname)) return '私聊';
  return '夜谭';
}
