import { Type } from '@sinclair/typebox'
import { devDatabaseUrl } from '@strix-panel/db'
import { DEFAULT_REPORT_DIR, parseEnv } from '@strix-panel/shared/env'

const schema = Type.Object({
  NODE_ENV: Type.String({ default: 'development' }),
  // Port of the dev Postgres (compose.dev.yaml); only used to build the development DATABASE_URL.
  DB_PORT: Type.Number({ default: 5432 }),
  DATABASE_URL: Type.String({ minLength: 1 }),
  WORKER_CONCURRENCY: Type.Integer({ minimum: 1, default: 1 }),
  WORKER_HEALTH_PORT: Type.Number({ default: 3001 }),
  // Passed through to the Strix CLI with the rest of the environment.
  STRIX_LLM: Type.String({ default: '' }),
  LLM_API_KEY: Type.String({ default: '' }),
  // Strix executable. Development uses the one on PATH; the worker image installs it with uv.
  STRIX_BIN: Type.String({ default: 'strix' }),
  // Each scan runs in its own directory below this one, so its strix_runs/ holds exactly one run.
  STRIX_WORK_DIR: Type.String({ default: 'strix_runs' }),
  STRIX_POLL_INTERVAL_MS: Type.Integer({ minimum: 100, default: 2000 }),
  // Python interpreter of the Strix install, used to render PDF reports with Strix's own renderer. Empty turns PDF
  // reports off (a binary install of Strix has no Python to call). The worker image sets it.
  STRIX_PYTHON: Type.String({ default: '' }),
  // Rendered PDFs, read back by the API. Must be the same directory as the API's REPORT_DIR.
  REPORT_DIR: Type.String({ default: DEFAULT_REPORT_DIR }),
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
