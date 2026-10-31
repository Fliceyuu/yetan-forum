# 夜谭 · 生产镜像
# 零依赖项目：不需要 npm install，直接把源码带进 Bun 官方镜像。
FROM oven/bun:1.1-alpine

WORKDIR /app

# 非 root 用户准备（运行期仍降权到 app）
RUN addgroup -S app && adduser -S app -G app && apk add --no-cache su-exec

COPY package.json ./
COPY src ./src
COPY public ./public
COPY tools ./tools
COPY scripts ./scripts

# 数据目录：数据库 + 上传，靠 volume 持久化
RUN mkdir -p /data/uploads && chown -R app:app /app /data
# 注意：这里不切 USER，入口脚本需要 root 权限修正卷属主后再降权

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DB_PATH=/data/forum.db \
    UPLOAD_DIR=/data/uploads \
    DEMO_MODE=0 \
    TRUST_PROXY=1

EXPOSE 3000

# 容器自探活：编排平台靠它判断何时接流量
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "/app/scripts/entrypoint.sh"]
