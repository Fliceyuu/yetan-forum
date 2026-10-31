// 同城经历地图：只到区级，坐标在服务端就已模糊（见 src/regions.js），前端也不显示任何精确位置。
import { api, esc, num, toast } from '../lib/core.js';
import { store } from '../lib/store.js';
import { projectPoints, locateRegion } from '../lib/geo.js';
import { emptyState, skeletonList, catChip } from '../lib/ui.js';

const esc2 = esc;

export async function renderMap(mount) {
  const meta = store.meta;
  mount.innerHTML = `
    <div class="section-head"><h2>同城经历<small>MAP · 只到区级</small></h2><span class="map-count" id="map-count"></span></div>
    <section class="pad">
      <p class="muted" style="font-size:12.5px;margin-bottom:12px">
        每个点是<b>一个城区</b>，不是一个帖子、也不是任何人的位置。坐标在入库时就被量化到区中心，站点不保存精确位置。
        白色光晕只是"模糊半径"，越远的读者看到的越粗。
      </p>
      <div class="card map-card">
        <div class="map-head"><b>全国</b><span class="muted" style="font-size:11px">共 <span id="region-n">—</span> 个城区有故事</span></div>
        <div class="map-wrap" id="map-wrap">
          <div class="map-empty">正在点亮…</div>
        </div>
        <div class="map-legend"><span>○ = 一个城区（雾化显示）</span><span>不显示街道 · 不显示门牌</span></div>
      </div>
    </section>
    <section class="pad" id="nearby" style="margin-top:6px"></section>
    <div class="section-head"><h2>按城区<small>REGIONS</small></h2></div>
    <section class="pad" id="region-list">${skeletonList(2)}</section>
    <div style="height:24px"></div>`;

  let data;
  try {
    data = await api('/api/map/regions');
  } catch (e) {
    mount.querySelector('#region-list').innerHTML = `<p class="muted">${esc2(e.message)}</p>`;
    return;
  }
  const regions = (data.regions || []).filter((r) => r.lat != null && r.lng != null);
  mount.querySelector('#region-n').textContent = regions.length;
  mount.querySelector('#map-count').textContent = `${num(regions.length)} 城区`;

  const wrap = mount.querySelector('#map-wrap');
  if (!regions.length) {
    wrap.innerHTML = `<div class="map-empty">还没有带地点的经历。<br/>写经历时填「城市·区」，这里就会亮起一点。</div>`;
  } else {
    const pts = projectPoints(regions, 6);
    wrap.innerHTML = `
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="城区故事分布">
        <defs>
          <radialGradient id="mg"><stop offset="0" stop-color="var(--blood-2)" stop-opacity=".55"/><stop offset="1" stop-color="var(--blood-2)" stop-opacity="0"/></radialGradient>
        </defs>
        ${[16, 32, 48, 64, 80].map((v) => `<line x1="${v}" y1="6" x2="${v}" y2="94" stroke="var(--line-soft)" stroke-width=".2"/><line x1="6" y1="${v}" x2="94" y2="${v}" stroke="var(--line-soft)" stroke-width=".2"/>`).join('')}
        ${pts
          .map(
            (p) => `<g class="map-node" data-region="${esc2(p.key)}" tabindex="0">
              <circle class="blur" cx="${p.x}" cy="${p.y}" r="${p.r * 2.2}" fill="url(#mg)" />
              <circle class="blur" cx="${p.x}" cy="${p.y}" r="${p.r}" />
              <circle class="core" cx="${p.x}" cy="${p.y}" r="1.1" />
              <text x="${p.x + 1.8}" y="${p.y - 1.6}">${esc2(p.city)}·${esc2(p.area || '市区')}</text>
            </g>`
          )
          .join('')}
      </svg>`;
    // 纯 SVG 坐标转像素，用于气泡
    const svg = wrap.querySelector('svg');
    const positions = new Map();
    const place = () => {
      positions.clear();
      for (const p of pts) {
        const sx = svg.clientWidth;
        const sy = svg.clientHeight;
        positions.set(p.key, { x: (p.x / 100) * sx, y: (p.y / 100) * sy });
      }
    };
    place();
    window.addEventListener('resize', place, { once: true });
    wrap.querySelectorAll('.map-node').forEach((g) => {
      const show = () => {
        wrap.querySelector('.map-bubble')?.remove();
        const r = pts.find((p) => p.key === g.dataset.region);
        const pos = positions.get(r.key);
        if (!pos) return;
        const b = document.createElement('div');
        b.className = 'map-bubble';
        b.style.left = `${pos.x}px`;
        b.style.top = `${pos.y - 8}px`;
        b.textContent = `${r.city}${r.area ? '·' + r.area : ''} · ${r.count} 段经历`;
        wrap.appendChild(b);
      };
      g.addEventListener('mouseenter', show);
      g.addEventListener('click', show);
      g.addEventListener('mouseleave', () => wrap.querySelector('.map-bubble')?.remove());
    });
  }

  // 按城区列表
  mount.querySelector('#region-list').innerHTML = regions.length
    ? `<div class="card" style="padding:0">${regions
        .map(
          (r) => `<a class="between" href="/?region=${encodeURIComponent(r.key)}" data-link style="padding:13px 14px;border-bottom:1px solid var(--line-soft)">
            <span class="row" style="gap:8px;font-size:14px"><span style="color:var(--blood-2)">◦</span>${esc2(r.city)}${r.area ? '·' + esc2(r.area) : ''}</span>
            <span class="muted" style="font-size:12px">${r.count} 段</span></a>`
        )
        .join('')}</div>`
    : emptyState('还没有人标注过地点。', '图');

  // 定位附近
  const nearby = mount.querySelector('#nearby');
  if (!navigator.geolocation) {
    nearby.innerHTML = '';
  } else {
    nearby.innerHTML = `<div class="card between" style="padding:12px 14px"><span class="muted" style="font-size:12.5px">想知道你身边有没有人写过？</span><button class="btn small ghost" id="loc">定位到城区</button></div>`;
    nearby.querySelector('#loc').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const r = await locateRegion();
        toast(`你在 ${r.label}，只用了区级位置`);
        mount.querySelectorAll('.map-node').forEach((g) => g.classList.toggle('on', g.dataset.region === r.key));
        const g = mount.querySelector(`.map-node[data-region="${r.key}"]`);
        g?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        g?.dispatchEvent(new Event('click'));
      } catch (err) {
        toast(err.message || '定位失败', 'err');
      } finally {
        e.target.disabled = false;
      }
    });
  }
}

/** 首页/信息流顶部的小地图卡片 */
export async function mapCardHtml() {
  try {
    const data = await api('/api/map/regions');
    const regions = (data.regions || []).filter((r) => r.lat != null);
    if (!regions.length) return '';
    const pts = projectPoints(regions.slice(0, 40), 6);
    return `<a class="card" href="/map" data-link style="display:block;padding:12px 14px">
      <div class="between"><b class="serif" style="font-size:15px">同城经历 · ${regions.length} 个城区</b><span class="muted" style="font-size:11.5px">看地图 →</span></div>
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" style="width:100%;height:64px;margin-top:6px" aria-hidden="true">
        ${pts
          .map(
            (p) => `<circle cx="${p.x}" cy="${(p.y / 100) * 34}" r="${Math.max(0.8, p.r / 3)}" fill="var(--blood-2)" opacity=".28"/>
                    <circle cx="${p.x}" cy="${(p.y / 100) * 34}" r="0.7" fill="var(--blood-2)" opacity=".9"/>`
          )
          .join('')}
      </svg>
    </a>`;
  } catch {
    return '';
  }
}
