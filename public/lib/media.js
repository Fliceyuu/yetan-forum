// 图片处理：上传前在手机端压缩并重绘，天然抹掉 EXIF / GPS / 拍摄设备；同时支持手动打码。
// 浏览器里用 canvas 重编码 PNG/JPEG 即可丢弃全部元数据。

export const IMAGE_MAX_SIDE = Number(globalThis.__IMAGE_MAX_SIDE__ || 1600);
export const IMAGE_QUALITY = 0.85;

/**
 * 读成 HTMLImageElement
 */
function loadImage(fileOrBlobUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片无法读取（可能是格式不支持）'));
    img.src = fileOrBlobUrl;
  });
}

/**
 * 压缩 + 抹元数据。返回 File。
 * @param {File} file
 * @param {{maxSide?: number, quality?: number, maskRects?: Array<{x:number,y:number,w:number,h:number}>}} opts
 *   maskRects 使用"相对原图的 0~1 归一化坐标"，会真正烧进像素里
 */
export async function processImage(file, opts = {}) {
  const maxSide = opts.maxSide ?? IMAGE_MAX_SIDE;
  const quality = opts.quality ?? IMAGE_QUALITY;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const ratio = Math.min(1, maxSide / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * ratio));
    const h = Math.max(1, Math.round(srcH * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    // 打码：马赛克（先缩小再放大），而不是纯色块——更像"遮蔽"，也不会丢失周围细节
    for (const r of opts.maskRects || []) {
      const x = Math.max(0, Math.round(r.x * w));
      const y = Math.max(0, Math.round(r.y * h));
      const rw = Math.min(w - x, Math.round(r.w * w));
      const rh = Math.min(h - y, Math.round(r.h * h));
      if (rw < 2 || rh < 2) continue;
      const tmp = document.createElement('canvas');
      const blocks = Math.max(3, Math.round(Math.sqrt(Math.max(rw, rh)) / 3));
      tmp.width = blocks;
      tmp.height = Math.max(1, Math.round((blocks * rh) / rw));
      tmp.getContext('2d').drawImage(canvas, x, y, rw, rh, 0, 0, tmp.width, tmp.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, rw, rh);
      ctx.imageSmoothingEnabled = true;
    }

    // 统一导出 PNG（无损、无元数据、对暗部细节友好）；照片体积太大时退到 JPEG
    let blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    let name = file.name.replace(/\.[^.]+$/, '') + (opts.maskRects?.length ? '-打码' : '') + '.png';
    let type = 'image/png';
    if (!blob || blob.size > 2.5 * 1024 * 1024) {
      const jpg = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
      if (jpg) {
        blob = jpg;
        type = 'image/jpeg';
        name = name.replace(/\.png$/, '.jpg');
      }
    }
    if (!blob) throw new Error('图片处理失败');
    return new File([blob], name, { type, lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 生成用于打码面板的预览（限制最��边，避免大图卡顿） */
export async function previewUrl(file, maxSide = 1200) {
  const out = await processImage(file, { maxSide, quality: 0.8 });
  return { url: URL.createObjectURL(out), file: out };
}

/**
 * 打码面板：拖动/缩放出框，全屏 canvas 预览，确认后把框烧进像素。
 * @returns {Promise<{file: File, rects: Array}|null>} 取消返回 null
 */
export function maskEditor(file) {
  return new Promise(async (resolve) => {
    const srcUrl = URL.createObjectURL(file);
    const img = await loadImage(srcUrl).catch(() => null);
    if (!img) {
      URL.revokeObjectURL(srcUrl);
      return resolve(null);
    }

    const cur = { x: 0.35, y: 0.2, w: 0.3, h: 0.3 }; // 归一化
    const mask = document.createElement('div');
    mask.className = 'mask-mask';
    mask.innerHTML = `
      <div class="mask-panel" role="dialog" aria-label="打码">
        <div class="mask-head">
          <b>打码</b>
          <span class="muted" style="font-size:11.5px">拖动白框到需要遮蔽的位置，或用滑块调大小</span>
        </div>
        <div class="mask-stage"><canvas id="mask-canvas"></canvas><div class="mask-box" id="mask-box"><i></i></div></div>
        <div class="mask-controls">
          <label>大小 <input type="range" id="m-size" min="6" max="90" value="30" /></label>
          <label>确认后，这一步会真正改掉像素，原图不会上传。</label>
        </div>
        <div class="mask-actions">
          <button class="btn ghost" data-x="cancel">取消</button>
          <button class="btn ghost" data-x="skip">不打码，直接用</button>
          <button class="btn primary" data-x="apply">应用打码</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    const canvas = mask.querySelector('#mask-canvas');
    const box = mask.querySelector('#mask-box');
    const ctx = canvas.getContext('2d');

    const W = Math.min(640, Math.round(img.naturalWidth));
    const H = Math.round((img.naturalHeight / img.naturalWidth) * W);
    canvas.width = W;
    canvas.height = H;
    ctx.drawImage(img, 0, 0, W, H);

    const place = () => {
      box.style.left = `${cur.x * 100}%`;
      box.style.top = `${cur.y * 100}%`;
      box.style.width = `${cur.w * 100}%`;
      box.style.height = `${cur.h * 100}%`;
    };
    place();

    // 拖动（鼠标 + 触摸都走 pointer 事件）
    let drag = null;
    const stage = mask.querySelector('.mask-stage');
    const toNorm = (ev) => {
      const r = stage.getBoundingClientRect();
      return { x: (ev.clientX - r.left) / r.width, y: (ev.clientY - r.top) / r.height };
    };
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      box.setPointerCapture(e.pointerId);
      const p = toNorm(e);
      drag = { dx: p.x - cur.x, dy: p.y - cur.y };
    });
    box.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = toNorm(e);
      cur.x = Math.min(1 - cur.w, Math.max(0, p.x - drag.dx));
      cur.y = Math.min(1 - cur.h, Math.max(0, p.y - drag.dy));
      place();
    });
    box.addEventListener('pointerup', () => (drag = null));
    box.addEventListener('pointercancel', () => (drag = null));

    stage.addEventListener('dblclick', (e) => {
      const p = toNorm(e);
      cur.x = Math.min(1 - cur.w, Math.max(0, p.x - cur.w / 2));
      cur.y = Math.min(1 - cur.h, Math.max(0, p.y - cur.h / 2));
      place();
    });

    mask.querySelector('#m-size').addEventListener('input', (e) => {
      const s = Number(e.target.value) / 100;
      const cx = cur.x + cur.w / 2;
      const cy = cur.y + cur.h / 2;
      cur.w = s;
      cur.h = s * (img.naturalHeight / img.naturalWidth);
      cur.x = Math.min(1 - cur.w, Math.max(0, cx - cur.w / 2));
      cur.y = Math.min(1 - cur.h, Math.max(0, cy - cur.h / 2));
      place();
    });

    const close = async (act) => {
      mask.remove();
      URL.revokeObjectURL(srcUrl);
      if (act === 'apply') {
        const out = await processImage(file, { maskRects: [{ ...cur }] });
        resolve({ file: out, rects: [{ ...cur }] });
      } else if (act === 'skip') {
        resolve({ file, rects: [] });
      } else {
        resolve(null);
      }
    };
    mask.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x) close(x);
      else if (e.target === mask) close('cancel');
    });
  });
}
