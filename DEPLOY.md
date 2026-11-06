# 部署上线（自动 HTTPS · 手机可安装）

目标：把「夜谭」跑到一个公网地址上，**全程 HTTPS**，手机浏览器能「添加到主屏幕」。

> **为什么必须有服务器**：这个站有登录、发帖、SQLite 数据库，需要一个常驻进程。
> GitHub Pages 只能托管静态文件（现在那个网页版就是），要能发帖就得有机器跑后端。

---

## 最快的一条路：买台小服务器，跑一条命令

### 第 1 步：准备两样东西

**① 一台服务器**（最便宜的就行）

| 场景 | 推荐 | 大概价格 |
| --- | --- | --- |
| 国内用户为主 | 阿里云/腾讯云 轻量应用服务器 2核2G | ¥60–100/年（常有新用户活动） |
| 不想备案 | 境外 VPS（如 Hetzner、Vultr、DigitalOcean） | $4–6/月 |
| 只是试试 | 任意厂商最低配 1核1G | 够用 |

系统选 **Ubuntu 22.04** 或 **Debian 12**。

> **国内服务器注意**：绑定域名需要 **ICP 备案**，没备案只能用 IP 访问（而且 PWA 装不了，因为要域名）。

**② 一个域名**

去任意域名商买个便宜的（`.com` 约 ¥60/年，`.top`/`.xyz` 更便宜），然后在域名后台加一条记录：

```
类型: A    主机记录: yetan（或 @）    记录值: 你的服务器公网IP
```

意思是让 `yetan.你的域名.com` 指向这台机器。**证书申请依赖这条记录，必须先生效。**

### 第 2 步：连上服务器，跑一条命令

```bash
ssh root@你的服务器IP
```

然后：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Fliceyuu/yetan-forum/main/deploy/install.sh) yetan.你的域名.com 你的邮箱@example.com
```

脚本会自动做完这些：

1. 检查域名是否已指向本机（不对会直接告诉你，避免白等）
2. 装 Docker
3. 拉代码到 `/opt/yetan-forum`
4. 生成配置（关演示账号、开新帖审核）
5. 构建并启动 App + Caddy
6. **自动申请 Let's Encrypt 证书**，配好 HTTPS
7. 做第一次备份

大约 3–5 分钟。结束时屏幕上会打印网址。

### 第 3 步：打开看看

```
https://yetan.你的域名.com
```

手机浏览器打开后，菜单里会有「安装应用」/「添加到主屏幕」。

---

## 部署完立刻要做的事

### 1. 改掉默认管理员密码

首次部署会写入示例数据，管理员是 `守夜人 / yetan123`。**必须立刻改**：

```bash
cd /opt/yetan-forum
bash deploy/ops.sh passwd 守夜人 你的新密码（至少8位）
```

### 2. 不想要示例数据？

首次启动前把 `.env` 里的 `SEED` 改成 `0`，就是空站。已经写过的话：

```bash
cd /opt/yetan-forum
docker compose down
docker volume rm $(docker compose config --format json | grep -o '"name":"[^"]*yetan-data"' | cut -d'"' -f4)
sed -i 's/^SEED=.*/SEED=0/' .env
docker compose up -d
```

---

## 日常运维

全部收在 `deploy/ops.sh` 里，在 `/opt/yetan-forum` 目录下运行：

```bash
bash deploy/ops.sh status      # 服务状态 + 健康检查
bash deploy/ops.sh stats       # 用户/帖子/举报数
bash deploy/ops.sh logs        # 实时日志
bash deploy/ops.sh backup      # 备份（保留最近 7 份）
bash deploy/ops.sh restore backups/backup-2026-11-06-120000.tar.gz
bash deploy/ops.sh update      # 拉新代码并重建
bash deploy/ops.sh admin 某用户   # 设为管理员
bash deploy/ops.sh passwd 某用户 新密码
```

### 自动备份（强烈建议）

```bash
# 每天凌晨 3 点备份
(crontab -l 2>/dev/null; echo "0 3 * * * cd /opt/yetan-forum && bash deploy/ops.sh backup >> /var/log/yetan-backup.log 2>&1") | crontab -
```

再把 `backups/` 定期同步到别的地方（对象存储、另一台机器）。**只存在同一台机器上的备份等于没有备份。**

---

## 上线验收清单

按顺序点一遍，全过才算真的上线：

- [ ] `https://你的域名/healthz` 返回 `{"ok":true,...}`
- [ ] 浏览器地址栏是锁头（不是"不安全"）
- [ ] 首页能看，帖子能点开
- [ ] 能注册新账号
- [ ] 能发帖，带一张照片 → 详情页显示「已去元数据」
- [ ] 地点填「广州 越秀区」→ 地图页出现这个城区
- [ ] 能评论、点赞
- [ ] 手机浏览器出现「安装应用」
- [ ] 装到桌面后断网打开，显示离线页（不是浏览器默认错误页）
- [ ] 登录页**没有**演示账号一键登录（`DEMO_MODE=0` 生效）
- [ ] `curl -I https://你的域名/sw.js` 返回 `Cache-Control: no-cache`
- [ ] **默认管理员密码已改**

---

## 常见问题

**证书一直申请失败？**
99% 是 DNS 没生效或 80 端口被挡。检查：
```bash
dig +short 你的域名.com          # 应该等于服务器公网IP
curl -I http://你的域名.com      # 应该能通（Caddy 要用 80 端口验证）
```
云服务器记得在**安全组/防火墙**放行 80 和 443。

**PWA 装不上？**
必须 HTTPS。先在开发者工具 → Application 里看 Service Worker 是否注册成功。

**上传大图失败？**
调 `.env` 里的 `MAX_UPLOAD_BYTES`（默认 8MB），改完 `docker compose up -d`。

**内存 1G 的机器够吗？**
够。单进程 + SQLite，日常 80–150MB。注意别多人同时传大图。

**想换域名？**
改 `.env` 的 `DOMAIN`，然后 `docker compose restart caddy`（Caddy 会重新签证书）。

---

## 中国境内运营提醒

论坛类服务通常需要 **ICP 备案**及相应许可；未备案的境外服务器也可能被限速。
内容审核责任在运营者身上：请保留举报通道、下架记录，并为灵异/玄学类内容准备
「不提供驱邪/占卜/治病服务」的声明（站点已内置在规则页和发帖页）。

---

## 附：其他平台

`render.yaml`、`fly.toml` 也在仓库里，可用于：

- **Render**：支持 Docker，但免费实例的磁盘不持久（数据会丢），长期用要付费挂磁盘
- **Fly.io**：有持久卷，但目前**没有免费套餐**，最小实例 $2.19/月起

对这个小站来说，**自己一台 VPS + 上面的脚本**往往最省心也最便宜。
