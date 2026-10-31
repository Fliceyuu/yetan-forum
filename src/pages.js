// 服务端共用的页面元信息，避免前后端各写一套
export const PAGE_TITLES = {
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

export function pageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (/^\/(messages|dm)\/\d+$/.test(pathname)) return '私聊';
  if (/^\/p\/\d+$/.test(pathname)) return '一段经历';
  if (/^\/u\/\d+$/.test(pathname)) return '主页';
  return '夜谭';
}

/** 底部 Tab（5 个） */
export const TABS = [
  { href: '/', label: '夜里', icon: 'home', match: 'home' },
  { href: '/categories', label: '门类', icon: 'layers', match: 'categories' },
  { href: '/new', label: '写经历', icon: 'plus', compose: true },
  { href: '/notifications', label: '回应', icon: 'bell', match: 'inbox' },
  { href: '/me', label: '我的', icon: 'user', match: 'me' },
];
