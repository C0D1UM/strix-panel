import { Elysia } from 'elysia'
import { authPlugin } from '../../plugins/auth'
import {
  AdminUserListResponse,
  AdminUserResponse,
  ErrorResponse,
  SetRoleBody,
  UserIdParams,
} from './schema'
import {
  approveUser,
  disableUser,
  enableUser,
  listUsers,
  removeUser,
  restoreUser,
  setUserRole,
} from './service'

const tags = ['Users']
const response = {
  200: AdminUserResponse,
  400: ErrorResponse,
  404: ErrorResponse,
  409: ErrorResponse,
}

export const usersModule = new Elysia({ name: 'users', prefix: '/admin/users' })
  .use(authPlugin)
  .get('/', () => listUsers(), {
    requireRole: 'admin',
    response: AdminUserListResponse,
    detail: { tags, summary: 'All users with their usage (admin)' },
  })
  .post('/:id/approve', ({ user, params }) => approveUser(user, params.id), {
    requireRole: 'admin',
    params: UserIdParams,
    response,
    detail: { tags, summary: 'Approve a pending user so they can start scans (admin)' },
  })
  .post('/:id/disable', ({ user, params }) => disableUser(user, params.id), {
    requireRole: 'admin',
    params: UserIdParams,
    response,
    detail: { tags, summary: 'Disable a user: signs them out and blocks sign-in (admin)' },
  })
  .post('/:id/enable', ({ user, params }) => enableUser(user, params.id), {
    requireRole: 'admin',
    params: UserIdParams,
    response,
    detail: { tags, summary: 'Re-enable a disabled user (admin)' },
  })
  .delete('/:id', ({ user, params }) => removeUser(user, params.id), {
    requireRole: 'admin',
    params: UserIdParams,
    response,
    detail: { tags, summary: 'Remove a user (soft delete); their scans are kept (admin)' },
  })
  .post('/:id/restore', ({ user, params }) => restoreUser(user, params.id), {
    requireRole: 'admin',
    params: UserIdParams,
    response,
    detail: { tags, summary: 'Restore a removed user (admin)' },
  })
  .post('/:id/role', ({ user, params, body }) => setUserRole(user, params.id, body.role), {
    requireRole: 'admin',
    params: UserIdParams,
    body: SetRoleBody,
    response,
    detail: { tags, summary: 'Make a user admin or remove admin (admin)' },
  })
