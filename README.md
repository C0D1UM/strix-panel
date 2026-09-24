# Strix Panel

A self-hosted web panel for [Strix](https://github.com/usestrix/strix), the open-source AI penetration-testing agent. Strix ships as a CLI; Strix Panel wraps it so a team can launch scans from the browser, follow them live, review findings and track LLM token usage and cost.

## Features

- **Sign-in**: Google OAuth and/or email + password, optionally limited to your email domains. The first user to sign in becomes the admin.
- **Scans**: start a Strix run against 1–3 `http(s)` URLs, with an optional name, extra instructions for the agent and a USD budget cap. Scans are queued and run by a worker, one at a time by default.
- **Live progress**: status, agents, an activity feed, and token and cost usage update in the browser as the scan runs. Stop a queued or running scan at any time.
- **Findings**: vulnerabilities sorted by severity, each with its write-up. Download the full Markdown report.
- **Dashboard**: runs, tokens, cost and findings by severity over a chosen date range, with a trend chart.
- **Admin view**: admins see every user's scans, plus usage across everyone, a per-user breakdown and queue health.
- Light and dark themes, and an OpenAPI description of the API at `/api/docs`.

## Deploy on a Linux server

Requirements: a Linux host (x86-64) with [Docker Engine and the Compose plugin](https://docs.docker.com/engine/install/), and an API key for the LLM Strix should use.

> The `worker` container mounts the Docker socket so Strix can start its sandbox containers. That is root-equivalent access to the host — run the panel on a machine dedicated to scanning.

**1. Get the code** (for `compose.yaml` and `.env.example`):

```sh
git clone https://github.com/C0D1UM/strix-panel.git
cd strix-panel
cp .env.example .env
```

**2. Edit `.env`.** Uncomment and set:

```sh
BETTER_AUTH_SECRET=...         # openssl rand -base64 32
STRIX_LLM=anthropic/claude-sonnet-5         # see https://docs.strix.ai/llm-providers/overview
LLM_API_KEY=...
# Optional: the URL people open the panel at. Default: http://localhost:8080
# BETTER_AUTH_URL=https://panel.example.com
```

Everything else in `.env.example` is optional.

**3. Start it:**

```sh
docker compose pull
docker compose up -d
```

The panel serves on port 8080: open http://localhost:8080 (or `http://<server>:8080`) and create an account. The first account becomes the admin. Change the port with `PANEL_PORT` in `.env`. The first scan takes longer while Docker pulls the Strix sandbox image.

**Upgrade:**

```sh
git pull
docker compose pull && docker compose up -d
```

Migrations run automatically on start. A scan that is running while the worker restarts is marked `failed`, so upgrade when no scans are running.

## Development

Requirements: [Bun](https://bun.sh) 1.3+ and Docker. Running real scans also needs the [Strix CLI](https://github.com/usestrix/strix) on your `PATH` and `STRIX_LLM`/`LLM_API_KEY` set.

```sh
bun install                  # no .env needed: dev defaults use password login, Google off
bun run dev:infra            # Postgres in Docker
bun run db:migrate
bun run db:seed              # admin@example.com / P@ssw0rd, plus one sample completed scan
bun run dev                  # API :3000, web :5173, worker
```

Open http://localhost:5173. API docs: http://localhost:5173/api/docs.

To change anything (ports, database, Google sign-in), copy `.env.example` to `.env` and uncomment what you need. `DATABASE_URL` follows `DB_PORT` and `BETTER_AUTH_URL` follows `WEB_PORT`, so running several worktrees side by side only needs distinct ports (`DB_PORT`, `API_PORT`, `WEB_PORT`, `WORKER_HEALTH_PORT`).

| Command               | What it does                                                     |
| --------------------- | ---------------------------------------------------------------- |
| `bun run check`       | Format check, lint, typecheck and tests (what CI runs)           |
| `bun run test`        | Tests only (creates and migrates `strix_panel_test_*`)           |
| `bun run db:generate` | Generate a migration after changing `packages/db/src/schema`     |
| `bun run db:migrate`  | Apply app and queue migrations                                   |
| `bun run db:seed`     | Create the local admin and a sample scan (refuses in production) |

## Releasing

Push a semver tag from `main`:

```sh
git tag v0.1.0 && git push origin v0.1.0
```

The [Release workflow](.github/workflows/release.yml) runs the CI checks, pushes `ghcr.io/c0d1um/strix-panel-{api,web,worker}` tagged `0.1.0`, `0.1` and `latest`, and creates a GitHub Release whose notes list the commits since the previous tag followed by GitHub's generated notes. A tag with a suffix (`v0.2.0-rc.1`) is published as a prerelease: only the full version tag, no `latest`.

## Architecture

```
browser ──► Caddy (web) ──► /api/*  ──► api (Elysia) ──► Postgres
                  └──► SPA (Vue)                          ▲
                                     worker (BullMQ) ─────┘──► strix CLI ──► Docker sandboxes
```

See [AGENTS.md](AGENTS.md) for the full map and conventions.

## License

[Apache-2.0](LICENSE)
