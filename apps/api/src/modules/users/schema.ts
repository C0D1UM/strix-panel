import { SCAN_STATUSES } from '@strix-panel/shared'
import { t } from 'elysia'

const Timestamp = t.String({ format: 'date-time' })
const Role = t.Union([t.Literal('admin'), t.Literal('user')])

export const UserIdParams = t.Object({ id: t.String({ format: 'uuid' }) })

export const SetRoleBody = t.Object({ role: Role })

export const AdminUserResponse = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  image: t.Nullable(t.String()),
  role: Role,
  status: t.Union([
    t.Literal('active'),
    t.Literal('pending'),
    t.Literal('disabled'),
    t.Literal('removed'),
  ]),
  runs: t.Number(),
  costUsd: t.Number(),
  lastRun: t.Nullable(
    t.Object({ id: t.String(), status: t.UnionEnum(SCAN_STATUSES), createdAt: Timestamp }),
  ),
  createdAt: Timestamp,
})

export const AdminUserListResponse = t.Array(AdminUserResponse)

export const ErrorResponse = t.Object({
  error: t.Object({ code: t.String(), message: t.String() }),
})
