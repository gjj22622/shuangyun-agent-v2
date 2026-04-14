# syntax=docker/dockerfile:1.6
# 双云 Agent Platform — Node 24 monorepo
FROM node:24-alpine AS base
WORKDIR /app

# 安裝 build 所需工具（SQLite native binding 可能用到）
RUN apk add --no-cache python3 make g++ sqlite

# ===== Dependencies layer =====
FROM base AS deps
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY tools ./tools
RUN npm install

# ===== Build layer =====
FROM deps AS build
RUN npm run build

# ===== Runtime layer =====
FROM base AS runtime
ENV NODE_ENV=production \
    APP_HOST=0.0.0.0 \
    APP_PORT=8000

COPY --from=build /app /app

# 資料目錄（SQLite + traces），由 volume 掛載覆蓋
RUN mkdir -p /app/data/traces

EXPOSE 8000

CMD ["npm", "run", "serve"]
