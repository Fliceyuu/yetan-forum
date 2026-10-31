// 我的 / 收藏 / 通知 / 用户主页 / 规则
import { api, esc, timeAgo, num, toast, navigate, icons } from '../lib/core.js';
import { store, loadMeta } from '../lib/store.js';
import { postCard, emptyState, skeletonList } from '../lib/ui.js';

export async function renderMe(mount) {
  if (!store.user) return navigate('/login?next=/me');
  const u = store.user;
  let profile = null;
  try {
    profile = await api(`/api/users/${u.id}`);
  } catch {}
  mount.innerHTML = `
  <section class="pad" style="padding-top:20px">
    <div class="row" style="gap:14px">
      <span class="avatar" style="width:56px;height:56px;font-size:22px">${esc(u.alias.slice(0, 1))}</span>
      <div style="min-width:0">
        <h1 style="font-size:22px;display:flex;align-items:center;gap:8px">${esc(u.alias)} ${u.isAdmin ? '<span class="chip glyph">守夜人</span>' : ''}</h1>
        <div class="meta" style="margin-top:4px"><span>@${esc(u.username)}</span><span class="sep"></span><span>加入于 ${new Date(u.createdAt).toLocaleDateString('zh-CN')}</span></div>
      </div>
    </div>
    ${profile
      ? `<div class="grid2" style="margin-top:16px">
          <div class="card"><div class="muted" style="font-size:11.5px">发布的经历</div><b class="serif" style="font-size:24px">${num(profile.stats.posts)}</b></div>
          <div class="card"><div class="muted" style="font-size:11.5px">收到的心动</div><b class="serif" style="font-size:24px">${num(profile.stats.likes)}</b></div>
          <div class="card"><div class="muted" style="font-size:11.5px">收到的回应</div><b class="serif" style="font-size:24px">${num(profile.stats.comments)}</b></div>
          <div class="card"><div class="muted" style="font-size:11.5px">被注视</div><b class="serif" style="font-size:24px">${num(profile.stats.views)}</b></div>
        </div>`
      : ''}
    <div class="card" style="margin-top:10px;padding:4px">
      ${[
        ['/new', '写一段新的经历', icons.edit],
        ['/bookmarks', '我的收藏', icons.mark],
        ['/notifications', `有人回应你 ${store.unread ? `<span class="chip on">${store.unread}</span>` : ''}`, icons.bell],
        ['/about', '这里的规矩', icons.shield],
        ...(u.isAdmin ? [['/admin', '守夜人后台', icons.shield]] : []),
      ]
        .map(
          ([href, label, icon]) =>
            `<a class="between" href="${href}" data-link style="padding:14px 12px;border-bottom:1px solid var(--line-soft);font-size:14px"><span class="row">${icon}${label}</span><span class="muted">›</span></a>`
        )
        .join('')}
      <a class="between" href="/logout" data-link style="padding:14px 12px;font-size:14px"><span class="row">${icons.back}退出登录</span><span class="muted">›</span></a>
    </div>
    <div class="section-head" style="padding-left:0"><h2 style="font-size:16px">我写过的<small>MY STORIES</small></h2></div>
    <div id="mine">${skeletonList(2)}</div>
  </section>`;

  try {
    const data = await api(`/api/posts?author=${u.id}&limit=30`);
    const meta = store.meta || (await loadMeta());
    mount.querySelector('#mine').innerHTML = data.items.length
      ? data.items.map((p) => postCard(p, meta)).join('')
      : emptyState('你还没有写下任何经历。', '笔');
  } catch (e) {
    mount.querySelector('#mine').innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

export async function renderUser(mount, id) {
  let data;
  try {
    data = await api(`/api/users/${id}`);
  } catch (e) {
    return (mount.innerHTML = `<section class="pad">${emptyState(e.message, '无')}</section>`);
  }
  const meta = await loadMeta();
  mount.innerHTML = `
  <section class="pad" style="padding-top:20px">
    <div class="row" style="gap:14px">
      <span class="avatar" style="width:52px;height:52px;font-size:20px">${esc(data.user.alias.slice(0, 1))}</span>
      <div><h1 style="font-size:21px">${esc(data.user.alias)}</h1>
      <div class="meta" style="margin-top:4px"><span>${num(data.stats.posts)} 段经历</span><span class="sep"></span><span>${num(data.stats.likes)} 个心动</span><span class="sep"></span><span>加入于 ${new Date(data.user.createdAt).toLocaleDateString('zh-CN')}</span></div></div>
    </div>
    <div style="margin-top:18px">
      ${data.posts.items.length ? data.posts.items.map((p) => postCard(p, meta)).join('') : emptyState('这个人还没有写下任何经历。', '空')}
    </div>
  </section>`;
}

export async function renderBookmarks(mount) {
  if (!store.user) return navigate('/login?next=/bookmarks');
  const meta = await loadMeta();
  mount.innerHTML = `<div class="section-head"><h2>我的收藏<small>SAVED</small></h2></div><section class="pad" id="bm">${skeletonList(2)}</section>`;
  try {
    const data = await api('/api/me/bookmarks');
    mount.querySelector('#bm').innerHTML = data.items.length
      ? data.items.map((p) => postCard(p, meta)).join('')
      : emptyState('还没有收藏。看到戳中你的那种，就点一下书签。', '签');
  } catch (e) {
    mount.querySelector('#bm').innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

export async function renderNotifications(mount) {
  if (!store.user) return navigate('/login?next=/notifications');
  mount.innerHTML = `<div class="section-head"><h2>有人回应你<small>INBOX</small></h2></div><section class="pad" id="ns">${skeletonList(2)}</section>`;
  try {
    const data = await api('/api/notifications');
    await api('/api/notifications/read', { method: 'POST' });
    store.unread = 0;
    document.dispatchEvent(new CustomEvent('session'));
    mount.querySelector('#ns').innerHTML = data.items.length
      ? data.items
          .map(
            (n) => `<a class="card" href="${n.postId ? `/p/${n.postId}` : '/'}" data-link style="display:block">
            <div class="row between"><span style="font-size:14px">${esc(n.text)}</span>${n.read ? '' : '<span class="dot"></span>'}</div>
            <div class="muted" style="font-size:11.5px;margin-top:4px">${timeAgo(n.createdAt)}</div></a>`
          )
          .join('')
      : emptyState('还没有人找你说话。', '铃');
  } catch (e) {
    mount.querySelector('#ns').innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

export async function renderAbout(mount) {
  const meta = await loadMeta();
  mount.innerHTML = `
  <section class="pad" style="padding-top:20px;max-width:640px">
    <h1 style="font-size:24px">这里的规矩<em style="color:var(--blood-2)">。</em></h1>
    <p class="muted" style="margin-top:10px;font-size:13.5px">${esc(meta.site.name)}是一个记录"亲历"的地方。它不提供答案，只提供一个能放心描述的角落。</p>
    <div class="card" style="margin-top:16px">
      <b class="serif">一、写经历，不写教程</b>
      <p class="muted" style="font-size:13.5px;margin-top:6px">可以描述你看到了什么、做了什么。但不要写"怎么做"——招魂、请神、咒语、开光、驱邪的步骤一律删除。有人会照着做。</p>
    </div>
    <div class="card">
      <b class="serif">二、真实优先</b>
      <p class="muted" style="font-size:13.5px;margin-top:6px">编故事、AI 生成、小说片段、引流卖课，都会下架。细节对不上时，读者有权追问，这是这里最珍贵的东西。</p>
    </div>
    <div class="card">
      <b class="serif">三、别泄露隐私</b>
      <p class="muted" style="font-size:13.5px;margin-top:6px">门牌、单位、学校全名、他人姓名、正脸照片，请自行模糊。不要写出"具体到可以去的地点"。</p>
    </div>
    <div class="card">
      <b class="serif">四、不吓人、不害人</b>
      <p class="muted" style="font-size:13.5px;margin-top:6px">不要鼓动他人前往危险地点、不要"挑战"式发帖、不要在评论区制造群体恐慌。</p>
    </div>
    <div class="card">
      <b class="serif">五、身体和心理优先</b>
      <p class="muted" style="font-size:13.5px;margin-top:6px">持续幻觉、严重失眠、长期恐惧，请先就医。这里不提供医疗、心理诊断或占卜结论。如果你是未成年读者，请把看到的内容当成故事，不要跟着做任何事。</p>
    </div>
    <div class="card">
      <b class="serif">六、关于审核</b>
      <p class="muted" style="font-size:13.5px;margin-top:6px">每篇内容都有"举报"入口。被举报的内容会进入守夜人的待办。我们倾向于保留原文，但会下架违反上面五条的帖子。</p>
    </div>
    <p class="hint" style="margin-top:18px">本站内容均为用户投稿，平台的立场是"记录，不背书"。</p>
  </section>`;
}
