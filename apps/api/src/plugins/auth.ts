import type { Role } from '@strix-panel/shared'
import { Elysia } from 'elysia'
import { auth } from '../lib/auth'
import { ForbiddenError, UnauthorizedError } from '../lib/errors'

async function getSessionOrThrow(headers: Headers) {
  const result = await auth.api.getSession({ headers })
  if (!result) throw new UnauthorizedError()
  return { user: result.user, session: result.session }
}

// Route options: `{ requireAuth: true }` or `{ requireRole: 'admin' }` put `user` and `session` on the context.
export const authPlugin = new Elysia({ name: 'auth' }).macro({
  requireAuth: {
    resolve: ({ request }) => getSessionOrThrow(request.headers),
  },
  requireRole: (role: Role) => ({
    resolve: async ({ request }) => {
      const result = await getSessionOrThrow(request.headers)
      if (result.user.role !== role) throw new ForbiddenError()
      return result
    },
  }),
})
