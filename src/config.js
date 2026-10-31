// 统一配置：所有可变项都走环境变量，方便部署。
const env = (k, d) => (process.env[k] ?? d);

export const config = {
  port: Number(env('PORT', 3000)),
  host: env('HOST', '0.0.0.0'),
  siteName: env('SITE_NAME', '夜谭'),
  siteTagline: env('SITE_TAGLINE', '把说不出口的经历，留在这里'),
  dbPath: env('DB_PATH', 'data/forum.db'),
  uploadDir: env('UPLOAD_DIR', 'uploads'),
  // 单次会话有效期
  sessionDays: Number(env('SESSION_DAYS', 30)),
  // 上传限制
  maxUploadBytes: Number(env('MAX_UPLOAD_BYTES', 8 * 1024 * 1024)),
  maxFilesPerPost: Number(env('MAX_FILES_PER_POST', 6)),
  maxVideoBytes: Number(env('MAX_VIDEO_BYTES', 100 * 1024 * 1024)),
  maxStickerBytes: Number(env('MAX_STICKER_BYTES', 2 * 1024 * 1024)),
  maxFilesPerMessage: Number(env('MAX_FILES_PER_MESSAGE', 6)),
  maxFileBytes: Number(env('MAX_FILE_BYTES', 25 * 1024 * 1024)),
  // 新用户发帖是否需要人工审核（0 = 直接发布）
  postNeedsReview: env('POST_NEEDS_REVIEW', '0') === '1',
  // 演示模式：允许在页面上一键登录预置账号（生产环境请设 DEMO_MODE=0）
  demoMode: env('DEMO_MODE', '1') !== '0',
  // 反向代理后信任 X-Forwarded-For
  trustProxy: env('TRUST_PROXY', '1') !== '0',
  // 私聊：允许给非好友发消息（默认关闭，需先成为好友或对方公开主页关注）
  dmStranger: env('DM_STRANGER', '0') === '1',
  // 私聊消息快照保留天数（0 = 永久）
  dmRetentionDays: Number(env('DM_RETENTION_DAYS', 0)),
};

export const CATEGORIES = [
  { key: 'ghost', name: '撞邪', desc: '亲眼所见、无法解释的存在', glyph: '影' },
  { key: 'dream', name: '梦魇', desc: '梦里带回来的东西', glyph: '寐' },
  { key: 'haunt', name: '旧屋', desc: '老宅、学校、医院、出租屋', glyph: '宅' },
  { key: 'fengshui', name: '风水', desc: '布局、忌諱、搬家与动土', glyph: '舆' },
  { key: 'ritual', name: '玄门', desc: '符、事、香火与民间法门', glyph: '符' },
  { key: 'deja', name: '心证', desc: '预感、巧合、第六感', glyph: '证' },
  { key: 'other', name: '杂谈', desc: '其他说不上来的事', glyph: '谈' },
];

export const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.key, c]));

// 帖子状态：published 已发布 / pending 待审核 / removed 已下架
export const POST_STATUS = ['published', 'pending', 'removed'];

// 好友关系状态
export const FRIEND_STATUS = ['pending', 'accepted', 'blocked'];
