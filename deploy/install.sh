#!/usr/bin/env bash
# ============================================================
#  夜谭 · 一键部署到一台全新服务器
#
#  在一台干净的 Ubuntu/Debian 上，用 root 运行：
#      curl -fsSL https://raw.githubusercontent.com/Fliceyuu/yetan-forum/main/deploy/install.sh | bash -s 你的域名.com 你的邮箱@example.com
#
#  或者先把仓库 clone 下来再本地跑：
#      sudo bash deploy/install.sh 你的域名.com 你的邮箱@example.com
#
#  它会自动完成：
#    · 装 Docker
#    · 拉取代码
#    · 配置域名 + 自动申请 Let's Encrypt 证书
#    · 起服务（App + Caddy）
#    · 做第一次备份
#
#  前提：域名的 A 记录已经指向这台机器的公网 IP。
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
REPO="${REPO:-https://github.com/Fliceyuu/yetan-forum.git}"
DIR="${DIR:-/opt/yetan-forum}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  red "用法: bash deploy/install.sh 你的域名.com 你的邮箱@example.com"
  echo
  echo "  域名必须已经解析到这台机器（A 记录）。"
  echo "  例: bash deploy/install.sh night.example.com me@example.com"
  exit 1
fi

if [ "$(id -u)" != "0" ]; then
  red "请用 root 运行（或 sudo bash deploy/install.sh ...）"
  exit 1
fi

bold "▶ 1/7 检查系统"
. /etc/os-release 2>/dev/null || true
echo "  系统: ${PRETTY_NAME:-未知}"
if ! grep -qiE 'ubuntu|debian' /etc/os-release 2>/dev/null; then
  echo "  ⚠ 这个脚本为 Ubuntu/Debian 写的，其他发行版可能需要手动装 Docker。"
fi

bold "▶ 2/7 检查域名解析"
RESOLVED=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
PUBIP=$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)
echo "  域名解析到: ${RESOLVED:-（查不到）}"
echo "  本机公网 IP: ${PUBIP:-（查不到）}"
if [ -n "$RESOLVED" ] && [ -n "$PUBIP" ] && [ "$RESOLVED" != "$PUBIP" ]; then
  red "  ✘ 域名没指向这台机器，证书会申请失败。"
  echo "    请先把 $DOMAIN 的 A 记录改成 $PUBIP，再重跑本脚本。"
  exit 1
fi
if [ -z "$RESOLVED" ]; then
  echo "  ⚠ 解析不到，继续执行（如果 DNS 还没生效，证书申请会失败）"
fi

bold "▶ 3/7 安装 Docker"
if command -v docker >/dev/null 2>&1; then
  echo "  已安装: $(docker --version)"
else
  echo "  正在安装…"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  green "  ✔ Docker 安装完成"
fi
docker compose version >/dev/null 2>&1 || {
  red "  ✘ 缺少 docker compose 插件"; exit 1;
}

bold "▶ 4/7 获取代码"
if [ -d "$DIR/.git" ]; then
  echo "  已存在，更新中…"
  git -C "$DIR" pull --ff-only
else
  command -v git >/dev/null 2>&1 || apt-get install -y git
  mkdir -p "$(dirname "$DIR")"
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"

bold "▶ 5/7 写入配置"
if [ -f .env ]; then
  echo "  .env 已存在，保留原配置（只更新 DOMAIN/ACME_EMAIL）"
  sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env 2>/dev/null || echo "DOMAIN=$DOMAIN" >> .env
  sed -i "s|^ACME_EMAIL=.*|ACME_EMAIL=$EMAIL|" .env 2>/dev/null || echo "ACME_EMAIL=$EMAIL" >> .env
else
  cat > .env <<EOF
# 由 deploy/install.sh 生成
DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL

# 生产环境：关掉演示账号、开启新帖审核
DEMO_MODE=0
POST_NEEDS_REVIEW=1
TRUST_PROXY=1
SESSION_DAYS=30

# 首次部署可选：写入示例数据（想从空站开始就改成 0）
SEED=${SEED:-1}

SITE_NAME=夜谭
EOF
  chmod 600 .env
  green "  ✔ 已生成 .env"
fi

bold "▶ 6/7 构建并启动"
docker compose up -d --build

echo "  等待服务健康…"
for i in $(seq 1 60); do
  if docker compose ps app 2>/dev/null | grep -q "healthy"; then
    green "  ✔ App 健康"
    break
  fi
  if [ "$i" = "60" ]; then
    red "  ✘ App 60 秒内没起来，查看日志：docker compose logs app"
    docker compose logs --tail=30 app
    exit 1
  fi
  sleep 2
done

echo "  等待证书申请（最多 90 秒）…"
for i in $(seq 1 45); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "https://$DOMAIN/healthz" 2>/dev/null || echo 000)
  if [ "$CODE" = "200" ]; then
    green "  ✔ HTTPS 已就绪"
    break
  fi
  if [ "$i" = "45" ]; then
    echo "  ⚠ HTTPS 还没通。常见原因：DNS 未生效 / 80 端口被防火墙挡住"
    echo "    查看日志: docker compose logs --tail=40 caddy"
  fi
  sleep 2
done

bold "▶ 7/7 首次备份"
mkdir -p backups
# 用 compose 解析出的真实卷名，避免手工拼错
VOL=$(docker compose config --format json 2>/dev/null | grep -o '"name":"[^"]*yetan-data"' | head -1 | cut -d'"' -f4 || true)
if [ -z "$VOL" ]; then
  # 老版本 compose 不支持 --format json，退回约定命名
  VOL="$(basename "$DIR")_yetan-data"
fi
if docker volume inspect "$VOL" >/dev/null 2>&1; then
  docker run --rm -v "$VOL":/data -v "$PWD/backups":/backup alpine \
    sh -c 'tar czf "/backup/first-$(date +%F-%H%M).tar.gz" -C /data forum.db uploads 2>/dev/null || tar czf "/backup/first-$(date +%F-%H%M).tar.gz" -C /data .' \
    && green "  ✔ 备份已存到 $DIR/backups/（卷 $VOL）" || echo "  · 备份失败，可稍后手动做（见 DEPLOY.md）"
else
  echo "  · 数据卷 $VOL 不存在，跳过备份"
fi

echo
bold "============================================"
green  "  ✅ 部署完成"
echo   "  网址:  https://$DOMAIN"
echo   "  后台:  https://$DOMAIN/admin"
echo   "  健康:  https://$DOMAIN/healthz"
echo
echo   "  管理员账号（首次用 SEED=1 时）: 守夜人 / yetan123"
bold   "  ⚠ 立刻改掉这个密码！"
echo
echo   "  常用命令（在 $DIR 下）:"
echo   "    查看状态   docker compose ps"
echo   "    查看日志   docker compose logs -f app"
echo   "    重启       docker compose restart"
echo   "    更新代码   git pull && docker compose up -d --build"
echo   "    停止       docker compose down"
bold "============================================"
