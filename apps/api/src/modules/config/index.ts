import { Elysia } from 'elysia'
import { enabledAuthProviders } from '../../lib/auth'
import { env } from '../../lib/env'
import { getSettings } from '../settings/service'
import { PublicConfigResponse } from './schema'

// Unauthenticated: the login page reads which sign-in methods and credits to show.
export const configModule = new Elysia({ name: 'config' }).get(
  '/config',
  async () => {
    const settings = await getSettings()
    return {
      auth: {
        providers: [...enabledAuthProviders],
        registrationEnabled: settings.auth.registrationEnabled,
      },
      branding: { showPoweredBy: env.SHOW_POWERED_BY_CODIUM },
      budget: { minToStartUsd: settings.budget.minToStartUsd },
      scans: { maxTargets: settings.scans.maxTargets },
    }
  },
  {
    response: PublicConfigResponse,
    detail: { tags: ['System'], summary: 'Public panel configuration' },
  },
)
