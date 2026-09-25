import { schema } from '@strix-panel/db'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, test } from 'bun:test'
import { db } from '../src/lib/db'
import { request, signUp } from './helpers'

let admin: string
let alice: string
let adminId: string
let aliceId: string
let bobId: string

async function userId(email: string) {
  const [row] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
  return row!.id
}

beforeEach(async () => {
  await db.delete(schema.user)
  admin = (await signUp('admin@example.com')).cookie
  alice = (await signUp('alice@example.com')).cookie
  await signUp('bob@example.com')
  adminId = await userId('admin@example.com')
  aliceId = await userId('alice@example.com')
  bobId = await userId('bob@example.com')
})

type AdminUser = {
  id: string
  role: string
  status: string
  runs: number
  costUsd: number
  costThisMonthUsd: number
  lastRunAt: string | null
}

const list = async (cookie = admin) => {
  const res = await request('/api/v1/admin/users', { headers: { cookie } })
  return { res, users: (await res.json()) as AdminUser[] }
}

const act = (id: string, action: string, cookie = admin) =>
  request(`/api/v1/admin/users/${id}/${action}`, { method: 'POST', headers: { cookie } })

const remove = (id: string, cookie = admin) =>
  request(`/api/v1/admin/users/${id}`, { method: 'DELETE', headers: { cookie } })

const setRole = (id: string, role: 'admin' | 'user', cookie = admin) =>
  request(`/api/v1/admin/users/${id}/role`, {
    method: 'POST',
    body: JSON.stringify({ role }),
    headers: { cookie },
  })

const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code

const me = (cookie: string) => request('/api/v1/me', { headers: { cookie } })

describe('GET /api/v1/admin/users', () => {
  test('is admin-only', async () => {
    const { res } = await list(alice)
    expect(res.status).toBe(403)
  })

  test('returns usage, last run and every status, pending first', async () => {
    const now = new Date()
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 1))
    await db.insert(schema.scan).values([
      {
        userId: aliceId,
        targets: ['https://example.com/'],
        scanMode: 'quick',
        status: 'completed',
        costUsd: 1.25,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        userId: aliceId,
        targets: ['https://example.com/'],
        scanMode: 'quick',
        status: 'failed',
        costUsd: 0.5,
        createdAt: thisMonth,
      },
    ])
    await db.update(schema.user).set({ approvedAt: null }).where(eq(schema.user.id, bobId))
    const { res, users } = await list()
    expect(res.status).toBe(200)
    expect(users.map((u) => u.id)).toEqual([bobId, adminId, aliceId])
    const a = users.find((u) => u.id === aliceId)!
    expect(a).toMatchObject({
      status: 'active',
      role: 'user',
      runs: 2,
      costUsd: 1.75,
      costThisMonthUsd: 0.5,
      lastRunAt: thisMonth.toISOString(),
    })
    expect(users.find((u) => u.id === bobId)).toMatchObject({
      status: 'pending',
      runs: 0,
      costUsd: 0,
      costThisMonthUsd: 0,
      lastRunAt: null,
    })
  })

  test('includes removed users', async () => {
    await remove(aliceId)
    const { users } = await list()
    expect(users.find((u) => u.id === aliceId)?.status).toBe('removed')
  })
})

describe('actions', () => {
  test('approve sets approval once', async () => {
    await db.update(schema.user).set({ approvedAt: null }).where(eq(schema.user.id, bobId))
    const res = await act(bobId, 'approve')
    expect(res.status).toBe(200)
    expect(((await res.json()) as AdminUser).status).toBe('active')
    const again = await act(bobId, 'approve')
    expect(again.status).toBe(409)
    expect(await errorCode(again)).toBe('ALREADY_APPROVED')
  })

  test('disable signs the user out, enable restores access', async () => {
    const res = await act(aliceId, 'disable')
    expect(((await res.json()) as AdminUser).status).toBe('disabled')
    expect((await me(alice)).status).toBe(401)
    const again = await act(aliceId, 'disable')
    expect(again.status).toBe(200)
    const enabled = await act(aliceId, 'enable')
    expect(((await enabled.json()) as AdminUser).status).toBe('active')
  })

  test('remove signs the user out; restore brings back the earlier state', async () => {
    await act(aliceId, 'disable')
    const res = await remove(aliceId)
    expect(((await res.json()) as AdminUser).status).toBe('removed')
    expect((await me(alice)).status).toBe(401)

    const blocked = await act(aliceId, 'enable')
    expect(blocked.status).toBe(409)
    expect(await errorCode(blocked)).toBe('USER_REMOVED')

    const restored = await act(aliceId, 'restore')
    expect(((await restored.json()) as AdminUser).status).toBe('disabled')
    const notRemoved = await act(aliceId, 'restore')
    expect(notRemoved.status).toBe(409)
    expect(await errorCode(notRemoved)).toBe('USER_NOT_REMOVED')
  })

  test('admins cannot act on themselves', async () => {
    for (const res of [
      await act(adminId, 'disable'),
      await remove(adminId),
      await setRole(adminId, 'user'),
    ]) {
      expect(res.status).toBe(400)
      expect(await errorCode(res)).toBe('CANNOT_MODIFY_SELF')
    }
  })

  test('unknown user is a 404, a bad id a 422', async () => {
    const res = await act('01900000-0000-7000-8000-000000000000', 'approve')
    expect(res.status).toBe(404)
    expect(await errorCode(res)).toBe('USER_NOT_FOUND')
    expect((await act('nope', 'approve')).status).toBe(422)
  })

  test('promoting a pending user also approves them; demote works', async () => {
    await db.update(schema.user).set({ approvedAt: null }).where(eq(schema.user.id, bobId))
    const res = await setRole(bobId, 'admin')
    expect(await res.json()).toMatchObject({ role: 'admin', status: 'active' })
    const demoted = await setRole(bobId, 'user')
    expect(await demoted.json()).toMatchObject({ role: 'user', status: 'active' })
  })

  test('an admin can disable another admin', async () => {
    await setRole(aliceId, 'admin')
    const res = await act(aliceId, 'disable')
    expect(res.status).toBe(200)
  })

  test('two admins demoting each other at once leaves one admin', async () => {
    await setRole(aliceId, 'admin')
    const results = await Promise.all([
      setRole(aliceId, 'user', admin),
      setRole(adminId, 'user', alice),
    ])
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
    const admins = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.role, 'admin'))
    expect(admins).toHaveLength(1)
  })
})

describe("Better Auth's admin endpoints", () => {
  test('are not reachable, so they cannot bypass the guardrails', async () => {
    for (const path of ['set-role', 'update-user', 'remove-user', 'ban-user', 'list-users']) {
      const res = await request(`/api/auth/admin/${path}`, {
        method: 'POST',
        body: JSON.stringify({ userId: aliceId, role: 'admin' }),
        headers: { cookie: admin },
      })
      expect(res.status).toBe(404)
    }
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, aliceId))
    expect(row).toMatchObject({ role: 'user', banned: false })
  })
})
