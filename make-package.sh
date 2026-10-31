#!/data/data/com.coomi.android/files/usr/bin/bash
# 打包：用 Bun 写 tar（保留文件权限），排除数据库/日志/本机 Bun 运行时
set -e
cd "$(dirname "$0")"
BUN="./root/data/data/com.termux/files/usr/lib/../bin/bun"
export LD_LIBRARY_PATH="$(pwd)/root/data/data/com.termux/files/usr/lib:/data/data/com.coomi.android/files/usr/lib"
"$BUN" ./tools/pack.js
echo "输出：$(cd .. && pwd)/yetan-forum-src.tar.gz"
