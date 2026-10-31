// 上传白名单与分类：图片 / 视频 / 音频 / 表情包 / 文件
// 原则：只放行浏览器能安全渲染或下载的常见格式；不收可执行文件、不收 SVG（可内嵌脚本）。

export const MEDIA_TYPES = {
  // 图片
  'image/png': { ext: 'png', kind: 'image' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  // 视频
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/webm': { ext: 'webm', kind: 'video' },
  'video/quicktime': { ext: 'mov', kind: 'video' },
  'video/x-m4v': { ext: 'm4v', kind: 'video' },
  // 音频
  'audio/mpeg': { ext: 'mp3', kind: 'audio' },
  'audio/mp4': { ext: 'm4a', kind: 'audio' },
  'audio/x-m4a': { ext: 'm4a', kind: 'audio' },
  'audio/aac': { ext: 'aac', kind: 'audio' },
  'audio/webm': { ext: 'webm', kind: 'audio' },
  'audio/ogg': { ext: 'ogg', kind: 'audio' },
  'audio/wav': { ext: 'wav', kind: 'audio' },
  'audio/x-wav': { ext: 'wav', kind: 'audio' },
  'audio/wave': { ext: 'wav', kind: 'audio' },
  // 文档 / 压缩包（仅作为"文件"下载，不在页面内联渲染）
  'application/pdf': { ext: 'pdf', kind: 'file' },
  'application/zip': { ext: 'zip', kind: 'file' },
  'application/x-zip-compressed': { ext: 'zip', kind: 'file' },
  'text/plain': { ext: 'txt', kind: 'file' },
  'application/msword': { ext: 'doc', kind: 'file' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', kind: 'file' },
};

// 表情包：只收图片，单张更小
export const STICKER_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const kindLabel = { image: '图片', video: '视频', audio: '音频', file: '文件', sticker: '表情' };

// 文件名清洗：只允许字母数字与常见符号，用于下载时的展示名
export function safeName(name = '', fallback = 'file') {
  const base = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return (base || fallback).slice(0, 80);
}

// 如果浏览器没给 MIME（部分 Android 选择器会给空），按扩展名兜底
export function guessMime(file) {
  if (file.type && MEDIA_TYPES[file.type]) return file.type;
  const ext = String(file.name || '').split('.').pop()?.toLowerCase();
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    mp4: 'video/mp4', webm: file.type?.startsWith('audio') ? 'audio/webm' : 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav',
    pdf: 'application/pdf', zip: 'application/zip', txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || file.type || 'application/octet-stream';
}
