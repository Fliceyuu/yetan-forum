// 登录 / 注册
import { api, esc, toast, navigate } from '../lib/core.js';
import { store, loadMeta, setUser, loadSession } from '../lib/store.js';

const nextOf = () => new URLSearchParams(location.search).get('next') || '/';

export async function renderLogin(mount) {
  const meta = await loadMeta();
  const next = nextOf();
  mount.innerHTML = `
  <section class="pad" style="padding-top:26px;max-width:460px;margin:0 auto">
    <h1 style="font-size:26px;letter-spacing:.08em">回来继续讲<em style="color:var(--blood-2)">。</em></h1>
    <p class="muted" style="font-size:13px;margin-top:8px">登录后可以发布经历、回应他人、收藏值得反复看的帖子。</p>
    <form id="login" class="card" style="margin-top:18px;display:grid;gap:10px;padding:16px">
      <label class="field" style="margin:0"><span class="lbl">用户名</span><input name="username" autocomplete="username" required /></label>
      <label class="field" style="margin:0"><span class="lbl">密码</span><input name="password" type="password" autocomplete="current-password" required /></label>
      <button class="btn primary" type="submit">进入夜里</button>
      <div class="between" style="font-size:12.5px"><a class="muted" href="/register" data-link>还没有账号？加入 →</a></div>
    </form>
    ${meta.demoMode
      ? `<div class="card" style="margin-top:14px;padding:14px">
          <b style="font-size:13px">演示账号（点一下直接进入）</b>
          <p class="muted" style="font-size:12px;margin:6px 0 10px">密码统一为 <code>yetan123</code>。这是一个本地演示环境。</p>
          <div class="row wrap" style="gap:8px">
            <button class="btn small ghost" data-demo="vivi">vivi（阿维）</button>
            <button class="btn small ghost" data-demo="laozhou">laozhou（老周）</button>
            <button class="btn small ghost" data-demo="qiuqiu">qiuqiu（秋秋）</button>
            <button class="btn small ghost" data-demo="守夜人">守夜人（站长）</button>
          </div>
        </div>`
      : ''}
    <p class="hint" style="margin-top:16px">登录状态保存在这台设备的 cookie 中，30 天后失效。我们不会把你的经历卖给任何人。</p>
  </section>`;

  const form = mount.querySelector('#login');
  const submit = async (username, password) => {
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { username, password } });
      setUser(data.user);
      toast(`欢迎回来，${data.user.alias}`);
      navigate(next);
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(form.elements.username.value.trim(), form.elements.password.value);
  });
  mount.querySelectorAll('[data-demo]').forEach((b) =>
    b.addEventListener('click', () => submit(b.dataset.demo, 'yetan123'))
  );
}

export async function renderRegister(mount) {
  mount.innerHTML = `
  <section class="pad" style="padding-top:26px;max-width:460px;margin:0 auto">
    <h1 style="font-size:26px;letter-spacing:.08em">取一个代号<em style="color:var(--blood-2)">。</em></h1>
    <p class="muted" style="font-size:13px;margin-top:8px">这里不要求真实姓名。你可以一直用一个没人认识的名字，讲一辈子的事。</p>
    <form id="reg" class="card" style="margin-top:18px;display:grid;gap:10px;padding:16px">
      <label class="field" style="margin:0"><span class="lbl">用户名（登录用）</span><input name="username" autocomplete="username" required placeholder="2-20 位，中英文/数字" /></label>
      <label class="field" style="margin:0"><span class="lbl">显示代号（对外可见）</span><input name="alias" maxlength="20" placeholder="留空则使用用户名" /></label>
      <label class="field" style="margin:0"><span class="lbl">密码</span><input name="password" type="password" autocomplete="new-password" required placeholder="至少 6 位" /></label>
      <label class="switch" style="font-size:12px"><input type="checkbox" id="agree" /> 我已阅读并同意《这里的规矩》</label>
      <button class="btn primary" type="submit">加入</button>
      <a class="muted" style="font-size:12.5px" href="/login" data-link>已有账号 →</a>
    </form>
  </section>`;

  const form = mount.querySelector('#reg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!mount.querySelector('#agree').checked) return toast('请先阅读规则', 'err');
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: {
          username: form.elements.username.value.trim(),
          alias: form.elements.alias.value.trim(),
          password: form.elements.password.value,
        },
      });
      setUser(data.user);
      toast('欢迎，陌生人');
      navigate('/new');
    } catch (e2) {
      toast(e2.message, 'err');
    }
  });
}

export async function renderLogout(mount) {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {}
  setUser(null);
  store.unread = 0;
  toast('已离开');
  navigate('/');
  await loadSession();
}
