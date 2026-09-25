import { Type } from '@sinclair/typebox'
import { devDatabaseUrl } from '@strix-panel/db'
import { DEFAULT_REPORT_DIR, parseEnv, splitList } from '@strix-panel/shared/env'

const schema = Type.Object({
  NODE_ENV: Type.Union(
    [Type.Literal('development'), Type.Literal('test'), Type.Literal('production')],
    {
      default: 'development',
    },
  ),
  API_PORT: Type.Number({ default: 3000 }),
  WEB_PORT: Type.Number({ default: 5173 }),
  // Port of the dev Postgres (compose.dev.yaml); only used to build the development DATABASE_URL.
  DB_PORT: Type.Number({ default: 5432 }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  // Public origin the browser uses (Caddy in prod, Vite in dev). OAuth callbacks are built from it.
  // Required in production; in development it defaults to http://localhost:<WEB_PORT>.
  BETTER_AUTH_URL: Type.String({ default: '' }),
  BETTER_AUTH_SECRET: Type.String({ minLength: 32 }),
  AUTH_GOOGLE_ENABLED: Type.Boolean(),
  GOOGLE_CLIENT_ID: Type.String({ default: '' }),
  GOOGLE_CLIENT_SECRET: Type.String({ default: '' }),
  AUTH_EMAIL_PASSWORD_ENABLED: Type.Boolean(),
  // false blocks every new account (email sign-up and first-time Google sign-in); existing users still sign in.
  AUTH_REGISTRATION_ENABLED: Type.Boolean({ default: true }),
  // false: new users start pending and cannot start scans until an admin approves them. Existing users are unaffected.
  AUTH_AUTO_APPROVE_USERS: Type.Boolean({ default: true }),
  // Comma-separated. Empty means any email may sign in.
  ALLOWED_EMAIL_DOMAINS: Type.String({ default: '' }),
  // PDF reports rendered by the worker. Must be the same directory as the worker's REPORT_DIR.
  REPORT_DIR: Type.String({ default: DEFAULT_REPORT_DIR }),
  // Local-only admin created by `bun run db:seed`.
  SEED_ADMIN_EMAIL: Type.String({ default: 'admin@example.com' }),
  SEED_ADMIN_PASSWORD: Type.String({ minLength: 8, default: 'P@ssw0rd' }),
  SEED_ADMIN_NAME: Type.String({ default: 'Admin' }),
})

// Development runs with no .env: local Postgres on DB_PORT, a throwaway secret, email + password sign-in.
const developmentDefaults = (source: Record<string, string | undefined>) => ({
  DATABASE_URL: devDatabaseUrl(source.DB_PORT || 5432),
  BETTER_AUTH_SECRET: 'dev-only-secret-never-use-in-production',
  AUTH_GOOGLE_ENABLED: 'false',
  AUTH_EMAIL_PASSWORD_ENABLED: 'true',
})

// Production has no defaults for DATABASE_URL, BETTER_AUTH_URL or BETTER_AUTH_SECRET.
const PRODUCTION_DEFAULTS = {
  AUTH_GOOGLE_ENABLED: 'true',
  AUTH_EMAIL_PASSWORD_ENABLED: 'false',
}

export function loadEnv(source: Record<string, string | undefined> = process.env) {
  const production = source.NODE_ENV === 'production'
  const env = parseEnv(
    schema,
    source,
    production ? PRODUCTION_DEFAULTS : developmentDefaults(source),
  )

  const problems: string[] = []
  if (production && !env.BETTER_AUTH_URL) problems.push('BETTER_AUTH_URL is required in production')
  if (env.AUTH_GOOGLE_ENABLED && (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)) {
    problems.push(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required when AUTH_GOOGLE_ENABLED=true',
    )
  }
  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n${problems.map((p) => `  ${p}`).join('\n')}`)
  }

  return {
    ...env,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL || `http://localhost:${env.WEB_PORT}`,
    ALLOWED_EMAIL_DOMAINS: splitList(env.ALLOWED_EMAIL_DOMAINS),
  }
}

export const env = loadEnv()
export type Env = typeof env
