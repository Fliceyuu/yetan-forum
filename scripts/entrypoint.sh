#!/usr/bin/env sh
# 容器入口：修正数据卷权限 → 可选种子 → 启动服务。
#
# 为什么要修权限：docker compose 新建的命名卷属主是 root，
# 而镜像里以非 root 的 app 用户运行，直接启动会因无法写 SQLite 而失败。
# 这里以 root 启动、修好属主后降权运行，避免在宿主机上手工 chown。
set -e

DB="${DB_PATH:-/data/forum.db}"
UP="${UPLOAD_DIR:-/data/uploads}"

mkdir -p "$(dirname "$DB")" "$UP"

# 只有以 root 启动时才需要修权限（Alpine 下 id -u 为 0）
if [ "$(id -u)" = "0" ]; then
  chown -R app:app "$(dirname "$DB")" "$UP"
  echo "· 已修正数据卷属主 → app"
  EXEC="su-exec app"
else
  EXEC=""
fi

echo "· 夜谭启动中…"
echo "  数据库: $DB"
echo "  上传目录: $UP"

# SEED=1 且库还不存在时写入示例数据（生产环境请保持 SEED=0）
if [ "${SEED:-0}" = "1" ] && [ ! -f "$DB" ]; then
  echo "· 首次运行，写入示例经历…"
  $EXEC bun run src/seed.js || echo "  (种子跳过)"
fi

exec $EXEC bun run src/server.js
