import { Type } from '@sinclair/typebox'
import { parseEnv, splitList } from '@strix-panel/shared/env'

const schema = Type.Object({
  NODE_ENV: Type.Union(
    [Type.Literal('development'), Type.Literal('test'), Type.Literal('production')],
    {
      default: 'development',
    },
  ),
  API_PORT: Type.Number({ default: 3000 }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  // Public origin the browser uses (Caddy in prod, Vite in dev). OAuth callbacks are built from it.
  BETTER_AUTH_URL: Type.String({ minLength: 1, default: 'http://localhost:5173' }),
  BETTER_AUTH_SECRET: Type.String({ minLength: 32 }),
  AUTH_GOOGLE_ENABLED: Type.Boolean({ default: true }),
  GOOGLE_CLIENT_ID: Type.String({ default: '' }),
  GOOGLE_CLIENT_SECRET: Type.String({ default: '' }),
  AUTH_EMAIL_PASSWORD_ENABLED: Type.Boolean({ default: false }),
  // Comma-separated. Empty means any email may sign in.
  ALLOWED_EMAIL_DOMAINS: Type.String({ default: '' }),
  // Local-only admin created by `bun run db:seed`.
  SEED_ADMIN_EMAIL: Type.String({ default: 'admin@example.com' }),
  SEED_ADMIN_PASSWORD: Type.String({ minLength: 8, default: 'P@ssw0rd' }),
  SEED_ADMIN_NAME: Type.String({ default: 'Admin' }),
})

function loadEnv() {
  const env = parseEnv(schema)
  if (env.AUTH_GOOGLE_ENABLED && (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)) {
    throw new Error(
      'Invalid environment:\n  GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required when AUTH_GOOGLE_ENABLED=true',
    )
  }
  return { ...env, ALLOWED_EMAIL_DOMAINS: splitList(env.ALLOWED_EMAIL_DOMAINS) }
}

export const env = loadEnv()
export type Env = typeof env
