# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch --store-dir /pnpm/store
COPY apps/core-service/package.json apps/core-service/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --store-dir /pnpm/store

FROM deps AS development
COPY apps/core-service apps/core-service
ENV NODE_ENV=development
WORKDIR /repo/apps/core-service
EXPOSE 5001
CMD ["pnpm", "exec", "nest", "start", "--watch"]

FROM deps AS build
COPY apps/core-service apps/core-service
RUN pnpm --filter core-service build

FROM build AS prune
RUN pnpm --filter core-service deploy --prod --legacy /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune --chown=node:node /out/node_modules ./node_modules
COPY --from=prune --chown=node:node /out/dist ./dist
COPY --from=prune --chown=node:node /out/package.json ./package.json
USER node
EXPOSE 8080
CMD ["node", "dist/main.js"]
