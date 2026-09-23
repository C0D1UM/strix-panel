# Strix Panel

A self-hosted web panel for [Strix](https://github.com/usestrix/strix), the open-source AI penetration-testing agent. Strix ships as a CLI; Strix Panel wraps it so a team can launch scans remotely, follow their progress, review findings and track LLM token usage and cost — with Google sign-in, multiple users and projects, per-user usage caps and an admin view across everything.

> **Status:** early scaffold. Sign-in, the dashboard shell and the API/worker plumbing work; projects, scans and quotas are next.

## Quick start (Docker)

Requirements: Docker with Compose.

```sh
cp .env.example .env
# Set BETTER_AUTH_SECRET (openssl rand -base64 32), GOOGLE_CLIENT_ID/SECRET,
# BETTER_AUTH_URL=http://localhost:8080 and ALLOWED_EMAIL_DOMAINS.
docker compose up -d --build
```

Open http://localhost:8080. The first person to sign in becomes the admin.

Google OAuth redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`.

To serve on a real domain with automatic HTTPS, set `SITE_ADDRESS=panel.example.com`, publish ports 80/443 on the `web` service and set `BETTER_AUTH_URL=https://panel.example.com`.

> The `worker` container mounts the Docker socket so Strix can start its sandbox containers. That is root-equivalent access to the host — run the panel on a machine dedicated to scanning.

## Development

Requirements: [Bun](https://bun.sh) 1.3+ and Docker.

```sh
cp .env.example .env         # fill in BETTER_AUTH_SECRET; set AUTH_EMAIL_PASSWORD_ENABLED=true to skip Google locally
bun install
bun run dev:infra            # Postgres in Docker
bun run db:migrate
bun run dev                  # API :3000, web :5173, worker
```

Open http://localhost:5173. API docs: http://localhost:5173/api/docs.

| Command               | What it does                                                 |
| --------------------- | ------------------------------------------------------------ |
| `bun run check`       | Format check, lint, typecheck and tests (what CI runs)       |
| `bun run test`        | Tests only (creates and migrates `strix_panel_test_*`)       |
| `bun run db:generate` | Generate a migration after changing `packages/db/src/schema` |
| `bun run db:migrate`  | Apply app and queue migrations                               |

## Architecture

```
browser ──► Caddy (web) ──► /api/*  ──► api (Elysia) ──► Postgres
                  └──► SPA (Vue)                          ▲
                                     worker (BullMQ) ─────┘──► strix CLI ──► Docker sandboxes
```

See [AGENTS.md](AGENTS.md) for the full map and conventions.

## License

[Apache-2.0](LICENSE)
