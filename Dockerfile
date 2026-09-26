# ─── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 (native module)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . .

# Build TypeScript → dist/
RUN npm run build

# Generate Drizzle migrations
RUN npm run db:generate || true

# ─── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install sqlite CLI (useful for debugging)
RUN apk add --no-cache sqlite

# Copy production artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/seed.json ./seed.json

# Create the data directory (will be overridden by Docker volume)
RUN mkdir -p /app/data

# Persistent volume for SQLite database
VOLUME /app/data

# Expose API port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "dist/index.js"]
