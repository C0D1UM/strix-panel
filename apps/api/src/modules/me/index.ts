import { toRole } from '@strix-panel/shared'
import { Elysia } from 'elysia'
import { authPlugin } from '../../plugins/auth'
import { countPendingUsers } from '../users/service'
import { MeResponse } from './schema'

export const meModule = new Elysia({ name: 'me' }).use(authPlugin).get(
  '/me',
  async ({ user }) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    role: toRole(user.role),
    approved: user.approvedAt != null,
    ...(user.role === 'admin' ? { pendingUsers: await countPendingUsers() } : {}),
  }),
  {
    requireAuth: true,
    response: MeResponse,
    detail: { tags: ['Users'], summary: 'Current signed-in user' },
  },
)
