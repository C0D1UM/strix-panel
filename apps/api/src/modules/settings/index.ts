import { Elysia } from 'elysia'
import { authPlugin } from '../../plugins/auth'
import { SettingsPatchBody, SettingsResponse } from './schema'
import { getSettings, updateSettings } from './service'

const tags = ['Settings']

export const settingsModule = new Elysia({ name: 'settings', prefix: '/admin/settings' })
  .use(authPlugin)
  .get('/', () => getSettings(), {
    requireRole: 'admin',
    response: SettingsResponse,
    detail: { tags, summary: 'Panel settings (admin)' },
  })
  .patch('/', ({ user, body }) => updateSettings(body, user.id), {
    requireRole: 'admin',
    body: SettingsPatchBody,
    response: SettingsResponse,
    detail: { tags, summary: 'Change panel settings; send only the changed fields (admin)' },
  })
