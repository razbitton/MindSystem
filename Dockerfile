FROM node:22-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @personal-context-os/config build \
  && pnpm --filter @personal-context-os/shared build \
  && pnpm --filter @personal-context-os/db build \
  && pnpm --filter @personal-context-os/ai build

EXPOSE 3000 4000 4100
