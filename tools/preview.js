// 生成可分享的静态预览：把真实接口数据套进 styles.css，三块手机大小的画面并排。
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const OUT = process.argv[3] || './preview.html';
const root = new URL('..', import.meta.url).pathname;

const css = await (await fetch(BASE + '/styles.css')).text();
const meta = (await (await fetch(BASE + '/api/meta')).json()).data;
const feed = (await (await fetch(BASE + '/api/posts?limit=4')).json()).data;
const regions = (await (await fetch(BASE + '/api/map/regions')).json()).data.regions || [];
const first = feed.items[0];
const detail = (await (await fetch(BASE + `/api/posts/${first.id}`)).json()).data;
const icon = readFileSync(root + 'public/icon.svg', 'utf8');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cat = (k) => meta.categories.find((c) => c.key === k) || { glyph: '?', name: '未知' };
const ago = (ts) => {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))} 分钟前`;
  if (d < 86400) return `${Math.floor(d / 3600)} 小时前`;
  return `${Math.floor(d / 86400)} 天前`;
};

const topbar = (active) => `
  <header class="topbar">
    <a class="brand"><img src="data:image/svg+xml;utf8,${encodeURIComponent(icon)}" style="width:34px;height:34px"/>
      <span class="brand-text"><b>${esc(meta.site.name)}</b><i>${esc(meta.site.tagline)}</i></span></a>
    <nav class="topnav"><a class="${active === 'feed' ? 'active' : ''}">信息流</a><a class="${active === 'map' ? 'active' : ''}">◎同城</a><a>☀</a><a>登录</a></nav>
  </header>`;

const tabbar = (active) => `
  <nav class="tabbar">
    <a class="${active === 'home' ? 'active' : ''}">⌂<span>夜里</span></a>
    <a class="${active === 'layers' ? 'active' : ''}">▤<span>门类</span></a>
    <a class="compose"><span class="plus">+</span><span>写经历</span></a>
    <a>◔<span>回应</span></a>
    <a class="${active === 'me' ? 'active' : ''}">☾<span>我的</span></a>
  </nav>`;

const phone = (inner, caption) => `
  <div class="frame">
    <div class="device"><div class="device-inner">${inner}</div></div>
    <div class="cap">${caption}</div>
  </div>`;

/* 01 首页 */
const home = `${topbar('feed')}
  <section class="hero">
    <h1>夜里的事，<br/>说给听得懂的人<em>。</em></h1>
    <p>这里不驱邪、不作法、不下结论。只收集一件事：你亲身经历过、至今解释不了的瞬间。</p>
    <div class="stats"><div><b>${meta.categories.length}</b>门类</div><div><b>${feed.total}</b>段经历</div><div><b>是夜里</b>此刻</div></div>
  </section>
  <div class="section-head"><h2>门类<small>CATEGORIES</small></h2><span class="linkmore">全部 →</span></div>
  <div class="cat-grid">${meta.categories
    .slice(0, 4)
    .map((c) => `<div class="cat-tile"><span class="g">${esc(c.glyph)}</span><span class="n">${esc(c.name)}</span><span class="d">${esc(c.desc)}</span></div>`)
    .join('')}</div>
  <div class="section-head"><h2>最近开口的人<small>RECENT</small></h2><span class="linkmore">我也写一段 →</span></div>
  <div class="pad"><div class="card" style="padding:12px 14px">
    <div class="between"><b class="serif" style="font-size:15px">同城经历 · ${regions.length} 个城区</b><span class="muted" style="font-size:11.5px">看地图 →</span></div>
    <svg viewBox="0 0 100 34" preserveAspectRatio="none" style="width:100%;height:56px;margin-top:6px">${regions
      .map((r, i) => `<circle cx="${10 + ((i * 37) % 80)}" cy="${8 + ((i * 13) % 20)}" r="${2.2}" fill="var(--blood-2)" opacity=".26"/><circle cx="${10 + ((i * 37) % 80)}" cy="${8 + ((i * 13) % 20)}" r=".7" fill="var(--blood-2)" opacity=".9"/>`)
      .join('')}</svg></div></div>
  <div class="toolbar" style="position:static;border:0"><span class="chip on">最新</span><span class="chip">最诡异</span><span class="chip">最多讨论</span>${meta.tags.slice(0, 2).map((t) => `<span class="chip">#${esc(t.tag)}</span>`).join('')}</div>
  <section class="pad">${feed.items
    .map(
      (p) => `<div class="card post-card">
      <div class="row wrap" style="gap:8px"><span class="chip glyph">${esc(cat(p.category).glyph)} · ${esc(cat(p.category).name)}</span>${p.location ? `<span class="chip">${esc(p.location)}</span>` : ''}</div>
      <div class="t">${esc(p.title)}</div><div class="x">${esc(p.excerpt)}</div>
      <div class="meta"><span class="row" style="gap:6px"><span class="avatar">${esc(p.author.alias.slice(0, 1))}</span><span class="dim">${esc(p.author.alias)}</span></span><span class="sep"></span><span>${ago(p.createdAt)}</span><span class="sep"></span><span>♡ ${p.likes}</span><span>◌ ${p.comments}</span><span>◎ ${p.views}</span></div>
    </div>`
    )
    .join('')}</section><div style="height:80px"></div>${tabbar('home')}`;

/* 02 详情 */
const post = `${topbar()}
  <article class="article">
    <span class="btn-icon" style="margin-left:-6px">‹ 回信息流</span>
    <h1 style="margin-top:8px">${esc(detail.post.title)}</h1>
    <div class="meta sub row wrap" style="gap:10px">
      <span class="chip glyph">${esc(cat(detail.post.category).glyph)} · ${esc(cat(detail.post.category).name)}</span>
      ${detail.post.location ? `<span class="chip">${esc(detail.post.location)}</span>` : ''}
      ${detail.post.happenedAt ? `<span class="chip">${esc(detail.post.happenedAt)}</span>` : ''}
      <span class="chip">⛨已去元数据</span>
      <span>${esc(detail.post.author.alias)}</span><span class="sep"></span><span>${ago(detail.post.createdAt)}</span>
    </div>
    <div class="prose" style="margin-top:16px">${esc(detail.post.body).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, '<br/>')}</p>`).join('')}</div>
    ${detail.post.region ? `<p class="hint" style="margin-top:14px">地点只记录到城区（${esc(detail.post.region.city)}${detail.post.region.area ? '·' + esc(detail.post.region.area) : ''}），不显示街道与门牌。看这一区的其他经历 →</p>` : ''}
  </article>
  <div class="actions"><span class="btn-icon">♡ ${detail.post.likes}</span><span class="btn-icon">⌑ 收藏</span><span class="btn-icon">◌ ${detail.post.comments}</span><span class="btn-icon" style="margin-left:auto">⚑ 举报</span></div>
  <section class="comments">
    <div class="between" style="padding:14px 0 6px"><h2 style="font-size:17px">${detail.post.comments} 条回应</h2></div>
    <div class="card" style="text-align:center;padding:18px"><p class="muted" style="font-size:13px">登录后才能回应</p><span class="btn small primary">登录 / 加入</span></div>
    ${detail.comments.slice(0, 3).map((c) => `<div class="comment"><div class="c-head"><span class="avatar">${esc(c.author.alias.slice(0, 1))}</span><span>${esc(c.author.alias)}</span><span>· ${ago(c.createdAt)}</span></div><div class="c-body">${esc(c.body)}</div></div>`).join('')}
  </section><div style="height:40px"></div>${tabbar('')}`;

/* 03 发帖 + 打码 + 地图 合成一块 */
const compose = `${topbar()}
  <section class="pad" style="padding-top:16px">
    <h1 style="font-size:23px">写下一段经历</h1>
    <p class="muted" style="font-size:12.5px;margin-top:6px">写得越具体，越有人愿意回应。</p>
    <div class="notice" style="margin:14px 0">请勿发布：做法步骤、招魂仪式、咒语、具体地点引导他人前往、他人正脸照片、真实门牌号。</div>
    <label class="field"><span class="lbl">标题 · 一句话说清发生了什么</span><input value="凌晨三点，楼下有人用我的声音叫我" readonly/></label>
    <div class="grid2">
      <label class="field"><span class="lbl">门类</span><select><option>影 · 撞邪 — 亲眼所见</option></select></label>
      <label class="field"><span class="lbl">发生时间</span><input value="2022 年 10 月" readonly/></label>
    </div>
    <label class="field"><span class="lbl">地点（只写到城市·区）</span>
      <div class="row" style="gap:8px"><input value="成都·青羊区" readonly style="flex:1"/><span class="btn small ghost">◎定位</span></div>
      <div class="hint">定位也只会取到城区，不会保存精确位置。</div></label>
    <div class="field"><span class="lbl">▤ 照片（可选，最多 6 张）</span>
      <div class="thumb-strip" style="flex-wrap:wrap;margin-top:8px">
        <div class="thumb-item"><img src="data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#1b2029"/><rect x="26" y="34" width="68" height="52" rx="8" fill="#2b3440"/><circle cx="46" cy="52" r="6" fill="#5d6b7d"/><path d="M30 80 L52 58 L68 74 L80 64 L92 80 Z" fill="#3f4b5a"/></svg>`)}" alt=""/><span class="tag-mask">已打码</span></div>
        <div class="thumb-item"><img src="data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#171b22"/><path d="M0 90 Q30 60 60 80 T120 70 V120 H0Z" fill="#232a34"/></svg>`)}" alt=""/></div>
      </div>
      <div class="hint">上传前在手机上压缩并重新编码：原图里的 GPS、拍摄时间、设备信息不会上传。</div>
    </div>
    <label class="switch"><input type="checkbox" checked/><span style="font-size:13.5px">匿名发布（读者只会看到代号）</span></label>
    <div class="row" style="gap:10px;margin-top:14px"><span class="btn primary" style="flex:1">提交，让它见天</span><span class="btn ghost">取消</span></div>
  </section><div style="height:80px"></div>${tabbar('')}`;

/* 04 地图 */
const mapPts = regions
  .map((r, i) => ({ ...r, x: 12 + ((i * 37) % 76), y: 18 + ((i * 29) % 64) }))
  .map((p) => `<g class="map-node"><circle class="blur" cx="${p.x}" cy="${p.y}" r="11"/><circle class="blur" cx="${p.x}" cy="${p.y}" r="5"/><circle class="core" cx="${p.x}" cy="${p.y}" r="1.2"/><text x="${p.x + 2}" y="${p.y - 2}">${esc(p.city)}${p.area ? '·' + esc(p.area) : ''}</text></g>`)
  .join('');
const map = `${topbar('map')}
  <div class="section-head"><h2>同城经历<small>MAP · 只到区级</small></h2><span class="map-count">${regions.length} 城区</span></div>
  <section class="pad">
    <p class="muted" style="font-size:12.5px;margin-bottom:12px">每个点是<b>一个城区</b>，不是一个帖子、也不是任何人的位置。坐标在入库时就量化到区中心。</p>
    <div class="card map-card"><div class="map-head"><b>全国</b><span class="muted" style="font-size:11px">共 ${regions.length} 个城区有故事</span></div>
      <div class="map-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none">
        ${[16, 32, 48, 64, 80].map((v) => `<line x1="${v}" y1="6" x2="${v}" y2="94" stroke="var(--line-soft)" stroke-width=".2"/><line x1="6" y1="${v}" x2="94" y2="${v}" stroke="var(--line-soft)" stroke-width=".2"/>`).join('')}
        ${mapPts}</svg></div>
      <div class="map-legend"><span>○ = 一个城区（雾化显示）</span><span>不显示街道 · 不显示门牌</span></div>
    </div>
    <div class="card between" style="padding:12px 14px;margin-top:10px"><span class="muted" style="font-size:12.5px">想知道你身边有没有人写过？</span><span class="btn small ghost">定位到城区</span></div>
  </section>
  <div class="section-head"><h2>按城区<small>REGIONS</small></h2></div>
  <section class="pad"><div class="card" style="padding:0">${regions
    .map((r) => `<div class="between" style="padding:13px 14px;border-bottom:1px solid var(--line-soft)"><span class="row" style="gap:8px;font-size:14px"><span style="color:var(--blood-2)">◦</span>${esc(r.city)}${r.area ? '·' + esc(r.area) : ''}</span><span class="muted" style="font-size:12px">${r.count} 段</span></div>`)
    .join('')}</div></section><div style="height:80px"></div>${tabbar('layers')}`;

const htmlOut = `<!doctype html><html lang="zh-CN" data-theme="dark"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>夜谭 · 页面预览</title>
<style>${css}
body{padding-bottom:12px}
.wrapx{display:flex;flex-wrap:wrap;gap:22px;justify-content:center;padding:18px;max-width:1500px;margin:0 auto}
.frame{width:390px;max-width:100%}
.device{aspect-ratio:390/844;overflow:hidden;border-radius:22px;border:1px solid var(--line);background:var(--bg);box-shadow:0 24px 60px #0009}
.device-inner{overflow-y:auto;height:100%}
.cap{font-size:12px;color:var(--text-3);margin:8px 4px 0;letter-spacing:.08em}
.title-row{display:flex;align-items:baseline;gap:10px;padding:20px 20px 0;max-width:1500px;margin:0 auto;flex-wrap:wrap}
.title-row h1{font-size:22px;letter-spacing:.16em}
.title-row span{font-size:12px;color:var(--text-3)}
</style></head><body>
<div class="title-row"><h1>夜谭 · 页面预览</h1><span>手机上看不清可双指放大 · 数据来自真实接口</span></div>
<div class="wrapx">
  ${phone(home, '01 · 首页：hero + 门类 + 同城入口 + 信息流')}
  ${phone(post, '02 · 详情：正文 + 去元数据标记 + 区级说明 + 评论')}
  ${phone(compose, '03 · 发帖：规则 + 区级地点 + 打码后的照片')}
  ${phone(map, '04 · 同城经历：只到区级的雾化地图')}
</div>
</body></html>`;

writeFileSync(OUT, htmlOut);
console.log(`已生成预览：${OUT}（${(htmlOut.length / 1024).toFixed(1)} KB，${regions.length} 个城区）`);
