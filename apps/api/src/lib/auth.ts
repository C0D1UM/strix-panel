import { schema } from '@strix-panel/db'
import { isAllowedEmail } from '@strix-panel/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { admin, openAPI } from 'better-auth/plugins'
import { eq, sql } from 'drizzle-orm'
import { db } from './db'
import { env } from './env'

// Arbitrary constant key for the advisory lock that serializes first-admin promotion.
const FIRST_ADMIN_LOCK_KEY = 7_140_001

function assertAllowedEmail(email: string) {
  if (!isAllowedEmail(email, env.ALLOWED_EMAIL_DOMAINS)) {
    throw new APIError('FORBIDDEN', { message: 'Your email domain is not allowed to sign in' })
  }
}

// Runs after the user insert has committed. The lock makes concurrent first sign-ups promote exactly one user.
export async function promoteIfFirstAdmin(userId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${FIRST_ADMIN_LOCK_KEY})`)
    const existing = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.role, 'admin'))
      .limit(1)
    if (existing.length === 0) {
      await tx.update(schema.user).set({ role: 'admin' }).where(eq(schema.user.id, userId))
    }
  })
}

export const auth = betterAuth({
  appName: 'Strix Panel',
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.BETTER_AUTH_URL],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  // Ids come from Postgres (uuidv7() column default).
  advanced: { database: { generateId: false } },
  emailAndPassword: {
    enabled: env.AUTH_EMAIL_PASSWORD_ENABLED,
    disableSignUp: !env.AUTH_REGISTRATION_ENABLED,
  },
  socialProviders: env.AUTH_GOOGLE_ENABLED
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          disableSignUp: !env.AUTH_REGISTRATION_ENABLED,
        },
      }
    : {},
  plugins: [admin(), openAPI()],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          assertAllowedEmail(user.email)
        },
        after: async (user) => {
          await promoteIfFirstAdmin(user.id)
        },
      },
    },
    session: {
      create: {
        // Re-checked on every sign-in so tightening ALLOWED_EMAIL_DOMAINS locks out existing users too.
        before: async (session, ctx) => {
          const user = await ctx?.context.internalAdapter.findUserById(session.userId)
          if (user) assertAllowedEmail(user.email)
        },
      },
    },
  },
})

export type AuthUser = typeof auth.$Infer.Session.user
export type AuthSession = typeof auth.$Infer.Session.session

export const enabledAuthProviders = [
  ...(env.AUTH_GOOGLE_ENABLED ? (['google'] as const) : []),
  ...(env.AUTH_EMAIL_PASSWORD_ENABLED ? (['email'] as const) : []),
]

let openApiSchema: ReturnType<typeof auth.api.generateOpenAPISchema> | undefined
const getOpenApiSchema = () => (openApiSchema ??= auth.api.generateOpenAPISchema())

// Better Auth's own endpoints, merged into our Swagger docs under the "Auth" tag.
export async function authOpenApi() {
  const { paths, components } = await getOpenApiSchema()
  const prefixed: Record<string, unknown> = {}
  for (const [path, item] of Object.entries(paths)) {
    for (const operation of Object.values(item as Record<string, { tags?: string[] }>)) {
      operation.tags = ['Auth']
    }
    prefixed[`/api/auth${path}`] = item
  }
  return { paths: prefixed, components }
}
