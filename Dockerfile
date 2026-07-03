# eo-bridge — 정적 브릿지 서버 (Dokploy 등 컨테이너 배포용)
FROM oven/bun:1-slim

WORKDIR /app
COPY . .

ENV PORT=9030
EXPOSE 9030

# EO_ALLOWED_PARENT_ORIGINS / EO_DS_URL 은 배포 환경에서 주입 (serve.mjs 참고)
CMD ["bun", "serve.mjs"]
