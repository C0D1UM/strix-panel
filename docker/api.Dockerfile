# API image. Also used by the one-off `migrate` service.
FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --ignore-scripts --production --filter '@strix-panel/api'

COPY packages/db packages/db
COPY packages/shared packages/shared
COPY apps/api apps/api

ENV NODE_ENV=production
# Mount point of the `uploads` volume. A new volume copies this folder's owner, so the api (user bun) can write to it.
RUN mkdir -p /app/uploads && chown bun:bun /app/uploads
USER bun
EXPOSE 3000
CMD ["bun", "apps/api/src/index.ts"]
