FROM node:22-alpine AS dependencies

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./

RUN npm ci \
    --omit=dev \
    --ignore-scripts \
    --no-audit \
    --no-fund

FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

RUN addgroup -S banking && \
    adduser -S banking -G banking

COPY --from=dependencies /app/node_modules ./node_modules
COPY backend/package.json backend/package-lock.json ./
COPY backend/src ./src
COPY openapi ./openapi

USER banking

EXPOSE 8080

HEALTHCHECK \
  --interval=15s \
  --timeout=3s \
  --start-period=10s \
  --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1

CMD ["node", "src/server.js"]
