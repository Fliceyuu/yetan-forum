// 全局状态：用户、站点元信息、主题
import { api } from './core.js';

export const store = {
  user: null,
  unread: 0,
  unreadDm: 0,
  pendingFriends: 0,
  meta: null,
  theme: localStorage.getItem('yetan:theme') || 'dark',
};

export function applyTheme() {
  document.documentElement.dataset.theme = store.theme;
  localStorage.setItem('yetan:theme', store.theme);
}

export function toggleTheme() {
  store.theme = store.theme === 'dark' ? 'paper' : 'dark';
  applyTheme();
  document.dispatchEvent(new CustomEvent('theme'));
}

export async function loadMeta() {
  if (store.meta) return store.meta;
  store.meta = await api('/api/meta');
  return store.meta;
}

export async function loadSession() {
  try {
    const data = await api('/api/auth/me');
    store.user = data.user;
    store.unread = data.unread || 0;
    store.unreadDm = data.unreadDm || 0;
    store.pendingFriends = data.pendingFriends || 0;
  } catch {
    store.user = null;
  }
  document.dispatchEvent(new CustomEvent('session'));
  return store.user;
}

// 后台轮询：只更新角标，不重渲染整页
let pollTimer = null;
export function startBadgePolling(intervalMs = 20000) {
  stopBadgePolling();
  pollTimer = setInterval(async () => {
    if (!store.user || document.hidden) return;
    try {
      const data = await api('/api/auth/me');
      const before = `${store.unreadDm}|${store.unread}|${store.pendingFriends}`;
      store.unreadDm = data.unreadDm || 0;
      store.unread = data.unread || 0;
      store.pendingFriends = data.pendingFriends || 0;
      if (before !== `${store.unreadDm}|${store.unread}|${store.pendingFriends}`) {
        document.dispatchEvent(new CustomEvent('badges'));
      }
    } catch {}
  }, intervalMs);
}
export function stopBadgePolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

export function setUser(user) {
  store.user = user;
  document.dispatchEvent(new CustomEvent('session'));
}

export const isAdmin = () => !!store.user?.isAdmin;
