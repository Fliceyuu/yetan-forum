// 生成 PWA 图标 PNG（192 / 512 / maskable）。纯 Bun 手写 PNG 编码，无第三方依赖。
// 用法：bun tools/icons.js
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/', import.meta.url).pathname;

function png(width, height, draw) {
  const px = new Uint8Array(width * height * 4);
  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    const al = a / 255;
    px[i] = Math.round(px[i] * (1 - al) + r * al);
    px[i + 1] = Math.round(px[i + 1] * (1 - al) + g * al);
    px[i + 2] = Math.round(px[i + 2] * (1 - al) + b * al);
    px[i + 3] = Math.max(px[i + 3], a);
  };
  draw({ w: width, h: height, put });
  // 行过滤 + 压缩
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(px.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, data.length);
    const body = new Uint8Array(4 + data.length);
    body.set(new TextEncoder().encode(type), 0);
    body.set(data, 4);
    const crc = new Uint8Array(4);
    new DataView(crc.buffer).setUint32(0, crc32(body) >>> 0);
    return [len, body, crc];
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunk('IHDR', ihdr), ...chunk('IDAT', idat), ...chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

let TABLE = null;
function crc32(bytes) {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// —— 画面：深底 + 一圈虚线月相 + 一簇烛火 ——
function drawScene({ w, h, put }, { padding = 0.12, bg = true } = {}) {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2;
  const inner = R * (1 - padding);

  if (bg) {
    // 径向渐变底
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy) / R;
        const t = Math.min(1, Math.max(0, d * 0.95));
        const r = Math.round(34 * (1 - t) + 7 * t);
        const g = Math.round(38 * (1 - t) + 8 * t);
        const b = Math.round(47 * (1 - t) + 11 * t);
        put(x, y, r, g, b, 255);
      }
    }
  }
  // 圆环
  for (let a = 0; a < 360; a += 0.35) {
    const rad = (a * Math.PI) / 180;
    for (const [rr, alpha] of [
      [inner * 0.86, 70],
      [inner * 0.62, 45],
    ]) {
      const x = cx + Math.cos(rad) * rr;
      const y = cy + Math.sin(rad) * rr;
      if (alpha < 60 && Math.floor(a / 4) % 2 === 0) continue; // 虚线
      put(Math.round(x), Math.round(y), 159, 179, 200, alpha);
    }
  }
  // 烛火（泪滴形）
  const fh = inner * 0.74;
  const fw = inner * 0.3;
  for (let y = -fh; y <= inner * 0.42; y += 0.6) {
    const t = (y + fh) / (fh + inner * 0.42); // 0 顶 → 1 底
    const width = fw * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 1.5);
    for (let x = -width; x <= width; x += 0.6) {
      const k = Math.abs(x) / Math.max(width, 0.001);
      const tt = Math.min(1, Math.max(0, t));
      let r, g, b;
      if (tt < 0.35) {
        r = 255; g = 225; b = 175;
      } else if (tt < 0.7) {
        r = 235; g = 130; b = 62;
      } else {
        r = 150; g = 45; b = 38;
      }
      const a = Math.round(255 * (1 - k * 0.55) * (tt < 0.06 ? tt / 0.06 : 1));
      put(Math.round(cx + x), Math.round(cy + y + inner * 0.1), r, g, b, Math.max(0, a));
    }
  }
  // 烛芯高光
  for (let y = -inner * 0.06; y < inner * 0.16; y += 0.5) {
    for (let x = -inner * 0.05; x < inner * 0.05; x += 0.5) {
      if (Math.hypot(x, y) < inner * 0.05) put(Math.round(cx + x), Math.round(cy + y + inner * 0.12), 255, 246, 220, 235);
    }
  }
  // 托（一点余烬光）
  for (let x = -inner * 0.3; x <= inner * 0.3; x += 0.5) {
    const k = Math.abs(x) / (inner * 0.3);
    put(Math.round(cx + x), Math.round(cy + inner * 0.52), 201, 162, 39, Math.round(60 * (1 - k)));
  }
}

const jobs = [
  ['icon-192.png', 192, 0.1],
  ['icon-512.png', 512, 0.1],
  ['icon-maskable.png', 512, 0.24],
  ['apple-touch-icon.png', 180, 0.1],
];

for (const [name, size, padding] of jobs) {
  const data = png(size, size, (ctx) => drawScene(ctx, { padding }));
  await Bun.write(OUT + name, data);
  console.log(`✔ ${name}  ${size}×${size}  ${(data.length / 1024).toFixed(1)}KB`);
}
