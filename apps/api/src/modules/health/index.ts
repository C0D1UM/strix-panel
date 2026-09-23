import { Elysia } from 'elysia'
import { HealthResponse } from './schema'
import { checkHealth } from './service'

export const healthModule = new Elysia({ name: 'health' }).get(
  '/health',
  async ({ set }) => {
    const health = await checkHealth()
    if (health.status !== 'ok') set.status = 503
    return health
  },
  {
    response: { 200: HealthResponse, 503: HealthResponse },
    detail: { tags: ['System'], summary: 'Liveness and dependency health' },
  },
)
