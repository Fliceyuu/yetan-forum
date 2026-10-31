import { db, now } from './db.js';
import { config } from './config.js';
import { HttpError } from './utils.js';

const SESSION_MS = config.sessionDays * 24 * 60 * 60 * 1000;

export async function hashPassword(password) {
  return await Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 });
}
export async function verifyPassword(password, hash) {
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}

const sha = async (s) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export async function createSession(userId) {
  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const t = now();
  db.query('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    await sha(token),
    userId,
    t,
    t + SESSION_MS
  );
  return { token, expiresAt: t + SESSION_MS };
}

export async function destroySession(token) {
  if (!token) return;
  db.query('DELETE FROM sessions WHERE token_hash = ?').run(await sha(token));
}

export function cookieToken(req) {
  const raw = req.headers.get('cookie') || '';
  const m = raw.match(/(?:^|;\s*)sid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export const publicUser = (u) =>
  u && {
    id: u.id,
    username: u.username,
    alias: u.alias,
    isAdmin: !!u.is_admin,
    createdAt: u.created_at,
  };

// 解析当前登录用户（可空）
export async function currentUser(req) {
  const token = cookieToken(req) || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const row = db
    .query(
      `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
    )
    .get(await sha(token));
  if (!row) return null;
  if (row.expires_at < now()) {
    await destroySession(token);
    return null;
  }
  return row;
}

export function requireUser(user) {
  if (!user) throw new HttpError('请先登录', 401);
  return user;
}

export function requireAdmin(user) {
  requireUser(user);
  if (!user.is_admin) throw new HttpError('需要管理员权限', 403);
  return user;
}

export function sessionCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt - now()) / 1000));
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}
export const clearCookie = () => 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
