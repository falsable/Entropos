# Stage 1: Build client SPA and compile dependencies
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy project files and build Vite client bundle
COPY . .
RUN npm run build

# Stage 2: Minimal reproducible runtime image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    TRUST_PROXY=true

# Install runtime dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built frontend bundle from builder
COPY --from=builder /app/dist ./dist

# Copy backend server code and configs
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src

# Create data directory for SQLite WAL storage and set ownership for non-root node user
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["npx", "tsx", "server.ts"]
