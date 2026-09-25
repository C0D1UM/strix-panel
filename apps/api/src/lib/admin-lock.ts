import { sql } from 'drizzle-orm'
import type { db } from './db'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Arbitrary constant key. Serializes first-admin promotion and every change that could leave no active admin.
const ADMIN_LOCK_KEY = 7_140_001

export async function lockAdmins(tx: Tx) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADMIN_LOCK_KEY})`)
}
