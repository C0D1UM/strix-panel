import { Elysia } from 'elysia'
import { enabledAuthProviders } from '../../lib/auth'
import { env } from '../../lib/env'
import { PublicConfigResponse } from './schema'

// Unauthenticated: the login page reads which sign-in methods to show.
export const configModule = new Elysia({ name: 'config' }).get(
  '/config',
  () => ({
    auth: {
      providers: [...enabledAuthProviders],
      registrationEnabled: env.AUTH_REGISTRATION_ENABLED,
    },
  }),
  {
    response: PublicConfigResponse,
    detail: { tags: ['System'], summary: 'Public panel configuration' },
  },
)
