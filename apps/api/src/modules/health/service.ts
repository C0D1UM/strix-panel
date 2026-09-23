import { sql } from 'drizzle-orm'
import { db } from '../../lib/db'

export async function checkHealth() {
  const database = await db
    .execute(sql`SELECT 1`)
    .then(() => true)
    .catch(() => false)
  return { status: database ? ('ok' as const) : ('degraded' as const), checks: { database } }
}
