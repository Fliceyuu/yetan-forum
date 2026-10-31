// 帖子详情：正文、附件、互动、评论
import { api, esc, timeAgo, num, toast, navigate, icons } from '../lib/core.js';
import { store } from '../lib/store.js';
import { authorLine, catChip, emptyState, lightbox, modal, renderAttachments } from '../lib/ui.js';

const linkify = (text) =>
  esc(text)
    .replace(/#([\p{Script=Han}A-Za-z0-9_]{1,12})/gu, '<span class="tag">#$1</span>')
    .replace(/\n{3,}/g, '\n\n')
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

export async function renderPost(mount, id) {
  mount.innerHTML = '<section class="pad"><div class="skeleton h1"></div><div class="skeleton card" style="height:260px"></div></section>';
  let data;
  try {
    data = await api(`/api/posts/${id}`);
  } catch (e) {
    mount.innerHTML = `<section class="pad" style="padding-top:40px">${emptyState(e.message || '帖子不存在', '无')}
      <div style="text-align:center"><a class="btn ghost" href="/" data-link>回到夜里</a></div></section>`;
    return;
  }
  const { post, comments, viewer } = data;
  const meta = store.meta;

  mount.innerHTML = `
    <article class="article">
      <a class="btn-icon" href="/" data-link style="margin-left:-6px">${icons.back} 回信息流</a>
      <h1 style="margin-top:8px">${esc(post.title)}</h1>
      <div class="meta sub row wrap" style="gap:10px">
        ${catChip(post.category, meta)}
        ${post.location ? `<span class="chip">${esc(post.location)}</span>` : ''}
        ${post.happenedAt ? `<span class="chip">${esc(post.happenedAt)}</span>` : ''}
        ${post.mediaNote ? `<span class="chip" title="上传时已重绘，原图的位置与设备信息没有保存">${icons.shield}已去元数据</span>` : ''}
        <span>${esc(post.author.alias)}</span><span class="sep"></span>
        <span>${timeAgo(post.createdAt)}</span><span class="sep"></span>
        <span>${num(post.views)} 次注视</span>
      </div>
      ${post.status !== 'published' ? `<div class="notice" style="margin-top:12px">这篇还没有公开：${post.status === 'pending' ? '正在等守夜人过目' : '已被下架'}。</div>` : ''}
      <div class="prose" style="margin-top:16px">${linkify(post.body)}</div>
      ${renderMedia(post.attachments)}
      ${post.mine || store.user?.isAdmin
        ? `<div class="row" style="margin-top:16px;gap:8px">
             ${post.mine ? `<a class="btn small ghost" href="/p/${post.id}/edit" data-link>${icons.edit} 编辑</a>` : ''}
             <button class="btn small danger" id="del">${icons.trash} 删除</button>
           </div>`
        : ''}
      ${post.region ? `<p class="hint" style="margin-top:14px">地点只记录到城区（${esc(post.region.city)}${post.region.area ? '·' + esc(post.region.area) : ''}），不显示街道与门牌。<a href="/?region=${encodeURIComponent(post.region.key)}" data-link>看这一区的其他经历 →</a></p>` : ''}
    </article>

    <div class="actions">
      <button class="btn-icon ${viewer.liked ? 'on' : ''}" id="like">${viewer.liked ? icons.heartFill : icons.heart} <span id="like-n">${num(post.likes)}</span></button>
      <button class="btn-icon ${viewer.bookmarked ? 'on' : ''}" id="mark">${viewer.bookmarked ? icons.markFill : icons.mark} <span>${viewer.bookmarked ? '已收' : '收藏'}</span></button>
      <button class="btn-icon" id="jump">${icons.chat} ${num(post.comments)}</button>
      <button class="btn-icon" id="report" style="margin-left:auto">${icons.flag} 举报</button>
    </div>

    <section class="comments">
      <div class="between" style="padding:14px 0 6px"><h2 style="font-size:17px">${num(post.comments)} 条回应<small class="muted" style="font-size:11px;font-family:var(--mono)"> · COMMENTS</small></h2></div>
      ${store.user
        ? `<div class="card composer" style="padding:12px;margin:6px 0 4px">
             <textarea id="cbody" placeholder="说点具体的：你也遇到过？或者有更冷静的解释？" rows="3" maxlength="2000"></textarea>
             <div class="row between">
               <label class="switch" style="font-size:12px;padding:0"><input type="checkbox" id="canon" /> 匿名回应</label>
               <button class="btn small primary" id="send">发送</button>
             </div>
           </div>`
        : `<div class="card" style="text-align:center;padding:18px"><p class="muted" style="font-size:13px">登录后才能回应</p><a class="btn small primary" href="/login" data-link>登录 / 加入</a></div>`}
      <div id="clist">${renderComments(comments, 0)}</div>
      ${comments.length ? '' : emptyState('还没有人回应。第一个开口的人，往往能决定这里的气氛。', '静')}
    </section>
  `;

  /* ---------- 互动 ---------- */
  const likeBtn = mount.querySelector('#like');
  likeBtn.addEventListener('click', async () => {
    if (!store.user) return navigate('/login');
    try {
      const r = await api(`/api/posts/${post.id}/like`, { method: 'POST' });
      likeBtn.classList.toggle('on', r.liked);
      likeBtn.innerHTML = `${r.liked ? icons.heartFill : icons.heart} <span id="like-n">${num(r.likes)}</span>`;
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  const markBtn = mount.querySelector('#mark');
  markBtn.addEventListener('click', async () => {
    if (!store.user) return navigate('/login');
    try {
      const r = await api(`/api/posts/${post.id}/bookmark`, { method: 'POST' });
      markBtn.classList.toggle('on', r.bookmarked);
      markBtn.innerHTML = `${r.bookmarked ? icons.markFill : icons.mark}<span>${r.bookmarked ? '已收' : '收藏'}</span>`;
      toast(r.bookmarked ? '已放入收藏' : '已取消收藏');
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  mount.querySelector('#jump').addEventListener('click', () => {
    mount.querySelector('#clist')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    mount.querySelector('#cbody')?.focus();
  });

  mount.querySelector('#report').addEventListener('click', async () => {
    const reasons = data.reportReasons || {};
    const val = await modal({
      title: '举报这篇内容',
      confirmText: '提交举报',
      body: `<p class="muted" style="font-size:13px">请选择原因。举报用于提醒管理，不会公开。</p>
        <select id="reason">${Object.entries(reasons).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
        <textarea placeholder="补充说明（可选）" rows="3" style="margin-top:10px"></textarea>`,
      capture: (m) => ({ reason: m.querySelector('#reason').value, detail: m.querySelector('textarea').value }),
    });
    if (!val) return;
    try {
      await api(`/api/posts/${post.id}/report`, { method: 'POST', body: { reason: val.reason || 'other', detail: '' } });
      toast('已收到，守夜人会看');
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  const del = mount.querySelector('#del');
  del?.addEventListener('click', async () => {
    const yes = await modal({ title: '确认删除这篇？', body: '<p class="muted">删除后连同评论一起消失，无法恢复。</p>', confirmText: '删除', danger: true });
    if (!yes) return;
    try {
      await api(`/api/posts/${post.id}`, { method: 'DELETE' });
      toast('已删除');
      navigate('/');
    } catch (e) {
      toast(e.message, 'err');
    }
  });

  /* ---------- 评论 ---------- */
  let replyTo = null;
  const cbody = mount.querySelector('#cbody');
  const clist = mount.querySelector('#clist');

  async function send() {
    if (!cbody) return;
    const body = cbody.value.trim();
    if (!body) return toast('先写点什么', 'err');
    try {
      const r = await api(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        body: { body, parentId: replyTo, anonymous: mount.querySelector('#canon').checked },
      });
      cbody.value = '';
      replyTo = null;
      clist.innerHTML = renderComments(r.comments, 0);
      bindReply();
      const h = mount.querySelector('.comments h2');
      if (h) h.innerHTML = h.innerHTML.replace(/^[^\s<]+/, (m) => (Number.isFinite(+m) ? String(+m + 1) : m));
      toast('已发出');
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  mount.querySelector('#send')?.addEventListener('click', send);
  cbody?.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
  });

  function bindReply() {
    clist.querySelectorAll('[data-reply]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!store.user) return navigate('/login');
        const id = Number(btn.dataset.reply);
        const name = btn.dataset.name;
        replyTo = id;
        cbody?.focus();
        if (cbody && !cbody.value) cbody.placeholder = `回应 @${name}：`;
        if (!cbody) return;
        cbody.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast(`正在回应 ${name}`);
      });
    });
    clist.querySelectorAll('[data-delc]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const yes = await modal({ title: '删除这条回应？', confirmText: '删除', danger: true });
        if (!yes) return;
        try {
          await api(`/api/comments/${btn.dataset.delc}`, { method: 'DELETE' });
          toast('已删除');
          renderPost(mount, id);
        } catch (e) {
          toast(e.message, 'err');
        }
      });
    });
  }
  bindReply();

  mount.querySelectorAll('[data-zoom]').forEach((img) => {
    img.addEventListener('click', () => lightbox(img.dataset.zoom));
  });
}

// 图片九宫格 / 视频 / 录音 / 文件（带尺寸，避免加载时布局跳动）
const renderMedia = (list = []) => renderAttachments(list, { zoomable: true });

function renderComments(list, depth) {
  if (!list?.length) return '';
  return list
    .map(
      (c) => `<div class="comment" style="${depth ? 'padding:8px 0;border:0' : ''}">
        <div class="c-head">
          <span class="avatar">${esc((c.author.alias || '匿').replace(/^匿名·/, '匿').slice(0, 1))}</span>
          <span>${esc(c.author.alias)}</span>
          ${c.author.anonymous ? '<span class="badge">匿</span>' : ''}
          <span>· ${timeAgo(c.createdAt)}</span>
          <span style="margin-left:auto" class="row" style="gap:2px">
            <button class="btn-icon" data-reply="${c.id}" data-name="${esc(c.author.alias)}" title="回应" style="padding:2px 6px;min-height:28px;font-size:11.5px">回应</button>
            ${c.mine || store.user?.isAdmin ? `<button class="btn-icon" data-delc="${c.id}" style="padding:2px 6px;min-height:28px;font-size:11.5px">删</button>` : ''}
          </span>
        </div>
        <div class="c-body">${esc(c.body).replace(/\n/g, '<br/>')}</div>
        ${c.replies?.length ? `<div class="replies">${renderComments(c.replies, depth + 1)}</div>` : ''}
      </div>`
    )
    .join('');
}
