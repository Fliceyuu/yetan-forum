# 夜谭 · 灵异与玄学经历社区

> 把说不出口的经历，留在这里。

**[🌙 在线查看网页版](https://fliceyuu.github.io/yetan-forum/)** · [部署指南](DEPLOY.md) · [GitHub](https://github.com/Fliceyuu/yetan-forum)

[![CI](https://github.com/Fliceyuu/yetan-forum/actions/workflows/ci.yml/badge.svg)](https://github.com/Fliceyuu/yetan-forum/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.1-f9f1e1?logo=bun)](https://bun.sh)
[![PWA](https://img.shields.io/badge/PWA-%E5%8F%AF%E5%AE%89%E8%A3%85-5a4a8a)](DEPLOY.md)

一个能装到手机桌面上的「亲历故事」论坛：照片上传前先去元数据、能手动打码；地点只到区级，还能看同城经历地图。

**零构建**（原生 ES Module + SSR 外壳），**单进程 + SQLite**，一台小机器（甚至一台安卓手机）就能跑。

> **一键上线**：[部署指南](DEPLOY.md) · 自带 Caddy 自动 HTTPS，`docker compose up -d` 就能跑出可安装的 PWA。

```
首页信息流 ──► 帖子详情（正文/照片/录音/评论树）
   │                │
   ├─ 门类筛选       ├─ 点赞 / 收藏 / 举报
   ├─ 关键词搜索     └─ 匿名发布（稳定代号，可追溯同一人）
   ├─ 标签聚合
   ├─ 同城经历地图（只到区级，雾化显示）
   │
发帖（自动分类 + #标签 + 照片去元数据/打码 + 定位只取城区 + 匿名）
   │
我的：资料 / 收藏 / 通知 / 我的帖子
后台（is_admin）：待审核队列 / 举报处理 / 下架 / 数据概览
装到桌面：PWA（离线页 / 桌面图标 / 快捷方式）
```

## 1. 快速开始

### 本地（已在本机跑通：Bun 1.4.4 / Android Termux）

```bash
./start.sh            # 首次运行会自动写种子数据，然后启动服务
# 打开 http://localhost:3000
./start.sh seed --force   # 想重置示例数据
./dev-stop.sh             # 停掉正在跑的服务
```

`start.sh` 会自动设置 `LD_LIBRARY_PATH` 并优先使用项目自带的 `root/` 里的 Termux 版 Bun（因为系统里没装）。

### 其它常用命令

```bash
bash make-package.sh            # 打成可发布的 tar.gz（保留执行权限）
bun tools/icons.js              # 重新生成 PWA 图标 PNG
bun tools/preview.js            # 用真实接口数据生成静态预览页（参数：站点URL 输出文件）
bun tools/backfill-regions.js   # 给老帖子的地点回填区级落点
bun test                        # 全部接口/逻辑测试（25 项）
```

### 任意 Linux / macOS / Docker

```bash
npm install -g bun        # 或者 curl -fsSL https://bun.sh/install | bash
bun run src/seed.js       # 可选：示例数据
bun run src/server.js     # http://localhost:3000
```

环境变量见 `.env.example`（Bun 会自动读取 `.env`）。

### 网页版（无需服务器）

`docs/` 目录是一个**纯静态**版本，内容在构建时固化，可以直接挂到任何静态托管上：

```bash
bun tools/export-static.js   # 从数据库导出 docs/data.json
```

线上地址：**https://fliceyuu.github.io/yetan-forum/**（GitHub Pages，源为 `main` 分支 `/docs`）

它只读：能浏览、搜索、按分类筛选、看区级地图，但不能注册发帖——那需要下面的完整后端。

### 部署上线（自动 HTTPS，手机可安装）

```bash
cp .env.example .env      # 填 DOMAIN 和 ACME_EMAIL，DEMO_MODE=0
docker compose up -d      # App + Caddy 自动申证书
```

几十秒后访问 `https://你的域名`，手机浏览器即可「添加到主屏幕」。
VPS / Fly.io / Render 三种方案的完整步骤、备份与验收清单见 **[DEPLOY.md](DEPLOY.md)**。

### 演示账号

| 用户名 | 密码 | 说明 |
| --- | --- | --- |
| `守夜人` | `yetan123` | 管理员，可进 `/admin` |
| `vivi` / `laozhou` / `qiuqiu` / `anon_dao` / `night_bus` | `yetan123` | 普通用户 |

> 生产环境务必：`DEMO_MODE=0`、改掉/删除演示账号、给管理员换成自己的强密码。

## 2. 为什么这样设计

| 设计 | 原因 |
| --- | --- |
| **匿名 = 稳定代号**（`匿名·湿冷楼道`），不是"匿名用户" | 读者能分辨"是不是同一个人"，管理员也能追溯，避免匿名变成刷屏工具 |
| **发帖必须写细节**（≥10 字，提示时间/地点/光线/身体反应） | 真实感是这类社区唯一的核心资产，"很吓人"式水帖会迅速稀释它 |
| **地点只写到城市/区** | 真实门牌 + 灵异描述 = 深夜有人跑去探险，出了事平台有责任 |
| **附件白名单**（png/jpg/webp/gif/mp3/m4a/webm/ogg/wav） | 不收可执行文件、不收 SVG（可内嵌脚本）、不收压缩包 |
| **自动分类**（关键词打分，用户可覆盖） | 降低发帖摩擦，同时保留人工选择 |
| **举报 → 待办队列** | 灵异内容边界模糊，机器判断不可靠，人工+榜单比全自动审核稳 |
| **规则六条**（不写教程 / 真实优先 / 别泄隐私 / 不吓人不害人 / 身体心理优先 / 审核透明） | 灵异社区最大的合规风险是"教人做法"，规则要写在明面和发帖页 |
| **照片先去元数据**（手机端 canvas 重绘后再上传） | 灵异经历常拍自家里/楼道/学校，原图的 GPS 会精确到门牌。重绘后 EXIF 天然消失，还能顺手打码 |
| **地点只到"区"，坐标量化到区中心** | 既能让"同城的人也遇到过"这件事被看见，又不可能据此找到任何一栋楼 |
| **PWA 而不是 App** | 网页版一套代码，装到桌面上就跟 App 一样全屏；不用商店过审，不用担心被下架 |

## 3. 技术栈与结构

- 运行时：**Bun**（HTTP 服务、SQLite、内置 `Bun.password` argon2id）
- 存储：**SQLite**（WAL 模式），零 ORM、零迁移框架
- 前端：**原生 ES Module**，无打包、无框架；History 路由 + SSR 外壳（首屏骨架 + 无 JS 降级列表）
- 样式：手写 CSS，暗黑悬疑 / 纸感双主题，移动优先 + 安全区适配 + `prefers-reduced-motion`

```
ghost-forum/
├── start.sh / dev-stop.sh      # 启动 / 停止
├── package.json
├── .env.example
├── src/
│   ├── server.js        # HTTP 入口：静态资源、上传目录、页面路由、安全头
│   ├── api.js           # 全部 REST 接口（路由 + 参数校验 + 权限）
│   ├── db.js            # 表结构与索引
│   ├── auth.js          # 会话 cookie、argon2id 哈希、权限
│   ├── posts.js         # 发帖/信息流/详情/自动分类/标签/匿名代号
│   ├── features.js      # 评论、点赞、收藏、举报、通知、附件、统计
│   ├── render.js        # HTML 外壳 & 无 JS 降级
│   ├── regions.js       # 「城市·区」解析成区级锚点（含常见城市表）
│   ├── regions-store.js # 区级落点读写、城区聚合统计
│   ├── image-meta.js    # 服务端读图头取宽高（超大图兜底 + 记录尺寸）
│   ├── config.js        # 配置项与分类定义
│   └── seed.js          # 示例数据（8 篇长文经历 + 评论）
├── public/
│   ├── app.js           # 前端入口：导航、TabBar、路由分发、PWA 引导
│   ├── styles.css       # 全站样式
│   ├── sw.js            # Service Worker（壳页面网络优先 / 静态资源缓存优先）
│   ├── offline.html     # 离线页
│   ├── manifest.webmanifest / icon-*.png
│   ├── lib/{core,store,ui,nav,media,geo,offline}.js
│   └── views/{feed,post,compose,auth,me,admin,map}.js
├── tools/{icons,preview,pack,backfill-regions}.js
└── tests/{api,regions,image}.test.js   # 25 项接口/逻辑测试（bun test）
```

### 照片与地点的隐私链路

```
选图 → canvas 重绘到 ≤1600px（EXIF/GPS 在这步消失）
     → 可选：打码面板拖框，马赛克烧进像素
     → 上传（服务端再读图头校验尺寸/像素量，记录宽高）

地点 → 用户写「成都·青羊区」或用定位（量化到 0.1°≈10km 后就近吸到区）
     → 服务端只存 city / area / 区中心坐标，post_regions 表里没有任何精确坐标
     → 地图只画"雾化圆"，前端也不显示街道
```

## 4. API 一览

统一返回 `{ ok: true, data }` 或 `{ ok: false, error }`；登录态用 `sid` HttpOnly Cookie。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/meta` | 站点信息、分类、热门标签、社区规则 |
| POST | `/api/auth/register` | 注册（用户名 2-20 位，密码 ≥6） |
| POST | `/api/auth/login` | 登录（限流 20 次/分钟/IP） |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/auth/me` | 当前用户 + 未读通知数 |
| POST | `/api/auth/password` | 修改密码（需原密码） |
| GET | `/api/posts` | 信息流：`?category=&q=&tag=&sort=new\|hot\|discussed&page=&limit=&author=` |
| POST | `/api/posts` | 发帖（JSON 或 multipart，字段 `files` 可多个） |
| GET | `/api/posts/:id` | 详情（含评论树、点赞/收藏状态、举报原因） |
| PATCH | `/api/posts/:id` | 编辑（作者或管理员；支持追加附件） |
| DELETE | `/api/posts/:id` | 删除（作者或管理员；同时清理附件文件） |
| POST | `/api/posts/:id/like` | 点赞/取消 |
| POST | `/api/posts/:id/bookmark` | 收藏/取消 |
| POST | `/api/posts/:id/comments` | 评论/回复（`parentId`） |
| POST | `/api/posts/:id/report` | 举报帖子 |
| DELETE | `/api/comments/:id` | 软删除评论 |
| GET | `/api/me/bookmarks` | 我的收藏 |
| GET/POST | `/api/notifications` `/read` | 站内通知 / 全部标记已读 |
| GET | `/api/users/:id` | 用户主页与统计 |
| GET | `/api/map/regions` | 同城经历地图（只返回区域级聚合：`key/city/area/lat/lng/count`） |
| GET | `/api/admin/stats` | 后台概览 |
| GET | `/api/admin/reports` | 举报列表 |
| POST | `/api/admin/reports/:id/resolve` | 标记已处理 |
| GET | `/api/admin/pending` | 待审核队列 |
| POST | `/api/admin/posts/:id/status` | 通过 / 下架 / 待审 |
| GET | `/healthz` | 健康检查 |

### 安全实现要点

- 密码：`Bun.password` **argon2id**（memoryCost 19 MiB，timeCost 2），登录失败统一返回"用户名或密码不正确"（防枚举）
- 会话：32 字节随机 token，只在 DB 存 **SHA-256 摘要**；Cookie 为 `HttpOnly; SameSite=Lax`，30 天过期
- 权限：帖子/评论的修改删除只允许作者或 `is_admin`；后台接口统一 `requireAdmin`
- 上传：MIME 白名单 + 单文件 8MB + 单帖 6 个；文件名随机化；`/uploads/*` **只放行数据库里登记过的文件**（删除立即失效），路径校验防穿越
- 限流：注册/登录/发帖/评论/举报各自的滑动窗口
- 响应头：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: same-origin`
- 前端所有用户内容都经 `esc()` 转义，正文用 `textContent` 风格渲染（只把 `#标签` 变成高亮）


## 5. 测试

```bash
bun test    # 25 项：接口(9) + 区级地图与隐私(10) + 图片尺寸/元数据(6)
```

本机实测：

- 自动化测试 **25/25**，含"地点解析不做猜测""地图接口不泄露作者与正文""超大图被拒后正文仍保住"
- 前端 DOM 渲染与路由（happy-dom 真实执行前端模块）：**32/32**
- 真实 HTTP 全流程 **31/31**：登录 → 带图带地点发帖 → 地图出现该城区 → 详情（含"已去元数据"标记）→ 评论 → 编辑换城区 → 超大图被拒 → 删除后附件立即 404 → 安全头 / 防穿越 / sw.js 不缓存

## 6. 上线前清单（重要）

1. `HOST=127.0.0.1` + 反代 + HTTPS（`TRUST_PROXY=1`）——用仓库里的 `docker-compose.yml` 已自动满足
2. `DEMO_MODE=0`，删除演示账号，用 `POST_NEEDS_REVIEW=1` 开启新帖审核
3. 数据库与 `uploads/` 定时备份（`sqlite3 forum.db ".backup"` + 目录同步）
4. 配好内容安全：举报入口已有，建议加关键词黑名单（做法、招魂、诅咒、约见地点…）
5. 在中国大陆运营：论坛类服务通常需要 **ICP 备案** 及相应许可；境外部署也要准备**内容审核与删除流程**（2 小时级响应）
6. 必读风险：灵异/玄学内容容易被用于**封建迷信引流、诈骗、非法医疗**。规则页与发帖页已内置"不提供驱邪/占卜/治病服务"的声明
7. 未成年人保护：规则页已提示"把内容当故事，不要跟着做"
8. 监控：`/healthz` 做探活；日志里 `[error]` / `[api]` 前缀可直接接告警
9. PWA：**必须 HTTPS**（localhost 除外）才能安装与离线缓存；手机浏览器打开后选「添加到主屏幕」
10. 图片：`MAX_UPLOAD_BYTES` 与 `src/image-meta.js` 的像素上限可按带宽调整；若套 CDN，注意 `/sw.js` 与 `/manifest.webmanifest` 不能被长缓存

## 7. 下一步可以加什么

- 人脸 / 门牌**自动**打码（现在是手机上手动画框；接轻量检测模型可离线跑）
- 长文的分段「细思极恐」折叠与"最吓人的一句话"摘录
- 行政区划表扩充（现为 15 个常见城市；未命中的地点**不会**被猜测归类）
- 音频转写（方便搜索"录音里的内容"）
- 开放 API Token / RSS / 分享卡片（OG meta 已预留）
- 举报分级：多次被举报的账号自动进入"新帖必审"
- 站内好友与私聊（表结构已预留）

## 8. 参与贡献

代码以 **MIT** 开放。想改进它之前，请先读 [CONTRIBUTING.md](CONTRIBUTING.md) 里的**隐私红线**——
图片去元数据、地点只到区级、匿名稳定代号这几条是设计核心，不是可配置项。

安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要开公开 issue。

```bash
bun test                 # 提交前必须全绿（25 项）
sh tools/init-repo.sh    # 把仓库初始化好（含敏感文件检查）
```

---

MIT License. 内容版权归作者所有；平台立场是"记录，不背书"。
