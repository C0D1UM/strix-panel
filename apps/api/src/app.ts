import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'
import { auth, authOpenApi } from './lib/auth'
import { NotFoundError } from './lib/errors'
import { configModule } from './modules/config'
import { dashboardModule } from './modules/dashboard'
import { healthModule } from './modules/health'
import { meModule } from './modules/me'
import { scansModule } from './modules/scans'
import { usersModule } from './modules/users'
import { errorsPlugin } from './plugins/errors'

const authDocs = await authOpenApi()

export const app = new Elysia({ prefix: '/api' })
  .use(errorsPlugin)
  .use(
    openapi({
      path: '/docs',
      documentation: {
        info: { title: 'Strix Panel API', version: '0.1.0' },
        tags: [
          { name: 'System', description: 'Health and configuration' },
          { name: 'Users', description: 'Users and roles' },
          { name: 'Scans', description: 'Strix scans and their live progress' },
          { name: 'Dashboard', description: 'Usage metrics' },
          { name: 'Auth', description: 'Better Auth endpoints' },
        ],
        components: authDocs.components as never,
        paths: authDocs.paths as never,
      },
    }),
  )
  // Better Auth owns /api/auth/*; `parse: 'none'` leaves the body stream for it to read.
  // Except the admin plugin's own endpoints (/api/auth/admin/*): they skip our guardrails (self, last admin,
  // soft delete). Admins manage users through /api/v1/admin/users instead.
  .all(
    '/auth/*',
    ({ request }) => {
      if (new URL(request.url).pathname.startsWith('/api/auth/admin/')) throw new NotFoundError()
      return auth.handler(request)
    },
    {
      parse: 'none',
      detail: { hide: true },
    },
  )
  .use(healthModule)
  .group('/v1', (v1) =>
    v1.use(configModule).use(meModule).use(scansModule).use(dashboardModule).use(usersModule),
  )

export type App = typeof app
