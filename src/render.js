import { config, CATEGORIES } from './config.js';
import { escapeHtml } from './utils.js';
import { ssrBoot } from './boot-snippet.js';

const initials = (t) =>
  `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="g"><stop offset="0" stop-color="#2a2f3a"/><stop offset="1" stop-color="#0b0d12"/></radialGradient></defs>
   <rect width="64" height="64" fill="url(#g)"/>
   <g fill="none" stroke="#9fb3c8" stroke-width="1.2" opacity=".7">
     <circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="14"/>
     <path d="M32 2v12M32 50v12M2 32h12M50 32h12"/>
   </g>
   <text x="32" y="38" text-anchor="middle" font-size="20" fill="#e8edf5" font-family="serif">${escapeHtml(t)}</text></svg>`;

export function shell({ title, description = config.siteTagline, body = '' }) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#08090c" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="${escapeHtml(config.siteName)}" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="format-detection" content="telephone=no" />
<title>${escapeHtml(title)} · ${escapeHtml(config.siteName)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<meta property="og:title" content="${escapeHtml(title)} · ${escapeHtml(config.siteName)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:type" content="website" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="stylesheet" href="/styles.css" />
</head>
<body>
<div class="grain" aria-hidden="true"></div>
<div class="vignette" aria-hidden="true"></div>
<header class="topbar" id="topbar">
  <a class="brand" href="/" data-link>
    <span class="brand-mark">${initials('夜')}</span>
    <span class="brand-text"><b>${escapeHtml(config.siteName)}</b><i>${escapeHtml(config.siteTagline)}</i></span>
  </a>
  <nav class="topnav" id="topnav" aria-label="主导航"></nav>
</header>
<main id="app">${body}<noscript><p class="pad">本站需要开启 JavaScript 才能浏览。</p></noscript></main>
<nav class="tabbar" id="tabbar" aria-label="快捷导航"></nav>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div id="modal-root"></div>


${ssrBoot}
</body>
</html>`;
}

// 无 JS 时的降级页：至少让搜索引擎和爬虫看到内容
export function renderFallbackPosts(posts, heading) {
  if (!posts.length) return `<section class="pad"><h1>${escapeHtml(heading)}</h1><p class="muted">还没有人开口。</p></section>`;
  return `<section class="pad"><h1>${escapeHtml(heading)}</h1><ul class="ssr-list">
  ${posts
    .map(
      (p) => `<li><a href="/p/${p.id}" data-link>${escapeHtml(p.title)}</a>
      <p>${escapeHtml(p.excerpt)}</p></li>`
    )
    .join('\n')}
  </ul></section>`;
}

export const categoryList = CATEGORIES;
