FROM node:20-alpine AS builder

WORKDIR /monorepo

# Install pnpm (specific version to match lockfile)
RUN npm install -g pnpm@9.12.0

# Copy monorepo workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy telao package.json
COPY telao/package.json ./telao/

# Install dependencies for entire monorepo
RUN pnpm install --frozen-lockfile --filter @gambiarra/telao...

# Copy telao source
COPY telao ./telao

# Build with environment variables
WORKDIR /monorepo/telao
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
RUN pnpm build

# Production image with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /monorepo/telao/dist /usr/share/nginx/html

# Copy nginx config
COPY telao/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
