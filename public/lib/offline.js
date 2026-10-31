// 离线提示 + "安装到桌面"引导
import { esc } from './core.js';

let bannerEl = null;

function chip(text) {
  if (!bannerEl) {
    bannerEl = document.createElement('div');
    bannerEl.className = 'offline-chip';
    document.body.appendChild(bannerEl);
  }
  bannerEl.textContent = text;
}

export function initOffline() {
  const sync = () => {
    if (navigator.onLine) {
      bannerEl?.remove();
      bannerEl = null;
    } else chip('离线中 · 已缓存的内容仍可阅读');
  };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

let deferred = null;
const DISMISS_KEY = 'yetan:install-dismissed';

export function initInstall() {
  const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (isStandalone) return;
  if (localStorage.getItem(DISMISS_KEY)) return;

  const show = (mode) => {
    document.querySelector('.install-bar')?.remove();
    const bar = document.createElement('div');
    bar.className = 'install-bar';
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    bar.innerHTML = mode === 'ios'
      ? `<div style="flex:1"><b>装到桌面，夜里更快打开</b><p>Safari 底部分享 <b>▢↑</b> → 「添加到主屏幕」</p></div>
         <button class="btn small ghost" data-x>知道了</button>`
      : `<div style="flex:1"><b>装到桌面</b><p>像 App 一样全屏打开，离线也能读</p></div>
         <button class="btn small primary" data-install>安装</button>
         <button class="btn small ghost" data-x>✕</button>`;
    document.body.appendChild(bar);
    bar.addEventListener('click', async (e) => {
      if (e.target.closest('[data-x]')) {
        localStorage.setItem(DISMISS_KEY, '1');
        bar.remove();
        return;
      }
      if (e.target.closest('[data-install]') && deferred) {
        deferred.prompt();
        const { outcome } = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
        deferred = null;
        bar.remove();
        if (outcome === 'dismissed') localStorage.setItem(DISMISS_KEY, '1');
      }
    });
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    show('chromium');
  });

  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (ios && !isStandalone) setTimeout(() => show('ios'), 2500);

  window.addEventListener('appinstalled', () => localStorage.setItem(DISMISS_KEY, '1'));
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[sw]', e.message));
  });
}
