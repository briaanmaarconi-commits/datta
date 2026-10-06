# Imagen única de Datta: API (Fastify) + frontend (Vite) servido por el mismo proceso.
# 1) frontend
FROM node:20-alpine AS web
WORKDIR /web
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# 2) backend (TypeScript -> JS)
FROM node:20-alpine AS api
WORKDIR /api
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/ .
RUN npm run build

# 3) runtime
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8081 \
    WEB_DIST=/app/web \
    STORAGE_DIR=/data/uploads
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=api /api/dist ./dist
COPY backend/sql ./sql
COPY --from=web /web/dist ./web
RUN mkdir -p /data/uploads
EXPOSE 8081
# Aplica las migraciones pendientes y arranca (las migraciones son idempotentes por nombre).
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]
