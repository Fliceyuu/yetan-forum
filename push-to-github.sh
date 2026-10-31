#!/usr/bin/env sh
# ============================================================
#  夜谭 · 在电脑上一键推到 GitHub
#
#  用法（把本脚本放在解压后的 ghost-forum 目录里运行）：
#     sh push-to-github.sh 你的GitHub用户名
#     sh push-to-github.sh 你的GitHub用户名 yetan-forum
#
#  提前准备：
#     1. 电脑已装 git（git --version 能显示）
#     2. 已登录 GitHub 的凭据：
#        - 推荐：装了 GitHub CLI 就 `gh auth login`
#        - 或者用 HTTPS + Personal Access Token（会提示输入密码）
#        - 或者已配好 SSH key
#     3. 已经在 GitHub 网页上建好空仓库（不要勾 README），
#        或者装了 gh CLI（脚本会帮你建）
# ============================================================
set -e

OWNER="${1:-}"
REPO="${2:-yetan-forum}"
BRANCH="main"

if [ -z "$OWNER" ]; then
  echo "✘ 请提供你的 GitHub 用户名"
  echo "  用法: sh push-to-github.sh 你的用户名 [仓库名]"
  exit 1
fi

command -v git >/dev/null 2>&1 || {
  echo "✘ 找不到 git，请先安装 https://git-scm.com/downloads" >&2
  exit 1
}

echo "▶ 1/6 检查工作目录"
if [ ! -f package.json ] || [ ! -d src ]; then
  echo "✘ 请在解压出来的 ghost-forum 目录里运行本脚本" >&2
  exit 1
fi
if [ -f Dockerfile ] && [ -f README.md ]; then
  echo "  ✔ 项目文件齐全"
fi

echo "▶ 2/6 修正 README 里的 OWNER 占位"
if grep -q "github.com/OWNER/" README.md 2>/dev/null; then
  # macOS 与 GNU sed 写法不同，这里用可移植的临时文件方式
  sed "s|github.com/OWNER/|github.com/${OWNER}/|g" README.md > README.tmp && mv README.tmp README.md
  echo "  ✔ 徽章链接已指向 github.com/${OWNER}/${REPO}"
else
  echo "  · 无需修改"
fi

echo "▶ 3/6 初始化 git 仓库"
if [ -d .git ]; then
  echo "  · 已存在 .git，跳过"
else
  git init -b "$BRANCH" >/dev/null 2>&1 || {
    # 老版本 git 不支持 -b
    git init >/dev/null
    git checkout -b "$BRANCH" >/dev/null 2>&1 || true
  }
  echo "  ✔ 已初始化（分支 $BRANCH）"
fi

echo "▶ 4/6 安全检查：确认敏感文件不会入库"
LEAK=0
for p in data/forum.db .env srv.log root; do
  if [ -e "$p" ]; then
    if git check-ignore -q "$p" 2>/dev/null; then
      echo "  ✔ $p 已被忽略"
    else
      echo "  ⚠ $p 存在但未被 .gitignore 忽略！" >&2
      LEAK=1
    fi
  fi
done
if [ "$LEAK" = "1" ]; then
  echo "✘ 请不要提交数据库或密钥，检查 .gitignore 后重试" >&2
  exit 1
fi
echo "  ✔ 无数据库 / 密钥 / 本机运行时"

echo "▶ 5/6 提交"
git add -A
if git diff --cached --quiet; then
  echo "  · 没有新改动"
else
  COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
  echo "  将提交 $COUNT 个文件"
  git commit -q -m "夜谭：灵异与玄学亲历社区

一个给「说不出口的经历」的社区，设计上做了几处自我节制：

- 照片上传前在浏览器内重绘，抹掉 EXIF/GPS，可手动打码
- 地点只到区级，原始坐标不入库，地图仅做城区聚合
- 匿名发布使用稳定代号：保护身份，同时保留社区连续性
- PWA：可添加到桌面，离线可访问

技术：Bun + SQLite 单进程，零构建前端（原生 ES Module + SSR 外壳）
部署：docker compose 自带 Caddy 自动 HTTPS
测试：25 项自动化测试"
  echo "  ✔ 提交完成"
fi

echo "▶ 6/6 推送到 GitHub"
RDIR="https://github.com/${OWNER}/${REPO}.git"

# 如果装了 gh CLI，先尝试建仓库，省得手动去网页点
if command -v gh >/dev/null 2>&1; then
  if ! gh repo view "${OWNER}/${REPO}" >/dev/null 2>&1; then
    echo "  · 仓库不存在，用 gh 创建…"
    gh repo create "${OWNER}/${REPO}" --public --source=. --remote=origin --push \
      --description "夜谭 · 灵异与玄学经历社区：照片去元数据、地点只到区级、可安装为 PWA" \
      && {
        echo
        echo "✅ 推送完成：https://github.com/${OWNER}/${REPO}"
        echo "   记得去仓库 Settings → Topics 加上：bun sqlite pwa forum privacy"
        exit 0
      }
  fi
fi

if git remote | grep -qx origin; then
  git remote set-url origin "$RDIR"
else
  git remote add origin "$RDIR"
fi

echo "  · 正在推送到 $RDIR"
if git push -u origin "$BRANCH"; then
  echo
  echo "✅ 推送完成：https://github.com/${OWNER}/${REPO}"
  echo
  echo "接下来建议（在仓库网页上点）："
  echo "  · Settings → Topics 加：bun sqlite pwa forum privacy ghost-stories"
  echo "  · About 简介填：把说不出口的经历，留在这里"
  echo "  · CI 会自动跑测试（.github/workflows/ci.yml）"
else
  echo
  echo "✘ 推送失败。常见原因："
  echo "  · 仓库还没在网页上创建 → 先去 https://github.com/new 建一个空仓库（不要勾 README）"
  echo "  · 需要认证 → 用 Personal Access Token 当密码，或先运行 gh auth login"
  echo "  · 有代理需求 → git config --global http.proxy http://127.0.0.1:端口"
  exit 1
fi
