import { ROLES, type Role } from '@strix-panel/shared'
import { Elysia } from 'elysia'
import { authPlugin } from '../../plugins/auth'
import { MeResponse } from './schema'

const toRole = (role: string | null | undefined): Role =>
  ROLES.includes(role as Role) ? (role as Role) : 'user'

export const meModule = new Elysia({ name: 'me' }).use(authPlugin).get(
  '/me',
  ({ user }) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    role: toRole(user.role),
  }),
  {
    requireAuth: true,
    response: MeResponse,
    detail: { tags: ['Users'], summary: 'Current signed-in user' },
  },
)
