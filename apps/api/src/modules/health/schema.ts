import { t } from 'elysia'

export const HealthResponse = t.Object({
  status: t.Union([t.Literal('ok'), t.Literal('degraded')]),
  checks: t.Object({ database: t.Boolean() }),
})
