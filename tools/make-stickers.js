// 生成内置表情包（纯 SVG → 服务端渲染时不动，前端直接用 SVG 当表情图）
// 说明：SVG 不作为上传类型（可内嵌脚本），但内置表情由我们生成、内容可信。
import { mkdirSync, writeFileSync } from 'node:fs';
import { db, now, migrate, upgrade } from '../src/db.js';
migrate();
upgrade();

mkdirSync('public/stickers', { recursive: true });

const FACES = [
  ['汗', '#f6d7b0', '😅', '汗'],
  ['惊', '#efe0c8', '😨', '惊'],
  ['嘿', '#d9e8ff', '🙂', '嘿'],
  ['嘘', '#e6e6ea', '🤫', '嘘'],
  ['夜', '#c9d3ea', '🌙', '夜'],
  ['火', '#ffd9c9', '🔥', '火'],
  ['手', '#ffe9c2', '🙏', '拜托'],
  ['碎', '#e7e2f5', '💔', '碎了'],
];

const svg = (label, bg, emoji) => `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <defs>
    <radialGradient id="g" cx="40%" cy="30%" r="80%">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${bg}" stop-opacity="0.65"/>
    </radialGradient>
    <filter id="s"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.25"/></filter>
  </defs>
  <rect width="240" height="240" rx="28" fill="url(#g)"/>
  <circle cx="120" cy="112" r="72" fill="#fff" opacity="0.55"/>
  <text x="120" y="140" font-size="86" text-anchor="middle" filter="url(#s)">${emoji}</text>
  <text x="120" y="212" font-size="26" text-anchor="middle" fill="#2b2b33" font-family="serif" opacity="0.8">${label}</text>
</svg>`;

const insert = db.query('INSERT INTO stickers (filename, name, mime, bytes, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)');
for (let i = 0; i < FACES.length; i++) {
  const [name, bg, emoji] = FACES[i];
  const body = svg(name, bg, emoji);
  const filename = `sticker-yetan-${i + 1}.svg`;
  writeFileSync(`public/stickers/${filename}`, body);
  const exists = db.query('SELECT 1 AS x FROM stickers WHERE filename = ?').get(filename);
  if (!exists) insert.run(filename, name, 'image/svg+xml', body.length, i + 1, now());
}
console.log(`内置表情：${FACES.length} 个 → public/stickers/`);
