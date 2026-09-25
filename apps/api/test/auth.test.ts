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
