# syntax=docker/dockerfile:1
ARG NODE_VERSION=22

# ── Stage 1: build ──
FROM node:${NODE_VERSION}-slim AS builder

RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY src/ src/
COPY tsconfig.json ./
RUN pnpm run build

# Remove dev dependencies
RUN pnpm prune --prod

# ── Stage 2: runtime ──
FROM node:${NODE_VERSION}-slim AS runtime

RUN apt-get update -qq && apt-get install --no-install-recommends -y \
    ca-certificates \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Create unprivileged user
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser \
    && chown -R appuser:appuser /app

USER appuser

# Pre-download agent files
RUN node dist/agent.js download-files

ENV NODE_ENV=production

CMD ["node", "dist/agent.js", "start"]
