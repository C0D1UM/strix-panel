import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { migrateQueue } from './queue'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url))

// Applies app (Drizzle) migrations and queue (BullMQ) migrations.
export async function migrateAll(connectionString: string) {
  const pool = new Pool({ connectionString })
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER })
    const client = await pool.connect()
    try {
      await migrateQueue(client)
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}
