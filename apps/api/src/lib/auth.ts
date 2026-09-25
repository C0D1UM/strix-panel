import { schema } from '@strix-panel/db'
import { isAllowedEmail } from '@strix-panel/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { admin, openAPI } from 'better-auth/plugins'
import { eq, sql } from 'drizzle-orm'
import { lockAdmins } from './admin-lock'
import { db } from './db'
import { env } from './env'

function assertAllowedEmail(email: string) {
  if (!isAllowedEmail(email, env.ALLOWED_EMAIL_DOMAINS)) {
    throw new APIError('FORBIDDEN', { message: 'Your email domain is not allowed to sign in' })
  }
}

// Runs after the user insert has committed. The lock makes concurrent first sign-ups promote exactly one user.
// The first admin is always approved, so AUTH_AUTO_APPROVE_USERS=false can't lock out a fresh install.
export async function promoteIfFirstAdmin(userId: string) {
  await db.transaction(async (tx) => {
    await lockAdmins(tx)
    const existing = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.role, 'admin'))
      .limit(1)
    if (existing.length === 0) {
      await tx
        .update(schema.user)
        .set({ role: 'admin', approvedAt: sql`coalesce(${schema.user.approvedAt}, now())` })
        .where(eq(schema.user.id, userId))
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
  // Declared so Better Auth's adapter reads and writes them; never settable from sign-up input.
  user: {
    additionalFields: {
      approvedAt: { type: 'date', required: false, input: false },
      deletedAt: { type: 'date', required: false, input: false },
    },
  },
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
  plugins: [admin({ bannedUserMessage: 'Your account is disabled. Contact an admin.' }), openAPI()],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          assertAllowedEmail(user.email)
          return {
            data: { ...user, approvedAt: env.AUTH_AUTO_APPROVE_USERS ? new Date() : null },
          }
        },
        after: async (user) => {
          await promoteIfFirstAdmin(user.id)
        },
      },
    },
    session: {
      create: {
        // Re-checked on every sign-in so tightening ALLOWED_EMAIL_DOMAINS locks out existing users too.
        // Removed users are refused here; disabled (banned) ones by the admin plugin.
        before: async (session) => {
          const [user] = await db
            .select({ email: schema.user.email, deletedAt: schema.user.deletedAt })
            .from(schema.user)
            .where(eq(schema.user.id, session.userId))
          if (!user) return
          assertAllowedEmail(user.email)
          if (user.deletedAt) {
            throw new APIError('FORBIDDEN', {
              message: 'Your account has been removed. Contact an admin.',
              code: 'ACCOUNT_REMOVED',
            })
          }
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
    // Not served: see the /auth/* route in app.ts.
    if (path.startsWith('/admin/')) continue
    for (const operation of Object.values(item as Record<string, { tags?: string[] }>)) {
      operation.tags = ['Auth']
    }
    prefixed[`/api/auth${path}`] = item
  }
  return { paths: prefixed, components }
}
