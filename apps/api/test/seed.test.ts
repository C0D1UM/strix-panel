import { schema } from '@strix-panel/db'
import { beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { SAMPLE_SCAN_NAME, seedAdmin, seedSampleScan } from '../src/seed'
import { request, signUp } from './helpers'

const admin = { email: 'seed@example.com', password: 'password1234', name: 'Seed Admin' }

async function roleOf(email: string) {
  const [row] = await db
    .select({ role: schema.user.role })
    .from(schema.user)
    .where(eq(schema.user.email, email))
  return row?.role
}

beforeEach(async () => {
  await db.delete(schema.user)
})

describe('seedAdmin', () => {
  test('creates an admin who can sign in with the seeded password', async () => {
    // Someone else signed up first, so the seeded user is not admin by the first-user rule.
    await signUp('first@example.com')

    expect(await seedAdmin(admin)).toBe('created')
    expect(await roleOf(admin.email)).toBe('admin')

    const res = await request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: admin.email, password: admin.password }),
    })
    expect(res.status).toBe(200)
  })

  test('is idempotent', async () => {
    expect(await seedAdmin(admin)).toBe('created')
    expect(await seedAdmin(admin)).toBe('unchanged')
  })

  test('promotes an existing user without changing their password', async () => {
    await signUp('first@example.com')
    await signUp(admin.email)
    expect(await roleOf(admin.email)).toBe('user')

    expect(await seedAdmin({ ...admin, password: 'a-different-password' })).toBe('promoted')
    expect(await roleOf(admin.email)).toBe('admin')

    const res = await request('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email: admin.email, password: 'correct-horse-battery' }),
    })
    expect(res.status).toBe(200)
  })

  test('respects ALLOWED_EMAIL_DOMAINS', async () => {
    await expect(seedAdmin({ ...admin, email: 'admin@gmail.com' })).rejects.toThrow(/not allowed/)
  })
})

describe('seedSampleScan', () => {
  test('creates one finished demo scan the API can serve, and is idempotent', async () => {
    await seedAdmin(admin)
    const [row] = await db.select({ id: schema.user.id }).from(schema.user)

    expect(await seedSampleScan(row!.id)).toBe('created')
    expect(await seedSampleScan(row!.id)).toBe('unchanged')

    const { cookie } = await (async () => {
      const res = await request('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email: admin.email, password: admin.password }),
      })
      return {
        cookie: res.headers
          .getSetCookie()
          .map((c) => c.split(';')[0])
          .join('; '),
      }
    })()

    const list = (await (await request('/api/v1/scans', { headers: { cookie } })).json()) as {
      total: number
      items: {
        id: string
        name: string
        status: string
        hasReport: boolean
        findings: Record<string, number>
      }[]
    }
    expect(list.total).toBe(1)
    const [scan] = list.items
    expect(scan).toMatchObject({ name: SAMPLE_SCAN_NAME, status: 'completed', hasReport: true })
    expect(scan!.findings).toEqual({ critical: 1, high: 1, medium: 0, low: 1, info: 1 })

    const findings = (await (
      await request(`/api/v1/scans/${scan!.id}/findings`, { headers: { cookie } })
    ).json()) as { severity: string }[]
    expect(findings.map((f) => f.severity)).toEqual(['critical', 'high', 'low', 'info'])

    const events = (await (
      await request(`/api/v1/scans/${scan!.id}/events`, { headers: { cookie } })
    ).json()) as { type: string }[]
    expect(events[0]!.type).toBe('status')
    expect(events.at(-1)!.type).toBe('status')
  })
})
