import { describe, expect, test } from 'bun:test'
import { request } from './helpers'

describe('system', () => {
  test('GET /api/health reports database ok', async () => {
    const res = await request('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', checks: { database: true } })
  })

  test('GET /api/v1/config lists enabled sign-in methods', async () => {
    const res = await request('/api/v1/config')
    expect(await res.json()).toEqual({ auth: { providers: ['email'] } })
  })

  test('unknown routes use the error shape', async () => {
    const res = await request('/api/v1/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } })
  })

  test('GET /api/docs/json serves the OpenAPI spec', async () => {
    const res = await request('/api/docs/json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/v1/me')
    expect(spec.paths).toHaveProperty('/api/auth/get-session')
  })
})
