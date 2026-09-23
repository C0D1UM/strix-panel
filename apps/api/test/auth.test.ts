import { schema } from '@strix-panel/db'
import { beforeEach, describe, expect, test } from 'bun:test'
import { db } from '../src/lib/db'
import { request, signUp } from './helpers'

beforeEach(async () => {
  await db.delete(schema.user)
})

describe('auth', () => {
  test('GET /api/v1/me requires a session', async () => {
    const res = await request('/api/v1/me')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    })
  })

  test('first user becomes admin, later users are regular users', async () => {
    const first = await signUp('first@example.com')
    const second = await signUp('second@example.com')
    expect(first.res.status).toBe(200)

    const me1 = await request('/api/v1/me', { headers: { cookie: first.cookie } })
    const me2 = await request('/api/v1/me', { headers: { cookie: second.cookie } })
    expect(((await me1.json()) as { role: string }).role).toBe('admin')
    expect(((await me2.json()) as { role: string }).role).toBe('user')
  })

  test('concurrent first sign-ups promote exactly one admin', async () => {
    await Promise.all(['a', 'b', 'c', 'd'].map((n) => signUp(`${n}@example.com`)))
    const users = await db.select({ role: schema.user.role }).from(schema.user)
    expect(users).toHaveLength(4)
    expect(users.filter((u) => u.role === 'admin')).toHaveLength(1)
  })

  test('rejects emails outside ALLOWED_EMAIL_DOMAINS', async () => {
    const { res } = await signUp('mallory@gmail.com')
    expect(res.status).toBe(403)
    expect(await db.select().from(schema.user)).toHaveLength(0)
  })
})
