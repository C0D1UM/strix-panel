# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo. Keep it current: when a convention changes, update this file in the same change.

## What this is

Strix Panel is a self-hosted web panel that wraps the [Strix](https://github.com/usestrix/strix) CLI (an AI pentest agent, Python). Strix has no server of its own: a scan is `strix -n -t <target>`, it starts Docker sandbox containers, and it writes everything to `strix_runs/<run_name>/` on disk (`run.json` with status and `llm_usage` token/cost totals, `vulnerabilities.json`, `penetration_test_report.md`, `findings.sarif`, `.state/agents.json`). The panel launches those runs remotely, tracks them, and adds users, projects, usage caps and an admin view.

Strix facts that shape the design:

- Needs Docker: whatever runs `strix` needs the Docker socket.
- The LLM is configured by env: `STRIX_LLM` (required), `LLM_API_KEY`. Budget cap: `--max-budget-usd`.
- No flag to choose the run name; no event-log file. Live progress comes from polling the run directory.
- Pinned version: `strix-agent==1.6.2` (`docker/worker.Dockerfile`, `STRIX_VERSION`). Upgrade deliberately — the output file formats are not a public API.

## Architecture

Bun workspaces monorepo. Bun is the runtime, package manager and test runner (web tests use Vitest).

| Path              | Owns                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`        | Elysia HTTP API under `/api`. Auth, business logic, enqueueing jobs. Swagger at `/api/docs`.                                    |
| `apps/web`        | Vue 3 + Vite SPA. Talks to the API only through Eden Treaty (`src/lib/api.ts`) and the Better Auth client.                      |
| `apps/worker`     | BullMQ consumer. The only process that runs `strix` and touches Docker.                                                         |
| `packages/db`     | Drizzle schema, migrations, DB client, the queue module (`@strix-panel/db/queue`) and LISTEN/NOTIFY (`@strix-panel/db/notify`). |
| `packages/shared` | Framework-free code used by several apps: roles, themes, env parsing, small pure helpers.                                       |
| `docker/`         | Dockerfiles and the Caddyfile.                                                                                                  |

Request flow: browser → Caddy (`web` container) → `/api/*` reverse-proxied to `api`, everything else served from the SPA build. Same origin everywhere (Vite proxies `/api` in dev), so auth is a plain httpOnly session cookie — no CORS, no tokens in JS.

Job flow: `api` inserts a `scan` row and enqueues `{ scanId }` on the `scans` queue → `worker` runs `strix -n` in `<STRIX_WORK_DIR>/<scanId>/` → every `STRIX_POLL_INTERVAL_MS` it reads `run.json`, `.state/agents.json` and `vulnerabilities.json` and writes usage, agents, findings and feed events to Postgres, then `pg_notify('scan_updates', scanId)` → `api` holds one `LISTEN` connection and pushes changes to browsers over SSE (`GET /api/v1/scans/:id/stream`). There is no Redis: BullMQ uses its Postgres backend (schema `bullmq`).

Scan lifecycle: `queued` → `running` → `completed` | `failed` | `stopped`, with `stopping` after a stop request (the worker sees it on its next poll and sends SIGINT, then SIGTERM after 30 s and SIGKILL after 60 s). A worker restart mid-scan marks the scan `failed` (no resume). Status values live in `packages/shared`.

## Commands

```sh
bun install
bun run dev:infra      # Postgres (compose.dev.yaml) on DB_PORT (default 5432)
bun run db:migrate     # app (Drizzle) + queue (BullMQ) migrations
bun run db:seed        # local admin from SEED_ADMIN_* (email + password) plus one sample completed scan; refuses in production
bun run dev            # api :3000, web :5173, worker (health :3001)
bun run check          # format:check + lint + typecheck + test — run before calling work done
bun run db:generate    # after editing packages/db/src/schema/*
docker compose up -d --build   # prod-like stack on :8080
```

Worktrees: each worktree gets its own dev Postgres (the Compose project is named after the folder). Give each a distinct `DB_PORT`, `API_PORT`, `WEB_PORT` and `WORKER_HEALTH_PORT` (via env or `.env`); `DATABASE_URL` and `BETTER_AUTH_URL` follow them automatically.

Tests need Postgres. They always use separate databases (`strix_panel_test_<package>`, created and migrated automatically by each test preload); they follow `DB_PORT`, or set `TEST_DATABASE_URL` to a base URL (the package suffix is appended).

## Conventions

### API (`apps/api`)

- Routes live under `/api/v1/*`. Exceptions: `/api/health`, `/api/docs`, and `/api/auth/*` (owned by Better Auth — do not add routes there).
- One folder per feature in `src/modules/<feature>/`:
  - `index.ts`: a named Elysia plugin with the routes only.
  - `service.ts`: business logic. No HTTP types, easy to test.
  - `schema.ts`: TypeBox models (`t.*`).
- Register each module in `src/app.ts`.
- Every route declares `response` (and `body`/`query`/`params` when present) schemas and `detail: { tags, summary }`. Swagger is generated from them, so a route without schemas is undocumented.
- Errors: throw `AppError` subclasses from `src/lib/errors.ts`. Every error response is `{ error: { code, message } }` with an UPPER_SNAKE `code`. Never return ad-hoc error objects.
- Auth: use the macros from `src/plugins/auth.ts` — `{ requireAuth: true }` or `{ requireRole: 'admin' }` — which put `user` and `session` on the context. Never read cookies or call `auth.api.getSession` in a route yourself.
- Env: add variables to the TypeBox schema in `src/lib/env.ts` (and, commented out, to `.env.example`). Never read `process.env` elsewhere. Development must keep working with no `.env`: give every new variable a default, or a development default in `DEVELOPMENT_DEFAULTS` when production must set it explicitly.

### Database (`packages/db`)

- Schema in `src/schema/*.ts`. Primary keys use `id()` (UUIDv7 from Postgres 18's `uuidv7()`); timestamps use `createdAt()`/`updatedAt()` (`timestamptz`). Column names are snake_case.
- Change the schema, then `bun run db:generate`. Commit the generated SQL. Never edit a migration that has been applied anywhere — add a new one.
- `src/schema/auth.ts` must match what Better Auth (core + admin plugin) expects. Check the Better Auth docs before changing it.
- Only `src/queue.ts` imports `bullmq`. Pin BullMQ exactly: its Postgres backend is new (added in 6.3).
- Live updates: writers call `notifyScanUpdate` after committing; the NOTIFY payload is only the scan id, listeners re-read the rows (`src/notify.ts`).

### Auth

- Better Auth, configured in `apps/api/src/lib/auth.ts`. Defaults: in development, email+password on and Google off; in production, Google on and email+password off. `BETTER_AUTH_URL` defaults to `http://localhost:<WEB_PORT>` in development and is required in production.
- `ALLOWED_EMAIL_DOMAINS` is enforced at sign-up and on every new session.
- The first user becomes admin (`promoteIfFirstAdmin`, serialized by an advisory lock).
- Roles: `admin`, `user` (`packages/shared`).

### Web (`apps/web`)

- Vue 3 `<script setup lang="ts">`, Composition API. No state library and no data-fetching library yet: plain `api.*` calls inside components or composables. TanStack Query is the planned choice once pages need caching or polling.
- Colors: only the semantic tokens in `src/styles/main.css` (`bg-surface`, `bg-surface-raised`, `bg-surface-sunken`, `text-fg`, `text-fg-muted`, `border-line`, `bg-accent`, `text-danger`, …). Never raw Tailwind palette colors or hex values in components, and no `dark:` variants: light and dark are handled by the tokens. Need a new color? Add a token for both themes.
- App shell: signed-in pages are children of the `/` route in `src/router.ts`, rendered inside `src/layouts/AppLayout.vue` (sidebar on desktop, collapsible to icons and remembered; drawer on mobile). To add a page, add a child route and an entry in `items` in `src/components/AppSidebar.vue` (`adminOnly: true` hides it from regular users). The sidebar lists only pages that exist, with no placeholders.
- The signed-in user's profile is `currentUser` from `src/lib/current-user.ts`. It is loaded once by the layout, so pages don't refetch `/me`.
- Theme: light/dark/auto via `useTheme()`. The inline script in `index.html` must stay in sync with it.
- Live data over SSE (`useScanStream`) is the one exception to "API only through Eden": Eden has no SSE client, so it uses a native `EventSource`. Everything else goes through `api.*`.
- Text written by the LLM (finding write-ups) is untrusted. Render it only through `renderMarkdown` in `src/lib/markdown.ts` (raw HTML off); it is the only source of `v-html` input.
- Icons: Iconify via Tailwind classes, Lucide set: `<span class="icon-[lucide--play] size-4" aria-hidden="true" />`. No icon component libraries.
- UI primitives live in `src/components/ui/` (`AppButton`, …). No UI kit. Add Reka UI only when a component needs accessible interaction (menus, dialogs, comboboxes).
- Copy: sentence case, plain verbs, and buttons say what they do.

### General

- TypeScript strict everywhere. `import type` for type-only imports (lint enforces this). Top-level imports only.
- Pin dependency versions exactly (no `^`).
- Prettier formats, ESLint lints. Don't fight either; run `bun run lint:fix` and `bun run format`.

## Guardrails

- Only `worker` gets the Docker socket and the Strix toolchain. Never mount `/var/run/docker.sock` into `api` or `web`.
- Never log or return secrets: LLM keys, `BETTER_AUTH_SECRET`, OAuth secrets, session tokens.
- Scan targets and instructions are user input that ends up on a command line. Pass them as an argv array (`Bun.spawn([...])`), never through a shell string. Targets are limited to 1–3 `http(s)` URLs: never accept local paths (they would be mounted into the sandbox).
- Strix runs with the worker's environment minus `DATABASE_URL`, so the agent cannot see DB credentials.
- Don't hand-edit the generated files: `packages/db/migrations/*`, `bun.lock`.

## Git

Commit messages are one short imperative sentence, capitalized, with no prefix or body. For example: `Add scan queue module`.

## Glossary

- **Run / scan**: one execution of the Strix CLI against one or more targets. Maps to one `strix_runs/<run_name>/` directory.
- **Target**: what Strix tests: a URL, repo, local path, domain or IP.
- **Project**: a group of targets and runs with its own members (planned).
- **Finding**: one vulnerability Strix reported (`vulnerabilities.json`), stored per scan in `scan_finding`.
- **Usage cap**: a per-user LLM spend limit, enforced by the panel from `run.json` `llm_usage.cost` and Strix's `--max-budget-usd` (planned).
- **Admin**: a user with role `admin`. Sees and manages all projects and users.
