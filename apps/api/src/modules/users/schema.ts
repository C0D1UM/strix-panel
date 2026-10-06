import { t } from 'elysia'

const Timestamp = t.String({ format: 'date-time' })
const Role = t.Union([t.Literal('admin'), t.Literal('user')])

export const BudgetWindow = t.Union([
  t.Literal('week'),
  t.Literal('month'),
  t.Literal('year'),
  t.Literal('forever'),
])

export const UserIdParams = t.Object({ id: t.String({ format: 'uuid' }) })

export const SetRoleBody = t.Object({ role: Role })

export const SetBudgetBody = t.Object({
  // Null = unlimited, 0 = no scans.
  budgetUsd: t.Nullable(t.Number({ minimum: 0, maximum: 100_000 })),
  window: BudgetWindow,
})

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
  budget: t.Object({
    // Null = unlimited, 0 = no scans.
    limitUsd: t.Nullable(t.Number()),
    window: BudgetWindow,
    // Cost of the scans created in the current window.
    spentUsd: t.Number(),
  }),
  lastRunAt: t.Nullable(Timestamp),
  createdAt: Timestamp,
})

export const AdminUserListResponse = t.Array(AdminUserResponse)

export const ErrorResponse = t.Object({
  error: t.Object({ code: t.String(), message: t.String() }),
})
