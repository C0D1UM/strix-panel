// Panel settings (Admin → Settings). Read by the API (sign-up, gates, public config) and the worker (budget
// minimum at scan start). Read on every call: with no cache there is nothing to invalidate across processes.
import {
  flattenPatch,
  mergeSettings,
  type Settings,
  type SettingsPatch,
} from '@strix-panel/shared/settings'
import { sql } from 'drizzle-orm'
import type { Database } from './index'
import { setting } from './schema'

export async function getSettings(db: Database): Promise<Settings> {
  const rows = await db.select({ key: setting.key, value: setting.value }).from(setting)
  return mergeSettings(rows)
}

// Upserts only the fields in `patch`. `userId` is null only for writes made by the server itself (tests).
export async function updateSettings(
  db: Database,
  patch: SettingsPatch,
  userId: string | null,
): Promise<Settings> {
  const rows = flattenPatch(patch).map((row) => ({ ...row, updatedBy: userId }))
  if (rows.length > 0) {
    await db
      .insert(setting)
      .values(rows)
      .onConflictDoUpdate({
        target: setting.key,
        set: {
          value: sql`excluded.value`,
          updatedBy: sql`excluded.updated_by`,
          updatedAt: sql`now()`,
        },
      })
  }
  return getSettings(db)
}
