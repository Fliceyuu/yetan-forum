// 共用 UI 片段（只在这里从 core 取需要的工具，避免悬空导入）
import { esc, timeAgo, num, icons, avatar, navigate } from './core.js';
export { avatar };

/** 文件大小（给附件用） */
export const bytes = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);

/** 渲染帖子附件（图片九宫格 / 音频 / 视频 / 文件） */
export function renderAttachments(list = [], { zoomable = true } = {}) {
  if (!list?.length) return '';
  const imgs = list.filter((a) => (a.kind || 'image') === 'image');
  const vids = list.filter((a) => a.kind === 'video');
  const auds = list.filter((a) => a.kind === 'audio');
  const files = list.filter((a) => a.kind === 'file');
  return `
    ${imgs.length
      ? `<div class="media-grid">${imgs
          .map(
            (a, i) =>
              `<img src="${esc(a.url)}" alt="现场照片 ${i + 1}" loading="lazy" class="${imgs.length === 1 ? 'full' : ''}" ${zoomable ? `data-zoom="${esc(a.url)}"` : ''} ${a.width ? `width="${a.width}" height="${a.height}" style="aspect-ratio:${a.width}/${a.height}"` : ''} />`
          )
          .join('')}</div>`
      : ''}
    ${vids.map((a) => `<video controls preload="metadata" src="${esc(a.url)}" style="width:100%;border-radius:10px;margin:8px 0"></video>`).join('')}
    ${auds.length ? `<div class="card" style="padding:12px"><p class="muted" style="font-size:12px">${icons.audio} 现场录音（建议戴耳机）</p>${auds.map((a) => `<audio controls preload="none" src="${esc(a.url)}"></audio>`).join('')}</div>` : ''}
    ${files.map((a) => `<a class="card" href="${esc(a.url)}" style="display:flex;align-items:center;gap:8px;padding:10px 12px;font-size:13px">${icons.tag}<span style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(a.name || '附件')}</span><span class="muted" style="font-size:11px">${bytes(a.bytes)}</span></a>`).join('')}
  `;
}

/** 兼容旧调用：附件选择器的 input */
export const pickerHtml = (id = 'files', accept = 'image/*', multiple = true) =>
  `<input type="file" id="${id}" accept="${accept}" ${multiple ? 'multiple' : ''} style="font-size:13px" />`;

/** 表情面板占位（表情包库尚未启用时返回空串，调用处不会出错） */
export const stickerPanel = () => '';

export const catMap = (meta) => new Map((meta?.categories || []).map((c) => [c.key, c]));

export function catChip(key, meta) {
  const c = catMap(meta).get(key);
  if (!c) return '';
  return `<span class="chip glyph">${esc(c.glyph)} · ${esc(c.name)}</span>`;
}

export function authorLine(post, { withTime = true } = {}) {
  const name = post.author?.alias || '匿名';
  const seal = post.author?.anonymous ? '<span class="badge">匿</span>' : '';
  return `<span class="row" style="gap:6px;min-width:0">
      ${avatar(name, 24)}
      <span class="dim" style="max-width:9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span>${seal}
    </span>
    ${withTime ? `<span class="sep"></span><span>${timeAgo(post.createdAt)}</span>` : ''}`;
}

// 帖子卡片：图片显示缩略图，视频/音频/文件显示类型标记
export function postCard(post, meta) {
  const atts = post.attachments || [];
  const imgs = atts.filter((a) => a.kind === 'image').slice(0, 3);
  const marks = atts.filter((a) => a.kind !== 'image');
  const counts = {};
  for (const a of marks) counts[a.kind] = (counts[a.kind] || 0) + 1;
  const markIcon = { video: icons.video, audio: icons.audio, file: icons.file };
  const strip =
    imgs.length || Object.keys(counts).length
      ? `<div class="thumb-strip">${imgs.map((a) => `<img src="${esc(a.url)}" alt="" loading="lazy" />`).join('')}
          ${Object.entries(counts)
            .map(([k, n]) => `<span class="audio-pill" title="${k}">${markIcon[k] || icons.file}${n > 1 ? `<b>${n}</b>` : ''}</span>`)
            .join('')}</div>`
      : '';
  return `<a class="card post-card" href="/p/${post.id}" data-link>
    <div class="row wrap" style="gap:8px">
      ${catChip(post.category, meta)}
      ${post.location ? `<span class="chip">${icons.pin}${esc(post.location)}</span>` : ''}
      ${post.happenedAt ? `<span class="chip">${esc(post.happenedAt)}</span>` : ''}
      ${post.status === 'pending' ? '<span class="chip" style="color:var(--amber)">待审核</span>' : ''}
    </div>
    <div class="t">${esc(post.title)}</div>
    <div class="x">${esc(post.excerpt).replace(/#[\S]+/g, (m) => `<span class="tag">${m}</span>`)}</div>
    ${strip}
    <div class="meta">
      ${authorLine(post)}
      <span class="sep"></span>
      <span class="row" style="gap:4px">${icons.heart}${num(post.likes)}</span>
      <span class="row" style="gap:4px">${icons.chat}${num(post.comments)}</span>
      <span class="row" style="gap:4px">${icons.eye}${num(post.views)}</span>
    </div>
  </a>`;
}

export function emptyState(text, glyph = '空') {
  return `<div class="empty"><span class="glyph">${esc(glyph)}</span>${esc(text)}</div>`;
}

export function skeletonList(n = 4) {
  return `<section class="pad">${'<div class="skeleton card"></div>'.repeat(n)}</section>`;
}

// 弹窗：返回 Promise<boolean | string | 自定义对象>
export function modal({ title, body, confirmText = '确定', cancelText = '取消', danger = false, capture }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>
      <div class="modal-body">${body || ''}</div>
      <div class="modal-actions">
        <button class="btn ghost" data-act="cancel">${esc(cancelText)}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${esc(confirmText)}</button>
      </div>
    </div>`;
    const close = (val) => {
      mask.remove();
      resolve(val);
    };
    mask.addEventListener('click', (e) => {
      if (e.target === mask) close(false);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') close(false);
      if (act === 'ok') {
        if (capture) return close(capture(mask));
        const input = mask.querySelector('input, textarea, select');
        close(input ? input.value : true);
      }
    });
    root.appendChild(mask);
    mask.querySelector('input, textarea, select')?.focus();
  });
}

export function removeConfirm(cb) {
  return async (e) => {
    e?.preventDefault?.();
    const yes = await modal({ title: '确认删除？', body: '<p class="muted">删除后无法恢复。</p>', confirmText: '删除', danger: true });
    if (yes) cb();
  };
}

// 图片灯箱
export function lightbox(src) {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = `<img src="${esc(src)}" alt="查看大图" />`;
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
}

// 给页面内所有 [data-zoom] 绑定灯箱
export function bindZoom(root = document) {
  root.querySelectorAll('[data-zoom]').forEach((img) => {
    if (img.dataset.zoomBound) return;
    img.dataset.zoomBound = '1';
    img.addEventListener('click', () => lightbox(img.dataset.zoom));
  });
}

/* ---------------- 好友按钮：根据关系状态渲染 ---------------- */
const REL_TEXT = {
  none: '加好友',
  requested: '已申请',
  incoming: '同意好友',
  friends: '好友',
  blocked: '已拉黑',
  self: '这是你',
  anonymous: '登录后可加好友',
};

export function friendButton(card, { onChanged } = {}) {
  const rel = card?.relation?.state || 'none';
  const uid = card?.user?.id;
  const label = REL_TEXT[rel] || '加好友';
  const disabled = ['self', 'anonymous', 'blocked', 'requested', 'friends'].includes(rel);
  return `<button class="btn small ${rel === 'friends' ? 'ghost' : 'primary'}" id="friend-btn" data-uid="${uid}" data-state="${rel}" ${disabled ? 'disabled' : ''}>
    ${rel === 'friends' ? icons.userCheck : icons.userPlus} ${label}
  </button>`;
}

export function bindFriendButton(root, card, { onChanged } = {}) {
  const btn = root.querySelector('#friend-btn');
  if (!btn || btn.disabled) return;
  btn.addEventListener('click', async () => {
    const { api, toast } = await import('./core.js');
    const uid = btn.dataset.uid;
    try {
      if (btn.dataset.state === 'incoming') {
        await api(`/api/friends/${card.relation.friendshipId}/accept`, { method: 'POST' });
        toast('你们成为好友了');
      } else {
        await api(`/api/friends/request/${uid}`, { method: 'POST' });
        toast('好友申请已发出');
      }
      onChanged?.();
    } catch (e) {
      toast(e.message, 'err');
    }
  });
}

export { navigate };
