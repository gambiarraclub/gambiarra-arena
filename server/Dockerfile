FROM node:20-alpine AS builder

WORKDIR /monorepo

# Install pnpm (specific version to match lockfile)
RUN npm install -g pnpm@8.11.0

# Copy monorepo workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy server package.json
COPY server/package.json ./server/

# Install dependencies for entire monorepo
RUN pnpm install --frozen-lockfile --filter @gambiarra/server...

# Copy server source
COPY server ./server

# Generate Prisma client
WORKDIR /monorepo/server
RUN pnpm db:generate

# Build
RUN pnpm build

# Production image
FROM node:20-alpine

WORKDIR /monorepo

# Install pnpm (specific version to match lockfile), wget for healthcheck, and OpenSSL for Prisma
RUN npm install -g pnpm@8.11.0 && \
    apk add --no-cache wget openssl-dev openssl

# Copy monorepo workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY server/package.json ./server/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --filter @gambiarra/server...

# Copy built files, Prisma schema, and generated Prisma Client from builder
COPY --from=builder /monorepo/server/dist ./server/dist
COPY --from=builder /monorepo/server/prisma ./server/prisma
COPY --from=builder /monorepo/server/src ./server/src
COPY --from=builder /monorepo/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma ./node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma

# Create data directory
RUN mkdir -p /monorepo/server/data

# Set working directory to server
WORKDIR /monorepo/server

# Expose port
EXPOSE 3000

# Run migrations and start
CMD ["sh", "-c", "pnpx prisma migrate deploy && pnpm seed && pnpm dev && node dist/index.js"]
