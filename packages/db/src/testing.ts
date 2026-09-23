import { Client } from 'pg'
import { migrateAll } from './migrate-all'

export const DEFAULT_TEST_DATABASE_URL = 'postgres://strix:strix@localhost:5432/strix_panel_test'

// Each package gets its own database (e.g. strix_panel_test_api) because package test suites run in parallel.
export function testDatabaseUrl(suite: string) {
  const url = new URL(process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL)
  url.pathname = `${url.pathname}_${suite}`
  return url.toString()
}

// Creates the test database if missing, then migrates it. Safe to call from every test preload.
export async function prepareTestDatabase(url: string) {
  const target = new URL(url)
  const name = target.pathname.slice(1)
  const admin = new URL(url)
  admin.pathname = '/postgres'

  const client = new Client({ connectionString: admin.toString() })
  await client.connect()
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (!rowCount) await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`)
  } finally {
    await client.end()
  }

  await migrateAll(url)
}
