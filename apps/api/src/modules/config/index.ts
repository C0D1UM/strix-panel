import { Elysia } from 'elysia'
import { enabledAuthProviders } from '../../lib/auth'
import { PublicConfigResponse } from './schema'

// Unauthenticated: the login page reads which sign-in methods to show.
export const configModule = new Elysia({ name: 'config' }).get(
  '/config',
  () => ({ auth: { providers: [...enabledAuthProviders] } }),
  {
    response: PublicConfigResponse,
    detail: { tags: ['System'], summary: 'Public panel configuration' },
  },
)
