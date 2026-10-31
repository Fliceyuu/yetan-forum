#!/data/data/com.coomi.android/files/usr/bin/bash
# 开发辅助：停掉正在跑的 夜谭 服务（不杀自己）
SELF=$$
for p in $(ls /proc | grep -E '^[0-9]+$'); do
  [ "$p" = "$SELF" ] && continue
  cmd=$(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null)
  case "$cmd" in
    *"src/server.js"*) kill "$p" 2>/dev/null && echo "已停止 $p" ;;
  esac
done
