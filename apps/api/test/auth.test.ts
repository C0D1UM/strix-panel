import { schema } from '@strix-panel/db'
import { eq } from 'drizzle-orm'
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

  test('/me reports approval, and the pending count to admins only', async () => {
    const admin = await signUp('first@example.com')
    const user = await signUp('second@example.com')
    await db
      .update(schema.user)
      .set({ approvedAt: null })
      .where(eq(schema.user.email, 'second@example.com'))
    const adminMe = await (
      await request('/api/v1/me', { headers: { cookie: admin.cookie } })
    ).json()
    const userMe = (await (
      await request('/api/v1/me', { headers: { cookie: user.cookie } })
    ).json()) as Record<string, unknown>
    expect(adminMe).toMatchObject({ approved: true, pendingUsers: 1 })
    expect(userMe.approved).toBe(false)
    expect('pendingUsers' in userMe).toBe(false)
  })

  test('rejects emails outside ALLOWED_EMAIL_DOMAINS', async () => {
    const { res } = await signUp('mallory@gmail.com')
    expect(res.status).toBe(403)
    expect(await db.select().from(schema.user)).toHaveLength(0)
  })
})

// The env is read once per process, so the disabled case runs the app in a child process.
describe('AUTH_REGISTRATION_ENABLED=false', () => {
  test('blocks sign-up, even for the first user, but not the seed', async () => {
    const script = `
      const { request, signUp } = await import('./test/helpers')
      const { seedAdmin } = await import('./src/seed')
      const { res } = await signUp('first@example.com')
      const config = await (await request('/api/v1/config')).json()
      const seed = await seedAdmin({ email: 'seed@example.com', password: 'password1234', name: 'Seed' })
      const signIn = await request('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email: 'seed@example.com', password: 'password1234' }),
      })
      console.log(JSON.stringify({ status: res.status, config, seed, signIn: signIn.status }))
      process.exit(0)
    `
    const proc = Bun.spawn(['bun', '-e', script], {
      cwd: `${import.meta.dir}/..`,
      env: { ...process.env, AUTH_REGISTRATION_ENABLED: 'false' },
      stderr: 'inherit',
    })
    const out = JSON.parse((await new Response(proc.stdout).text()).trim().split('\n').at(-1)!)
    expect(out.status).toBe(400)
    expect(out.config.auth.registrationEnabled).toBe(false)
    expect(out.seed).toBe('created')
    expect(out.signIn).toBe(200)
    const users = await db.select({ email: schema.user.email }).from(schema.user)
    expect(users).toEqual([{ email: 'seed@example.com' }])
  })
})

const signIn = (email: string) =>
  request('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'correct-horse-battery' }),
  })

describe('approval and account state', () => {
  test('new users are approved by default', async () => {
    await signUp('first@example.com')
    await signUp('second@example.com')
    const users = await db.select({ approvedAt: schema.user.approvedAt }).from(schema.user)
    expect(users.every((u) => u.approvedAt !== null)).toBe(true)
  })

  test('a disabled user cannot sign in', async () => {
    await signUp('first@example.com')
    await signUp('second@example.com')
    await db
      .update(schema.user)
      .set({ banned: true })
      .where(eq(schema.user.email, 'second@example.com'))
    const res = await signIn('second@example.com')
    expect(res.status).toBe(403)
    expect(((await res.json()) as { message: string }).message).toBe(
      'Your account is disabled. Contact an admin.',
    )
  })

  test('a removed user cannot sign in', async () => {
    await signUp('first@example.com')
    await signUp('second@example.com')
    await db
      .update(schema.user)
      .set({ deletedAt: new Date() })
      .where(eq(schema.user.email, 'second@example.com'))
    const res = await signIn('second@example.com')
    expect(res.status).toBe(403)
    expect(((await res.json()) as { message: string }).message).toBe(
      'Your account has been removed. Contact an admin.',
    )
  })
})

describe('AUTH_AUTO_APPROVE_USERS=false', () => {
  test('first user (admin) is approved, later users are pending, seed admin is approved', async () => {
    const script = `
      const { request, signUp } = await import('./test/helpers')
      const { seedAdmin } = await import('./src/seed')
      const first = await signUp('first@example.com')
      const second = await signUp('second@example.com')
      await seedAdmin({ email: 'seed@example.com', password: 'password1234', name: 'Seed' })
      const me1 = await (await request('/api/v1/me', { headers: { cookie: first.cookie } })).json()
      const me2 = await (await request('/api/v1/me', { headers: { cookie: second.cookie } })).json()
      console.log(JSON.stringify({ me1, me2 }))
      process.exit(0)
    `
    const proc = Bun.spawn(['bun', '-e', script], {
      cwd: `${import.meta.dir}/..`,
      env: { ...process.env, AUTH_AUTO_APPROVE_USERS: 'false' },
      stderr: 'inherit',
    })
    const out = JSON.parse((await new Response(proc.stdout).text()).trim().split('\n').at(-1)!)
    expect(out.me1).toMatchObject({ role: 'admin', approved: true, pendingUsers: 1 })
    expect(out.me2).toMatchObject({ role: 'user', approved: false })
    const [seed] = await db
      .select({ approvedAt: schema.user.approvedAt })
      .from(schema.user)
      .where(eq(schema.user.email, 'seed@example.com'))
    expect(seed!.approvedAt).not.toBeNull()
  })
})
