// 应用入口：主题、会话、导航、路由分发、PWA
import { esc, navigate, onRouteChange, routePath, icons, toast, api } from './lib/core.js';
import { store, loadMeta, loadSession, setUser, applyTheme, toggleTheme } from './lib/store.js';
import { initOffline, initInstall, registerServiceWorker } from './lib/offline.js';
import { renderFeed, renderCategories } from './views/feed.js';
import { renderPost } from './views/post.js';
import { renderCompose } from './views/compose.js';
import { renderLogin, renderRegister, renderLogout } from './views/auth.js';
import { renderMe, renderUser, renderBookmarks, renderNotifications, renderAbout } from './views/me.js';
import { renderAdmin } from './views/admin.js';
import { renderMap } from './views/map.js';

applyTheme();

const app = () => document.getElementById('app');

/* ---------------- 顶部导航 / 底部 tab ---------------- */
function renderChrome(path) {
  const user = store.user;
  const nav = document.getElementById('topnav');
  if (nav) {
    nav.innerHTML = `
      <a href="/" data-link class="${path === '/' ? 'active' : ''}">信息流</a>
      <a href="/map" data-link class="${path === '/map' ? 'active' : ''} hide-sm">${icons.pin}同城</a>
      <button id="theme-btn" title="切换纸感/夜色">${store.theme === 'dark' ? icons.sun : icons.moon}</button>
      ${user
        ? `<a href="/notifications" data-link class="hide-sm" title="有人回应你">${icons.bell}${store.unread ? '<span class="dot"></span>' : ''}</a>
           <a href="/me" data-link class="${path === '/me' ? 'active' : ''}">${esc(user.alias)}</a>`
        : `<a href="/login" data-link>登录</a>`}
    `;
    nav.querySelector('#theme-btn')?.addEventListener('click', () => {
      toggleTheme();
      renderChrome(routePath());
    });
  }

  const tab = document.getElementById('tabbar');
  if (tab) {
    const active = (p) => (path === p ? 'active' : '');
    tab.innerHTML = `
      <a href="/" data-link class="${active('/')}">${icons.home}<span>夜里</span></a>
      <a href="/categories" data-link class="${active('/categories') || active('/map')}">${icons.layers}<span>门类</span></a>
      <a href="/new" data-link class="compose"><span class="plus">+</span><span>写经历</span></a>
      <a href="/notifications" data-link class="${active('/notifications')}">${icons.bell}<span>回应</span></a>
      <a href="${user ? '/me' : '/login'}" data-link class="${active('/me')}">${icons.user}<span>我的</span></a>
    `;
  }
}

document.addEventListener('session', () => renderChrome(routePath()));

/* ---------------- 路由 ---------------- */
async function route() {
  const path = routePath();
  const mount = app();
  renderChrome(path);
  mount.classList.remove('flash');
  void mount.offsetWidth;
  mount.classList.add('flash');
  try {
    if (path === '/' || path === '/feed') return renderFeed(mount);
    if (path === '/categories') return renderCategories(mount);
    if (path === '/map') return renderMap(mount);
    if (path === '/new') return renderCompose(mount);
    if (path === '/login') return renderLogin(mount);
    if (path === '/register') return renderRegister(mount);
    if (path === '/logout') return renderLogout(mount);
    if (path === '/me') return renderMe(mount);
    if (path === '/bookmarks') return renderBookmarks(mount);
    if (path === '/notifications') return renderNotifications(mount);
    if (path === '/about') return renderAbout(mount);
    if (path === '/admin') return renderAdmin(mount);
    let m;
    if ((m = path.match(/^\/p\/(\d+)$/))) return renderPost(mount, Number(m[1]));
    if ((m = path.match(/^\/p\/(\d+)\/edit$/))) return renderCompose(mount, Number(m[1]));
    if ((m = path.match(/^\/u\/(\d+)$/))) return renderUser(mount, Number(m[1]));
    mount.innerHTML = `<section class="pad" style="padding-top:60px"><div class="empty"><span class="glyph">门</span>这扇门后面什么都没有。<br/><br/><a class="btn ghost" href="/" data-link>回到夜里</a></div></section>`;
  } catch (e) {
    console.error(e);
    mount.innerHTML = `<section class="pad" style="padding-top:40px"><div class="empty"><span class="glyph">断</span>${esc(e.message || '出错了')}<br/><br/><a class="btn ghost" href="/" data-link>回到夜里</a></div></section>`;
  }
}

/* ---------------- 启动 ---------------- */
(async function boot() {
  initOffline();
  initInstall();
  registerServiceWorker();
  await Promise.all([loadMeta().catch(() => null), loadSession()]);
  renderChrome(routePath());
  onRouteChange(route);
  await route();

  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/input|textarea/i.test(e.target.tagName)) {
      const q = document.getElementById('q');
      if (q) {
        e.preventDefault();
        q.focus();
      }
    }
  });
})();

export { navigate, setUser, api, toast };
