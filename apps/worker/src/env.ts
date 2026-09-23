import { Type } from '@sinclair/typebox'
import { devDatabaseUrl } from '@strix-panel/db'
import { parseEnv } from '@strix-panel/shared/env'

const schema = Type.Object({
  NODE_ENV: Type.String({ default: 'development' }),
  // Port of the dev Postgres (compose.dev.yaml); only used to build the development DATABASE_URL.
  DB_PORT: Type.Number({ default: 5432 }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  WORKER_CONCURRENCY: Type.Integer({ minimum: 1, default: 1 }),
  WORKER_HEALTH_PORT: Type.Number({ default: 3001 }),
  // Passed through to the Strix CLI once scans are wired up.
  STRIX_LLM: Type.String({ default: '' }),
  LLM_API_KEY: Type.String({ default: '' }),
})

// Runs with no .env in development; production must set DATABASE_URL.
export function loadEnv(source: Record<string, string | undefined> = process.env) {
  const production = source.NODE_ENV === 'production'
  const defaults: Record<string, string> = production
    ? {}
    : { DATABASE_URL: devDatabaseUrl(source.DB_PORT || 5432) }
  return parseEnv(schema, source, defaults)
}

export const env = loadEnv()
