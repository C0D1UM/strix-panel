import * as settings from '@strix-panel/db/settings'
import type { Settings, SettingsPatch } from '@strix-panel/shared/settings'
import { db } from '../../lib/db'

export const getSettings = (): Promise<Settings> => settings.getSettings(db)

// `userId` is null only for writes made by the server itself (tests).
export const updateSettings = (patch: SettingsPatch, userId: string | null): Promise<Settings> =>
  settings.updateSettings(db, patch, userId)
