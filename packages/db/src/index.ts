import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// The Postgres from compose.dev.yaml, published on DB_PORT. Used when DATABASE_URL is unset outside production.
export function devDatabaseUrl(port: string | number = 5432) {
  return `postgres://strix:strix@localhost:${port}/strix_panel`
}

export type Database = ReturnType<typeof createDb>['db']

export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString })
  const db = drizzle(pool, { schema })
  return { db, pool }
}

export { schema }
