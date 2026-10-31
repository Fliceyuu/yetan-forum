#!/data/data/com.coomi.android/files/usr/bin/bash
# 夜谭论坛 本地启动脚本（Termux 二进制版 Bun）
cd "$(dirname "$0")" || exit 1

BUN_BIN="$(pwd)/root/data/data/com.termux/files/usr/bin/bun"
if [ ! -x "$BUN_BIN" ]; then
  # 如果系统里已经装了 bun，就用系统的
  if command -v bun >/dev/null 2>&1; then BUN_BIN="$(command -v bun)"; else
    echo "找不到 bun。请安装 bun 1.1+（或删掉 root/ 目录后运行 'bun install' 方案）。"; exit 1; fi
fi

export LD_LIBRARY_PATH="$(pwd)/root/data/data/com.termux/files/usr/lib:/data/data/com.coomi.android/files/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export PORT="${PORT:-3000}"
export HOST="${HOST:-0.0.0.0}"

if [ "$1" = "seed" ]; then
  shift
  exec "$BUN_BIN" src/seed.js "$@"
fi

if [ ! -f data/forum.db ]; then
  echo "· 首次运行，正在写入示例经历…"
  "$BUN_BIN" src/seed.js
fi

echo "· 夜谭启动中 → http://localhost:${PORT}"
exec "$BUN_BIN" src/server.js
