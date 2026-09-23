import { schema } from '@strix-panel/db'
import { eq } from 'drizzle-orm'
import { auth } from './lib/auth'
import { db, pool } from './lib/db'
import { env } from './lib/env'

export type SeedAdminResult = 'created' | 'promoted' | 'unchanged'

// Creates a local email+password admin, or promotes an existing user with that email.
// Never changes an existing user's password. Safe to run repeatedly.
export async function seedAdmin(input: {
  email: string
  password: string
  name: string
}): Promise<SeedAdminResult> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed an admin when NODE_ENV=production')
  }
  if (!env.AUTH_EMAIL_PASSWORD_ENABLED) {
    throw new Error(
      'The seeded admin signs in with email and password. Set AUTH_EMAIL_PASSWORD_ENABLED=true in .env first.',
    )
  }

  const email = input.email.toLowerCase()
  const [existing] = await db
    .select({ role: schema.user.role })
    .from(schema.user)
    .where(eq(schema.user.email, email))

  if (existing) {
    if (existing.role === 'admin') return 'unchanged'
    await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.email, email))
    return 'promoted'
  }

  // Goes through Better Auth so the password is hashed and ALLOWED_EMAIL_DOMAINS is enforced.
  await auth.api.signUpEmail({ body: { email, password: input.password, name: input.name } })
  await db.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.email, email))
  return 'created'
}

if (import.meta.main) {
  const messages: Record<SeedAdminResult, string> = {
    created: 'Created admin',
    promoted: 'Promoted existing user to admin',
    unchanged: 'Admin already exists',
  }
  try {
    const result = await seedAdmin({
      email: env.SEED_ADMIN_EMAIL,
      password: env.SEED_ADMIN_PASSWORD,
      name: env.SEED_ADMIN_NAME,
    })
    console.log(`${messages[result]}: ${env.SEED_ADMIN_EMAIL}`)
    if (result === 'created') console.log(`Sign in with password from SEED_ADMIN_PASSWORD.`)
  } catch (error) {
    console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
