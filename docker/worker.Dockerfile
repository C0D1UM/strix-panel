# Worker image: Bun + the Strix CLI (Python, installed with uv). Needs the Docker socket at runtime.
FROM oven/bun:1.3.8-debian
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.12.18 /uv /usr/local/bin/uv
ENV UV_TOOL_DIR=/opt/uv/tools \
    UV_TOOL_BIN_DIR=/usr/local/bin \
    UV_PYTHON_INSTALL_DIR=/opt/uv/python
# Keep in sync with STRIX_VERSION in AGENTS.md when upgrading.
ARG STRIX_VERSION=1.6.2
RUN uv tool install --python 3.12 "strix-agent==${STRIX_VERSION}" && strix --help >/dev/null

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --ignore-scripts --production --filter '@strix-panel/worker'

COPY packages/db packages/db
COPY packages/shared packages/shared
COPY apps/worker apps/worker

ENV NODE_ENV=production
EXPOSE 3001
CMD ["bun", "apps/worker/src/index.ts"]
