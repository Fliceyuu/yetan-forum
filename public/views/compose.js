// 写经历 / 编辑：照片在手机端压缩重绘（抹掉 EXIF/GPS），可手动打码后再上传。
import { api, esc, toast, navigate, icons } from '../lib/core.js';
import { store, loadMeta } from '../lib/store.js';
import { processImage, maskEditor } from '../lib/media.js';
import { locateRegion } from '../lib/geo.js';

const fmtKB = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);

export async function renderCompose(mount, editId = null) {
  if (!store.user) return navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
  const meta = await loadMeta();
  let post = null;
  if (editId) {
    try {
      post = (await api(`/api/posts/${editId}`)).post;
      if (!post.mine && !store.user.isAdmin) throw new Error('只能编辑自己的帖子');
      if (post.status !== 'published') throw new Error('只有已发布的帖子可以编辑');
    } catch (e) {
      mount.innerHTML = `<section class="pad" style="padding-top:40px"><p class="muted">${esc(e.message)}</p><a class="btn ghost" href="/" data-link>返回</a></section>`;
      return;
    }
  }

  mount.innerHTML = `
  <section class="pad" style="padding-top:16px">
    <h1 style="font-size:23px">${editId ? '修改这段经历' : '写下一段经历'}</h1>
    <p class="muted" style="font-size:12.5px;margin-top:6px">写得越具体，越有人愿意回应。时间、地点、当时的光线、声音、你的身体反应——这些细节比"很吓人"有用得多。</p>

    <div class="notice" style="margin:14px 0">
      请勿发布：做法步骤、招魂仪式、咒语、具体地点引导他人前往、他人正脸照片、真实门牌号。
      编故事、引流、卖课一律下架。
    </div>

    <form id="form" style="display:grid;gap:4px">
      <label class="field">
        <span class="lbl">标题 · 一句话说清发生了什么</span>
        <input type="text" name="title" maxlength="80" required placeholder="例：凌晨三点，楼下有人用我的声音叫我" value="${esc(post?.title || '')}" />
      </label>

      <div class="grid2">
        <label class="field">
          <span class="lbl">门类</span>
          <select name="category">
            ${meta.categories.map((c) => `<option value="${c.key}" ${post?.category === c.key ? 'selected' : ''}>${esc(c.glyph)} · ${esc(c.name)} — ${esc(c.desc)}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="lbl">发生时间（可模糊）</span>
          <input type="text" name="happenedAt" maxlength="20" placeholder="2023 年冬 / 小时候" value="${esc(post?.happenedAt || '')}" />
        </label>
      </div>

      <label class="field">
        <span class="lbl">地点（只写到城市·区）</span>
        <div class="row" style="gap:8px">
          <input type="text" name="location" maxlength="40" placeholder="成都·青羊区" value="${esc(post?.location || '')}" style="flex:1" />
          <button type="button" class="btn small ghost" id="locate" title="用当前城区填入">${icons.pin}定位</button>
        </div>
        <div class="hint" id="locatestate">填「城市·区」会进入同城地图（只显示到区级）。定位也只会取到城区，不会保存你的精确位置。</div>
      </label>

      <label class="field">
        <span class="lbl">经历正文</span>
        <textarea name="body" rows="12" maxlength="8000" required placeholder="什么时候、在哪里、你看到了什么、做了什么、后来怎样了&#10;&#10;可以用 #标签 让同类经历互相找到，例如 #旧屋 #梦">${esc(post?.body || '')}</textarea>
      </label>
      <div class="between" style="font-size:11.5px;color:var(--text-3);margin-bottom:12px">
        <span>支持 #标签 自动归类</span><span id="count">0 / 8000</span>
      </div>

      <div class="field">
        <span class="lbl">${icons.image} 照片（可选，最多 6 张）</span>
        <input type="file" accept="image/*" multiple id="picked" style="font-size:13px" />
        <div class="hint">上传前在手机上压缩并重新编码：<b>原图里的 GPS、拍摄时间、设备信息不会上传</b>。点缩略图上的「遮」可以打码人脸或门牌。</div>
        <div id="preview" class="thumb-strip" style="margin-top:10px;flex-wrap:wrap"></div>
      </div>

      <div class="field">
        <span class="lbl">${icons.audio} 录音（可选）</span>
        <input type="file" accept="audio/mpeg,audio/mp4,audio/webm,audio/ogg,audio/wav" id="voice" style="font-size:13px" />
        <div class="hint">单文件 ≤ 8MB。录音里请勿出现他人可识别的姓名。</div>
        <div id="voice-preview" style="margin-top:8px"></div>
      </div>

      <label class="switch"><input type="checkbox" name="anonymous" ${post?.anonymous ? 'checked' : ''} /> <span style="font-size:13.5px">匿名发布（读者只会看到"匿名·湿冷楼道"这样的代号）</span></label>

      <div class="row" style="gap:10px;margin-top:14px">
        <button class="btn primary" type="submit" style="flex:1">${editId ? '保存修改' : '提交，让它见天'}</button>
        <button class="btn ghost" type="button" id="cancel">取消</button>
      </div>
      <p class="hint">提交即表示你确认内容为亲身经历，并同意按站点规则展示。</p>
    </form>
  </section>`;

  const form = mount.querySelector('#form');
  const body = form.elements.body;
  const count = mount.querySelector('#count');
  const updateCount = () => (count.textContent = `${body.value.length} / 8000`);
  updateCount();
  body.addEventListener('input', updateCount);

  /* ---------- 定位（只取城区） ---------- */
  mount.querySelector('#locate').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    b.disabled = true;
    b.textContent = '定位中…';
    try {
      const r = await locateRegion();
      form.elements.location.value = r.label;
      mount.querySelector('#locatestate').textContent = `已填入 ${r.label}（区级）。精确坐标没有被保存。`;
      toast(`你在 ${r.label}`);
    } catch (err) {
      toast(err.message || '定位失败，请手动填写', 'err');
    } finally {
      b.disabled = false;
      b.innerHTML = `${icons.pin}定位`;
    }
  });

  /* ---------- 照片：压缩 + 打码 ---------- */
  const picked = mount.querySelector('#picked');
  const preview = mount.querySelector('#preview');
  /** @type {{file: File, url: string, masked: number}[]} */
  let images = (post?.attachments || []).filter((a) => a.kind === 'image').map((a) => ({ url: a.url, file: null, masked: 0, existing: true }));
  for (const it of images) Object.defineProperty(it, 'url', { value: it.url, writable: true });

  const renderPreview = () => {
    preview.innerHTML = images
      .map(
        (it, i) => `<div class="thumb-item" data-i="${i}">
          <img src="${it.url}" alt="第 ${i + 1} 张" />
          ${it.masked ? `<span class="tag-mask">已打码</span>` : ''}
          ${it.existing
            ? ''
            : `<button type="button" class="btn-icon" data-mask="${i}" title="打码" style="position:absolute;right:-6px;top:-6px;padding:2px 6px;min-height:24px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;font-size:10px">遮</button>`}
          <button type="button" class="btn-icon" data-rm="${i}" title="移除" style="position:absolute;left:-6px;top:-6px;padding:2px 6px;min-height:24px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;font-size:10px">✕</button>
          <div style="font-size:9.5px;color:var(--text-3);text-align:center">${it.existing ? '已发布' : fmtKB(it.file.size)}</div>
        </div>`
      )
      .join('');
  };
  renderPreview();

  const addFiles = async (files) => {
    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        toast('只支持图片；录音请用下面的录音框', 'err');
        continue;
      }
      if (images.length >= 6) {
        toast('最多 6 张照片', 'err');
        break;
      }
      try {
        const out = await processImage(f);
        if (out.size > 8 * 1024 * 1024) {
          toast(`「${f.name}」压缩后仍超过 8MB，换一张吧`, 'err');
          continue;
        }
        images.push({ file: out, url: URL.createObjectURL(out), masked: 0 });
      } catch (e) {
        toast(`${f.name}：${e.message}`, 'err');
      }
    }
    renderPreview();
  };
  picked.addEventListener('change', () => {
    addFiles([...picked.files]);
    picked.value = '';
  });

  preview.addEventListener('click', async (e) => {
    const maskIdx = e.target.closest('[data-mask]')?.dataset.mask;
    const rmIdx = e.target.closest('[data-rm]')?.dataset.rm;
    if (rmIdx != null) {
      const it = images[rmIdx];
      if (!it.existing) URL.revokeObjectURL(it.url);
      images.splice(Number(rmIdx), 1);
      renderPreview();
      return;
    }
    if (maskIdx != null) {
      const i = Number(maskIdx);
      const res = await maskEditor(images[i].file);
      if (!res || !res.rects.length) return;
      URL.revokeObjectURL(images[i].url);
      images[i] = { file: res.file, url: URL.createObjectURL(res.file), masked: 1 };
      renderPreview();
      toast('已打码：原图不会上传');
    }
  });

  /* ---------- 录音 ---------- */
  const voice = mount.querySelector('#voice');
  const voicePreview = mount.querySelector('#voice-preview');
  let audioFile = null;
  voice.addEventListener('change', () => {
    const f = voice.files?.[0] || null;
    if (f && f.size > 8 * 1024 * 1024) {
      toast('录音超过 8MB，请裁剪后再传', 'err');
      voice.value = '';
      return;
    }
    audioFile = f;
    voicePreview.innerHTML = f
      ? `<div class="card" style="padding:10px"><div class="between"><span style="font-size:12.5px">${icons.audio} ${esc(f.name)} · ${fmtKB(f.size)}</span><button type="button" class="btn-icon" data-rm-audio>✕</button></div></div>`
      : '';
  });
  voicePreview.addEventListener('click', (e) => {
    if (e.target.closest('[data-rm-audio]')) {
      audioFile = null;
      voice.value = '';
      voicePreview.innerHTML = '';
    }
  });

  mount.querySelector('#cancel').addEventListener('click', () => (history.length > 1 ? history.back() : navigate('/')));

  /* ---------- 提交 ---------- */
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!form.elements.title.value.trim() || body.value.trim().length < 10) {
      toast('标题和正文（≥10 字）都要写', 'err');
      return;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = images.length ? '正在上传…' : '正在提交…';
    const fd = new FormData();
    fd.set('title', form.elements.title.value);
    fd.set('body', body.value);
    fd.set('category', form.elements.category.value);
    fd.set('location', form.elements.location.value);
    fd.set('happenedAt', form.elements.happenedAt.value);
    fd.set('anonymous', form.elements.anonymous.checked ? 'true' : 'false');
    for (const it of images) if (it.file) fd.append('files', it.file);
    if (audioFile) fd.append('files', audioFile);
    try {
      const data = await api(editId ? `/api/posts/${editId}` : '/api/posts', { method: editId ? 'PATCH' : 'POST', raw: fd });
      images.forEach((it) => !it.existing && URL.revokeObjectURL(it.url));
      toast('已发布');
      navigate(`/p/${data.post.id}`, { replace: !!editId });
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
      btn.textContent = editId ? '保存修改' : '提交，让它见天';
    }
  });
}
