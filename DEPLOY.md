# 部署上线（自动 HTTPS · 手机可安装）

目标：把「夜谭」跑在一个公网地址上，**全程 HTTPS**，手机浏览器打开后能「添加到主屏幕」。

> 为什么必须 HTTPS：PWA 安装、Service Worker 离线缓存、`SameSite` Cookie 都要求安全上下文。
> `localhost` 是唯一例外，所以本机开发不受影响。

三条路，按省心程度排序：

---

## 方案 A：一台 VPS + docker compose（最稳，推荐长期运营）

适合：想长期运营、数据完全自己掌握。

### 1. 准备

- 一台 VPS（1 核 512MB 就够，Debian/Ubuntu）
- 一个域名，**A 记录指向 VPS 的公网 IP**
- 装好 Docker：`curl -fsSL https://get.docker.com | sh`

### 2. 上传代码

```bash
# 在本地打包（不含数据库和上传文件）
bash make-package.sh

# 传到服务器
scp yetan-forum-src.tar.gz user@你的IP:/opt/
ssh user@你的IP 'cd /opt && tar -xzf yetan-forum-src.tar.gz && cd ghost-forum'
```

### 3. 配置

```bash
cd /opt/ghost-forum
cp .env.example .env
```

编辑 `.env`，**至少改这四项**：

```ini
DOMAIN=你的域名.com          # 必填，Caddy 靠它签证书
ACME_EMAIL=你的邮箱@example.com  # 必填，证书到期提醒
DEMO_MODE=0                  # 必填，关掉演示账号一键登录
POST_NEEDS_REVIEW=1          # 建议，新帖先人工审核
```

### 4. 启动

```bash
docker compose up -d
docker compose logs -f caddy   # 看证书申请进度
```

几十秒后访问 `https://你的域名.com`，看到「夜谭」首页就成了。

### 5. 做成手机 App

- **Android（Chrome）**：打开网址 → 右上角菜单 →「安装应用」/「添加到主屏幕」
- **iOS（Safari）**：打开网址 → 分享按钮 →「添加到主屏幕」

装好后是全屏的，有独立图标，断网时会显示离线页。

### 6. 备份（别跳过）

```bash
# SQLite 必须用 .backup，直接 cp 在 WAL 模式下会拿到不一致快照
docker compose exec app sh -c 'bun -e "
import {Database} from \"bun:sqlite\";
const db = new Database(process.env.DB_PATH);
db.exec(\"VACUUM INTO \\\"$DB_PATH.backup\\\"\");
console.log(\"备份完成\");
"'

# 上传文件
docker cp $(docker compose ps -q app):/data/uploads ./backup-uploads-$(date +%F)
```

建议写成 cron，每天一次，备份文件同步到别的地方。

---

## 方案 B：Fly.io（有持久卷，免费额度够小站）

自带 HTTPS 和持久磁盘，不用自己管服务器。

```bash
# 装 flyctl 后
fly launch --no-deploy --copy-config
fly volumes create yetan_data --size 1     # 1GB 够存不少图片
fly secrets set DEMO_MODE=0 POST_NEEDS_REVIEW=1
fly deploy
```

`fly.toml` 已经配好：健康检查、`force_https`、没人访问时自动休眠省钱。
数据库和上传都落在 `/data` 的持久卷上，重建实例不丢。

绑自定义域名：`fly certs add 你的域名.com`，然后按提示配置 DNS。

---

## 方案 C：Render（最省事，但免费版磁盘不持久）

```bash
# 推到 GitHub/Gitee 后，在 Render 控制台 New → Blueprint，选这个仓库
```

`render.yaml` 已经写好。**注意**：免费实例重启会丢失 `/data`，只适合演示。
要长期留存数据，在 `render.yaml` 里取消 `disk` 那段注释（付费功能）。

---

## 上线后验收清单

按顺序点一遍，都能过才算真的上线了：

- [ ] `https://你的域名/healthz` 返回 `{"ok":true,...}`
- [ ] 锁头图标是正常的（不是"不安全"警告）
- [ ] 首页能看，帖子能点开
- [ ] 能注册、登录、发帖
- [ ] 发帖时传一张照片 → 详情页显示「已去元数据」
- [ ] 地点填「广州 越秀区」→ 地图页出现这个城区
- [ ] 手机浏览器出现「安装应用」提示
- [ ] 装到桌面后，断网打开显示离线页（不是浏览器默认错误页）
- [ ] 登录页**没有**演示账号一键登录按钮（说明 `DEMO_MODE=0` 生效）
- [ ] `curl -I https://你的域名/sw.js` 返回 `Cache-Control: no-cache`

## 常见问题

**证书一直申请失败？**
检查域名 A 记录是否已生效（`dig 你的域名.com`），以及 80 端口是否被占用或防火墙拦截。Let's Encrypt 要用 80 端口做验证。

**PWA 装不上？**
必须是 HTTPS，且 `manifest.webmanifest` 和 `sw.js` 都返回 200。先在浏览器开发者工具 → Application 里看 Service Worker 是否注册成功。

**上传大图失败？**
调 `MAX_UPLOAD_BYTES`（默认 8MB），同时注意反向代理的请求体上限，Caddy 默认没有限制。

**内存很小（512MB）会不会撑不住？**
单进程 + SQLite，日常占用在 80–150MB。注意别开太多并发上传。

**改了代码怎么更新？**
```bash
docker compose up -d --build
```
数据在命名卷里，不受影响。

## 中国境内运营提醒

论坛类服务通常需要 **ICP 备案**及相应许可；未备案的境外服务器也可能被限速。
内容审核责任在运营者身上：请保留举报通道、下架记录，并为灵异/玄学类内容准备
「不提供驱邪/占卜/治病服务」的声明（站点已内置）。
