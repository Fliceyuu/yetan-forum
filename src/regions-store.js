// 区级地域：只在能识别出城区时写入；绝不保存街道、门牌或用户坐标。
import { db, now } from './db.js';
import { resolveRegion } from './regions.js';

export function saveRegion(postId, locationInput) {
  const r = resolveRegion(locationInput);
  if (!r) return null;
  db.query(
    `INSERT INTO post_regions (post_id, city, area, key, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET city = excluded.city, area = excluded.area, key = excluded.key, lat = excluded.lat, lng = excluded.lng`
  ).run(postId, r.city, r.area, r.key, r.lat, r.lng, now());
  db.query('UPDATE posts SET region_key = ? WHERE id = ?').run(r.key, postId);
  return r;
}

export function regionOf(postId) {
  return db.query('SELECT city, area, key, lat, lng FROM post_regions WHERE post_id = ?').get(postId) || null;
}

/** 每个城区有多少段已发布经历 */
export function regionCounts() {
  return db
    .query(
      `SELECT r.key, r.city, r.area, r.lat, r.lng, COUNT(*) AS count
       FROM post_regions r JOIN posts p ON p.id = r.post_id
       WHERE p.status = 'published'
       GROUP BY r.key ORDER BY count DESC`
    )
    .all();
}

export function cityHints() {
  return db
    .query(
      `SELECT r.city, COUNT(*) AS n FROM post_regions r JOIN posts p ON p.id = r.post_id
       WHERE p.status = 'published' GROUP BY r.city ORDER BY n DESC LIMIT 24`
    )
    .all();
}
