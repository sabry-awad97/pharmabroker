# ═══════════════════════════════════════════════════════════════════════════════
#  📦 PharmaBroker API Server
# ═══════════════════════════════════════════════════════════════════════════════
#  Multi-stage build for Bun/Hono API server
#  Run from monorepo root: docker build -f apps/server/Dockerfile .
# ═══════════════════════════════════════════════════════════════════════════════

FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# ─────────────────────────────────────────────────────────────────────────────
#  Builder Stage - Install deps, copy source, generate Prisma
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS builder

# Copy all package.json files first
COPY package.json bun.lock tsconfig.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/env/package.json ./packages/env/

# Copy all source files
COPY apps/server ./apps/server
COPY packages ./packages

# Install dependencies (this creates proper symlinks for workspace packages)
RUN bun install

# Generate Prisma client
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN cd packages/db && rm -f prisma.config.ts && bunx prisma generate --schema=prisma/schema

# ─────────────────────────────────────────────────────────────────────────────
#  Runtime Stage - Run the server directly with Bun
# ─────────────────────────────────────────────────────────────────────────────
FROM base AS runner

# Copy the entire workspace structure including node_modules with symlinks
COPY --from=builder /app ./

# Create non-root user for security
RUN adduser -D -g '' appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

# Run the server
CMD ["bun", "run", "apps/server/src/index.ts"]
