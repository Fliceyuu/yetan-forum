// 通用工具：JSON 响应、错误、校验、分页、限流
export function ok(data, init) {
  return Response.json({ ok: true, data }, init);
}

export function fail(message, status = 400, extra) {
  return Response.json({ ok: false, error: message, ...(extra || {}) }, { status });
}

export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// 把 HttpError 统一转成 JSON 响应：路由函数里直接 throw 即可
export async function handled(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return fail(err.message, err.status);
    console.error('[api]', err?.stack || err);
    return fail('服务器开小差了，稍后再试', 500);
  }
}

export function assert(cond, message, status = 400) {
  if (!cond) throw new HttpError(message, status);
}

export function clean(v, max = 500) {
  return String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

export function int(v, def = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export function pagination(url, defLimit = 12, maxLimit = 50) {
  const limit = Math.min(Math.max(int(url.searchParams.get('limit'), defLimit), 1), maxLimit);
  const page = Math.max(int(url.searchParams.get('page'), 1), 1);
  return { limit, page, offset: (page - 1) * limit };
}

// 简易滑动窗口限流（单进程内存版）
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const t = Date.now();
  const list = (buckets.get(key) || []).filter((x) => t - x < windowMs);
  list.push(t);
  buckets.set(key, list);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.length || t - v[v.length - 1] > windowMs) buckets.delete(k);
  }
  return list.length <= max;
}

export function clientIp(req) {
  if (process.env.TRUST_PROXY !== '0') {
    const fwd = req.headers.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || 'local';
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
