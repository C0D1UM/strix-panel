import { t } from 'elysia'

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
