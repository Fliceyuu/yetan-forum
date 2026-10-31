// 守夜人后台
import { api, esc, timeAgo, toast, navigate } from '../lib/core.js';
import { store } from '../lib/store.js';
import { emptyState, skeletonList } from '../lib/ui.js';

export async function renderAdmin(mount) {
  if (!store.user) return navigate('/login?next=/admin');
  if (!store.user.isAdmin) {
    mount.innerHTML = `<section class="pad" style="padding-top:40px">${emptyState('这里是守夜人的房间，你现在还进不来。', '门')}</section>`;
    return;
  }
  mount.innerHTML = `<div class="section-head"><h2>守夜人后台<small>NIGHT WATCH</small></h2></div>
    <section class="pad" id="ad">${skeletonList(2)}</section>`;

  const load = async () => {
    const [stats, reports, pending] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/reports'),
      api('/api/admin/pending'),
    ]);
    mount.querySelector('#ad').innerHTML = `
      <div class="grid2">
        <div class="card"><div class="muted" style="font-size:11.5px">已发布</div><b class="serif" style="font-size:26px">${stats.posts}</b></div>
        <div class="card"><div class="muted" style="font-size:11.5px">待审核</div><b class="serif" style="font-size:26px;color:${stats.pending ? 'var(--amber)' : 'inherit'}">${stats.pending}</b></div>
        <div class="card"><div class="muted" style="font-size:11.5px">未处理举报</div><b class="serif" style="font-size:26px;color:${stats.openReports ? 'var(--blood-2)' : 'inherit'}">${stats.openReports}</b></div>
        <div class="card"><div class="muted" style="font-size:11.5px">用户 / 回应</div><b class="serif" style="font-size:26px">${stats.users} / ${stats.comments}</b></div>
      </div>
      <div class="card" style="margin-top:10px">
        <b style="font-size:13px">内容分布</b>
        <div style="margin-top:8px">${stats.topCategories.map((c) => `<div class="kv"><span>${esc(c.category)}</span><span class="muted">${c.n}</span></div>`).join('') || '<span class="muted">空</span>'}</div>
        <div class="kv"><span>附件占用</span><span class="muted">${(stats.uploads.b / 1024 / 1024).toFixed(1)} MB · ${stats.uploads.n} 个</span></div>
      </div>

      <div class="section-head" style="padding-left:0"><h2 style="font-size:16px">待审核<small>QUEUE</small></h2></div>
      <div id="pending">${pending.items.length
        ? pending.items
            .map(
              (p) => `<div class="card">
              <b class="serif">${esc(p.title)}</b>
              <p class="muted" style="font-size:12.5px;margin:6px 0 10px">${esc(p.body.slice(0, 160))}…</p>
              <div class="row" style="gap:8px">
                <button class="btn small primary" data-pass="${p.id}">通过</button>
                <a class="btn small ghost" href="/p/${p.id}" data-link>查看</a>
              </div></div>`
            )
            .join('')
        : '<p class="muted" style="font-size:13px">队列是空的。</p>'}</div>

      <div class="section-head" style="padding-left:0"><h2 style="font-size:16px">举报<small>REPORTS</small></h2></div>
      <div id="reports">${reports.items.length
        ? reports.items
            .map(
              (r) => `<div class="card">
              <div class="row between"><b style="font-size:13.5px">${esc(r.reason)}</b>
                <span class="chip">${r.status === 'open' ? '待处理' : '已处理'}</span></div>
              <p class="muted" style="font-size:12.5px;margin:6px 0">${esc(r.detail || '（无补充）')}</p>
              <div class="meta"><span>${r.post_id ? `帖子 #${r.post_id}` : `评论 #${r.comment_id}`}</span><span class="sep"></span><span>${timeAgo(r.created_at)}</span></div>
              <div class="row" style="gap:8px;margin-top:10px">
                ${r.post_id ? `<a class="btn small ghost" href="/p/${r.post_id}" data-link>查看</a>` : ''}
                ${r.post_id ? `<button class="btn small danger" data-remove="${r.post_id}">下架</button>` : ''}
                ${r.status === 'open' ? `<button class="btn small ghost" data-resolve="${r.id}">标记已处理</button>` : ''}
              </div></div>`
            )
            .join('')
        : '<p class="muted" style="font-size:13px">没有举报。</p>'}</div>
    `;

    mount.querySelectorAll('[data-pass]').forEach((b) =>
      b.addEventListener('click', async () => {
        await api(`/api/admin/posts/${b.dataset.pass}/status`, { method: 'POST', body: { status: 'published' } });
        toast('已通过');
        load();
      })
    );
    mount.querySelectorAll('[data-remove]').forEach((b) =>
      b.addEventListener('click', async () => {
        await api(`/api/admin/posts/${b.dataset.remove}/status`, { method: 'POST', body: { status: 'removed' } });
        toast('已下架');
        load();
      })
    );
    mount.querySelectorAll('[data-resolve]').forEach((b) =>
      b.addEventListener('click', async () => {
        await api(`/api/admin/reports/${b.dataset.resolve}/resolve`, { method: 'POST' });
        toast('已处理');
        load();
      })
    );
  };

  try {
    await load();
  } catch (e) {
    mount.querySelector('#ad').innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}
