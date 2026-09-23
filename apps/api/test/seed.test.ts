import { schema } from '@strix-panel/db'
import { beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../src/lib/db'
import { seedAdmin } from '../src/seed'
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
