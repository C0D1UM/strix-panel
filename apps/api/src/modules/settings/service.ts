import { schema } from '@strix-panel/db'
import {
  flattenPatch,
  mergeSettings,
  type Settings,
  type SettingsPatch,
} from '@strix-panel/shared/settings'
import { sql } from 'drizzle-orm'
import { db } from '../../lib/db'

// Read on every call: only sign-up, the public config and the admin page need it, and with no cache there is
// nothing to invalidate across API replicas.
export async function getSettings(): Promise<Settings> {
  const rows = await db
    .select({ key: schema.setting.key, value: schema.setting.value })
    .from(schema.setting)
  return mergeSettings(rows)
}

// `userId` is null only for writes made by the server itself (tests).
export async function updateSettings(
  patch: SettingsPatch,
  userId: string | null,
): Promise<Settings> {
  const rows = flattenPatch(patch).map((row) => ({ ...row, updatedBy: userId }))
  if (rows.length > 0) {
    await db
      .insert(schema.setting)
      .values(rows)
      .onConflictDoUpdate({
        target: schema.setting.key,
        set: {
          value: sql`excluded.value`,
          updatedBy: sql`excluded.updated_by`,
          updatedAt: sql`now()`,
        },
      })
  }
  return getSettings()
}
