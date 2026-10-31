#!/usr/bin/env sh
# 一键把「夜谭」初始化成 git 仓库并推到远端。
#
# 用法：
#   sh tools/init-repo.sh                      # 只初始化本地仓库
#   sh tools/init-repo.sh git@github.com:you/yetan-forum.git
#   sh tools/init-repo.sh https://gitee.com/you/yetan-forum.git
#
# 需要：git ≥ 2.28
set -e

REMOTE="${1:-}"
BRANCH="main"

if ! command -v git >/dev/null 2>&1; then
  echo "✘ 找不到 git，请先安装：https://git-scm.com/downloads" >&2
  exit 1
fi

if [ -d .git ]; then
  echo "· 已经是 git 仓库，跳过初始化"
else
  echo "· 初始化仓库…"
  git init -b "$BRANCH" >/dev/null
fi

# 确认 .gitignore 生效：这些绝不能进仓库
echo "· 安全检查：确认敏感文件未被跟踪…"
LEAK=0
for p in data/forum.db uploads/ root/ .env srv.log; do
  if git check-ignore -q "$p" 2>/dev/null; then
    :
  elif [ -e "$p" ]; then
    echo "  ⚠ $p 存在但未被 .gitignore 忽略！请先修正 .gitignore" >&2
    LEAK=1
  fi
done
[ "$LEAK" = "0" ] && echo "  ✔ 数据库 / 上传 / 运行时不入库"

echo "· 添加文件…"
git add -A

echo "· 当前将要提交的文件数：$(git diff --cached --name-only | wc -l | tr -d ' ')"
echo "· 检查有无意外的二进制大文件："
git diff --cached --numstat | awk '$1 == "-" {print "  ⚠ 二进制: " $3}' || true

# 提交者信息：允许用环境变量覆盖
: "${GIT_AUTHOR_NAME:=夜谭}"
: "${GIT_AUTHOR_EMAIL:=noreply@example.com}"
export GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL

git -c user.name="$GIT_AUTHOR_NAME" -c user.email="$GIT_AUTHOR_EMAIL" \
  commit -m "夜谭：灵异与玄学亲历社区

自我节制式设计：
- 照片上传前在浏览器内重绘，抹掉 EXIF/GPS，可手动打码
- 地点只到区级，原始坐标不入库
- 匿名发布使用稳定代号，兼顾隐私与社区连续性
- PWA：可添加到桌面，离线可访问

Bun + SQLite 单进程，零构建前端。25 项自动化测试。" || echo "· 没有新改动需要提交"

if [ -n "$REMOTE" ]; then
  if git remote | grep -qx origin; then
    git remote set-url origin "$REMOTE"
  else
    git remote add origin "$REMOTE"
  fi
  echo "· 推送到 $REMOTE …"
  git push -u origin "$BRANCH"
  echo "✔ 完成。打开仓库页面确认 README 显示正常。"
else
  cat <<'EOF'

本地仓库已就绪，还没有推送。接下来任选其一：

  # GitHub（需要能访问 github.com，中国大陆通常需代理）
  git remote add origin git@github.com:你的用户名/yetan-forum.git
  git push -u origin main

  # Gitee 码云（国内直连）
  git remote add origin https://gitee.com/你的用户名/yetan-forum.git
  git push -u origin main

推送后在网页上：
  · 设置里把仓库描述填成 "把说不出口的经历，留在这里"
  · 添加 topics: bun sqlite pwa forum privacy ghost-stories
  · 开启 Issues，关闭 Wiki（文档已在 README）
EOF
fi
