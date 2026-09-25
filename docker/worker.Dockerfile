# Worker image: Bun + the Strix CLI (Python, installed with uv). Needs the Docker socket at runtime.
FROM oven/bun:1-debian
WORKDIR /app

# Strix refuses to start without a `docker` binary on PATH (it then drives the sandbox through the mounted socket).
# Only the client: the daemon is the host's.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && docker --version

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
ENV UV_TOOL_DIR=/opt/uv/tools \
    UV_TOOL_BIN_DIR=/usr/local/bin \
    UV_PYTHON_INSTALL_DIR=/opt/uv/python
# Empty = latest 1.x. Pin one with --build-arg STRIX_VERSION=1.6.2.
ARG STRIX_VERSION=
RUN if [ -n "$STRIX_VERSION" ]; then spec="==$STRIX_VERSION"; else spec=">=1,<2"; fi \
    && uv tool install --python 3.12 "strix-agent$spec" \
    && strix --version

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
