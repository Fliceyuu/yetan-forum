# 发布到 GitHub（在电脑上做，约 2 分钟）

> 为什么要在电脑上做：这边手机的网络**连不上 github.com**（git push 必须经过它）。
> 项目已经准备好，你在任何能打开 GitHub 的电脑上跑一条命令就行。

## 准备（30 秒）

1. 把 `yetan-forum-src.tar.gz` 传到电脑，解压：
   ```bash
   tar -xzf yetan-forum-src.tar.gz
   cd ghost-forum
   ```
2. 确认装了 git：`git --version`

## 一键推送

```bash
sh push-to-github.sh 你的GitHub用户名
```

脚本会自动：修正 README 徽章里的 `OWNER` 占位 → 初始化仓库 → 检查有没有把数据库/密钥提交 → 提交 → 推送。

**如果装了 GitHub CLI**（`gh`），它会顺带帮你建仓库，连网页都不用开。
没装的话，先去 https://github.com/new 建一个**空仓库**（**不要**勾 "Add a README file"），
名字填 `yetan-forum`，然后再跑上面那条命令。

推的时候会要密码：用 **Personal Access Token**，不是账户密码。
去 https://github.com/settings/tokens 点 "Generate new token (classic)"，勾 `public_repo` 即可。

## 推完之后

在仓库网站上顺手做三件事：

1. **Settings → Topics** 加：`bun` `sqlite` `pwa` `forum` `privacy` `ghost-stories`
2. **About** 简介填：把说不出口的经历，留在这里
3. 看一眼 **Actions** 标签，CI 应该自动跑起来了（25 项测试 + 镜像构建）

## 如果推送失败

| 报错 | 原因 |
| --- | --- |
| `Repository not found` | 仓库还没建，或 token 没 `repo` 权限 |
| `Authentication failed` | 用了账户密码，要换成 Personal Access Token |
| `Connection timed out` | 需要代理：`git config --global http.proxy http://127.0.0.1:你的端口` |
| `Permission denied (publickey)` | 用的是 SSH 地址但没配 key，改用 HTTPS 地址 |

## 顺带说说上线

代码推上去之后，`DEPLOY.md` 里写了怎么把它跑成能访问的网站。
最短的路是在 Fly.io：仓库页面上直接点 Deploy，它会读 `fly.toml`，自动配 HTTPS 和持久卷。
