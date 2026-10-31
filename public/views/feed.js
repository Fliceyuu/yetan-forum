// 首页：hero + 分类 + 信息流
import { api, esc, navigate, toast } from '../lib/core.js';
import { store, loadMeta } from '../lib/store.js';
import { postCard, catChip, emptyState, skeletonList } from '../lib/ui.js';

export async function renderFeed(mount) {
  const params = new URLSearchParams(location.search);
  const sort = params.get('sort') || 'new';
  const category = params.get('category') || '';
  const tag = params.get('tag') || '';
  const q = params.get('q') || '';
  const region = params.get('region') || '';

  const meta = await loadMeta();
  let page = 1;
  let items = [];
  let total = 0;
  let loading = false;

  const sortChip = (key, label) =>
    `<a class="chip ${sort === key && !q ? 'on' : ''}" href="/?sort=${key}${category ? `&category=${category}` : ''}" data-link>${label}</a>`;

  mount.innerHTML = `
    <section class="hero">
      <h1>夜里的事，<br/>说给听得懂的人<em>。</em></h1>
      <p>这里不驱邪、不作法、不下结论。只收集一件事：你亲身经历过、至今解释不了的瞬间。<br/>写清楚时间、地点、细节，剩下的交给读者。</p>
      <div class="stats">
        <div><b>${meta.categories.length}</b>门类</div>
        <div><b id="stat-posts">—</b>段经历</div>
        <div><b id="stat-here">${new Date().getHours() < 5 || new Date().getHours() > 22 ? '是夜里' : '夜还长'}</b>此刻</div>
      </div>
    </section>

    <div class="section-head"><h2>门类<small>CATEGORIES</small></h2><a class="linkmore" href="/categories" data-link>全部 →</a></div>
    <div class="cat-grid">
      ${meta.categories
        .slice(0, 4)
        .map(
          (c) => `<a class="cat-tile" href="/?category=${c.key}" data-link>
        <span class="g">${esc(c.glyph)}</span><span class="n">${esc(c.name)}</span><span class="d">${esc(c.desc)}</span></a>`
        )
        .join('')}
    </div>

    <div class="section-head"><h2>最近开口的人<small>RECENT</small></h2><a class="linkmore" href="/new" data-link>我也写一段 →</a></div>
    <div class="pad" id="map-teaser"></div>
    <div class="toolbar">
      <div class="searchbar" style="padding:0;flex:1">
        <input type="search" id="q" placeholder="搜标题或正文…" value="${esc(q)}" enterkeyhint="search" />
      </div>
    </div>
    <div class="toolbar" style="top:auto;position:static;border:0;padding-top:4px">
      ${sortChip('new', '最新')}
      ${sortChip('hot', '最诡异（热度）')}
      ${sortChip('discussed', '最多讨论')}
      ${category ? `<a class="chip on" href="/${q ? `?q=${encodeURIComponent(q)}` : ''}" data-link>${esc(catChip(category, meta).replace(/<[^>]+>/g, ''))} ✕</a>` : ''}
      ${tag ? `<span class="chip on">#${esc(tag)} ✕</span>` : ''}
      ${meta.tags.map((t) => `<a class="chip" href="/?tag=${encodeURIComponent(t.tag)}" data-link>#${esc(t.tag)}</a>`).join('')}
    </div>
    <section class="pad" id="feed" style="padding-top:10px">${skeletonList(3)}</section>
    <div style="text-align:center;padding:8px 0 30px"><button class="btn ghost" id="more">加载更多</button></div>
  `;

  const feed = mount.querySelector('#feed');
  const more = mount.querySelector('#more');

  async function load(reset = false) {
    if (loading) return;
    loading = true;
    if (reset) {
      page = 1;
      items = [];
      feed.innerHTML = skeletonList(3);
    }
    try {
      const qs = new URLSearchParams({ page, limit: 8, sort });
      if (category) qs.set('category', category);
      if (tag) qs.set('tag', tag);
      if (q) qs.set('q', q);
      if (region) qs.set('region', region);
      const data = await api(`/api/posts?${qs}`);
      items = reset ? data.items : items.concat(data.items);
      total = data.total;
      mount.querySelector('#stat-posts').textContent = data.total;
      feed.innerHTML = items.length
        ? items.map((p) => postCard(p, meta)).join('')
        : emptyState(q ? `没有搜到「${q}」相关的经历` : region ? `「${region}」还没有人开口` : '这一门还空着，第一个开口的人会是你吗？', category ? catChip(category, meta).replace(/<[^>]+>/g, '') : '夜');
      more.style.display = items.length < total ? '' : 'none';
      more.textContent = `加载更多（还有 ${Math.max(total - items.length, 0)}）`;
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      loading = false;
    }
  }

  more.addEventListener('click', () => {
    page += 1;
    load();
  });

  const input = mount.querySelector('#q');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const v = input.value.trim();
      const qs = new URLSearchParams();
      if (v) qs.set('q', v);
      if (category) qs.set('category', category);
      if (sort !== 'new') qs.set('sort', sort);
      history.replaceState({}, '', `/?${qs}`);
      load(true);
    }, 320);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.target.blur();
  });

  // 有分类/搜索/城区筛选时，hero 收起来，让内容更快出现
  if (category || q || tag || region) mount.querySelector('.hero').style.display = 'none';
  if (region) {
    const bar = mount.querySelector('.toolbar');
    bar?.insertAdjacentHTML('afterbegin', `<a class="chip on" href="/map" data-link>${esc(region)} ✕</a>`);
  }

  load(true);

  // 同城经历入口（有数据才显示）
  import('./map.js').then(async ({ mapCardHtml }) => {
    const html = await mapCardHtml();
    const slot = mount.querySelector('#map-teaser');
    if (slot && html) slot.innerHTML = `<div style="margin-bottom:10px">${html}</div>`;
  });
  if (store.user === null && meta.demoMode) {
    // 演示环境提示（不打扰，只在空状态里体现）
  }
}

export async function renderCategories(mount) {
  const meta = await loadMeta();
  mount.innerHTML = `
    <div class="section-head"><h2>门类<small>七门</small></h2><a class="linkmore" href="/" data-link>回到信息流 →</a></div>
    <section class="pad" style="display:grid;gap:10px">
      ${meta.categories
        .map(
          (c) => `<a class="card" href="/?category=${c.key}" data-link style="display:flex;gap:14px;align-items:center">
          <span class="cat-tile" style="width:56px;height:56px;justify-content:center;align-items:center;padding:0;flex:none"><span class="g" style="font-size:22px">${esc(c.glyph)}</span></span>
          <span style="min-width:0"><b class="serif" style="font-size:17px">${esc(c.name)}</b>
          <span class="muted" style="display:block;font-size:12.5px">${esc(c.desc)}</span></span>
        </a>`
        )
        .join('')}
    </section>
    <div class="section-head"><h2>热门标签<small>TAGS</small></h2></div>
    <section class="pad row wrap" style="gap:8px">
      ${meta.tags.map((t) => `<a class="chip" href="/?tag=${encodeURIComponent(t.tag)}" data-link>#${esc(t.tag)} · ${t.n}</a>`).join('') || '<span class="muted">还没有标签</span>'}
    </section>
    <section class="pad" style="margin-top:24px">
      <div class="notice">本站内容均为用户自述的真实体验投稿。我们不提供任何驱邪、招魂、占卜、治病服务。若你出现持续幻觉、失眠或强烈恐惧，请先联系医生或心理援助热线。</div>
    </section>
  `;

}
