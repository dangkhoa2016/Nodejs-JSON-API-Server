# =========================
# Builder
# =========================
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

# =========================
# Runtime
# =========================
FROM node:22-alpine

LABEL org.opencontainers.image.title="Nodejs JSON API Server"
LABEL org.opencontainers.image.description="Nodejs JSON API with SQLite, Redis caching, rate limiting, and admin endpoints"
LABEL org.opencontainers.image.source="https://github.com/anomalyco/Nodejs-JSON-API-Server"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy dependencies
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY --chown=app:app . .

# Prepare runtime directories
RUN mkdir -p /app/storage \
    && chmod +x /app/docker-entrypoint.sh \
    && chown -R app:app /app/storage

USER app

ENV NODE_ENV=production \
    DB_PATH=/app/storage/data.db

EXPOSE 3000

VOLUME ["/app/storage"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]

CMD ["node", "bin/start.js"]
