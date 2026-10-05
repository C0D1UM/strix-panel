import { t } from 'elysia'
import { BudgetWindow } from '../users/schema'

export const MeResponse = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  image: t.Nullable(t.String()),
  role: t.Union([t.Literal('admin'), t.Literal('user')]),
  approved: t.Boolean(),
  // Admins only: users waiting for approval (sidebar badge).
  pendingUsers: t.Optional(t.Number()),
})

const Timestamp = t.String({ format: 'date-time' })

export const MyBudgetResponse = t.Object({
  // Null = unlimited.
  limitUsd: t.Nullable(t.Number()),
  window: BudgetWindow,
  // Cost of the user's scans created in the current window.
  spentUsd: t.Number(),
  // Null = unlimited.
  remainingUsd: t.Nullable(t.Number()),
  // Needed to start a scan when the budget is limited (Admin → Settings).
  minToStartUsd: t.Number(),
  // Null for the `forever` window.
  windowStartsAt: t.Nullable(Timestamp),
  resetsAt: t.Nullable(Timestamp),
})
