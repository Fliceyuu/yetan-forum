#!/usr/bin/env bash
# 夜谭 · 运维助手
#
#   bash deploy/ops.sh status      查看状态
#   bash deploy/ops.sh backup      备份数据库与上传（保留最近 7 份）
#   bash deploy/ops.sh restore <备份文件>
#   bash deploy/ops.sh logs        跟踪日志
#   bash deploy/ops.sh update      拉取新代码并重建
#   bash deploy/ops.sh admin       把某个用户设为管理员
#   bash deploy/ops.sh passwd      重置某个用户的密码
#   bash deploy/ops.sh stats       数据概览
#
# 在项目根目录运行（有 docker-compose.yml 的那一层）。
set -euo pipefail
cd "$(dirname "$0")/.." || exit 1

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }

VOL=$(docker compose config --format json 2>/dev/null | grep -o '"name":"[^"]*yetan-data"' | head -1 | cut -d'"' -f4 || true)
[ -z "$VOL" ] && VOL="$(basename "$PWD")_yetan-data"

case "${1:-help}" in
  status)
    docker compose ps
    echo
    for u in /healthz; do
      D=$(grep -oP '(?<=^DOMAIN=).*' .env 2>/dev/null || true)
      [ -n "$D" ] && curl -s -o /dev/null -w "https://$D$u → %{http_code}\n" --max-time 8 "https://$D$u" || echo "  （未配置域名）"
    done
    ;;

  backup)
    mkdir -p backups
    NAME="backup-$(date +%F-%H%M%S).tar.gz"
    # 用 tar 打整个数据卷：数据库与上传一起，保证一致
    docker run --rm -v "$VOL":/data -v "$PWD/backups":/backup alpine \
      tar czf "/backup/$NAME" -C /data .
    green "✔ 已备份到 backups/$NAME（$(du -h "backups/$NAME" | cut -f1)）"
    # 只保留最近 7 份
    ls -1t backups/backup-*.tar.gz 2>/dev/null | tail -n +8 | while read -r f; do
      rm -f "$f"; echo "  清理旧备份: $(basename "$f")"
    done
    ;;

  restore)
    [ -z "${2:-}" ] && { red "用法: bash deploy/ops.sh restore backups/backup-xxx.tar.gz"; exit 1; }
    [ -f "$2" ] || { red "找不到文件: $2"; exit 1; }
    echo "⚠ 这会覆盖当前所有数据。5 秒后开始，Ctrl+C 取消…"
    sleep 5
    docker compose stop app
    docker run --rm -v "$VOL":/data -v "$PWD/backups":/backup alpine \
      sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$2") -C /data"
    docker compose start app
    green "✔ 已恢复"
    ;;

  logs)
    docker compose logs -f --tail=100 app caddy
    ;;

  update)
    git pull --ff-only
    docker compose up -d --build
    green "✔ 已更新"
    ;;

  admin)
    [ -z "${2:-}" ] && { red "用法: bash deploy/ops.sh admin 用户名"; exit 1; }
    docker compose exec -T app bun -e "
      import { Database } from 'bun:sqlite';
      const db = new Database(process.env.DB_PATH);
      const r = db.query('UPDATE users SET is_admin = 1 WHERE username = ?').run('${2}');
      console.log(r.changes ? '✔ ${2} 已设为管理员' : '✘ 找不到用户 ${2}');
    "
    ;;

  passwd)
    [ -z "${2:-}" ] && { red "用法: bash deploy/ops.sh passwd 用户名"; exit 1; }
    docker compose exec -T app bun -e "
      import { Database } from 'bun:sqlite';
      const [u, p] = ['${2}', '${3:-}'];
      if (!p || p.length < 8) { console.log('✘ 请在用户名后再给一个新密码（至少 8 位）'); process.exit(1); }
      const db = new Database(process.env.DB_PATH);
      const hash = await Bun.password.hash(p, { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 });
      const r = db.query('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, u);
      db.query('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)').run(u);
      console.log(r.changes ? '✔ 密码已重置，该用户旧登录已全部失效' : '✘ 找不到用户 ' + u);
    "
    ;;

  stats)
    docker compose exec -T app bun -e "
      import { Database } from 'bun:sqlite';
      const db = new Database(process.env.DB_PATH);
      const one = (s) => db.query(s).get();
      console.log('用户      ', one('SELECT COUNT(*) c FROM users').c);
      console.log('帖子      ', one('SELECT COUNT(*) c FROM posts').c);
      console.log('  待审核  ', one(\"SELECT COUNT(*) c FROM posts WHERE status='pending'\").c);
      console.log('  已下架  ', one(\"SELECT COUNT(*) c FROM posts WHERE status='removed'\").c);
      console.log('评论      ', one('SELECT COUNT(*) c FROM comments').c);
      console.log('未处理举报', one(\"SELECT COUNT(*) c FROM reports WHERE status='open'\").c);
      console.log('提示      ', one('SELECT COUNT(*) c FROM notifications WHERE read_at IS NULL').c);
    "
    ;;

  *)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac
