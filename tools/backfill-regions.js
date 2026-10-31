// 老库回填：把已有的帖子地点解析成区级落点（只补 post_regions，不动正文）
import { db } from '../src/db.js';
import { saveRegion } from '../src/regions-store.js';
import { resolveRegion } from '../src/regions.js';

let filled = 0;
let skipped = 0;
for (const p of db.query('SELECT id, location FROM posts').all()) {
  const exists = db.query('SELECT 1 AS x FROM post_regions WHERE post_id = ?').get(p.id);
  if (exists) continue;
  if (!resolveRegion(p.location)) {
    skipped++;
    continue;
  }
  saveRegion(p.id, p.location);
  filled++;
}
console.log(`回填完成：${filled} 条写入区级落点，${skipped} 条地点无法识别（跳过）`);
for (const r of db.query('SELECT key, COUNT(*) n FROM post_regions GROUP BY key ORDER BY n DESC').all()) {
  console.log(`  ${r.key}  ${r.n}`);
}
