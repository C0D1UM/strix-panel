import { schema } from '@strix-panel/db'
import { toRole, userStatus, type Role } from '@strix-panel/shared'
import { and, asc, count, eq, isNull, ne, sql, type SQL } from 'drizzle-orm'
import { lockAdmins, type Tx } from '../../lib/admin-lock'
import { db } from '../../lib/db'
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors'

export type Actor = { id: string }
type UserRow = typeof schema.user.$inferSelect

const { user, scan, session } = schema

// This month = since the start of the current UTC month, by scan creation time.
const usage = db
  .select({
    userId: scan.userId,
    runs: sql<number>`count(*)::int`.as('runs'),
    costUsd: sql<number>`coalesce(sum(${scan.costUsd}), 0)::float8`.as('cost_usd'),
    costThisMonthUsd: sql<number>`coalesce(sum(${scan.costUsd}) filter (
      where ${scan.createdAt} >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    ), 0)::float8`.as('cost_this_month_usd'),
    lastRunAt: sql<Date>`max(${scan.createdAt})`.mapWith(scan.createdAt).as('last_run_at'),
  })
  .from(scan)
  .groupBy(scan.userId)
  .as('usage')

async function selectUsers(where?: SQL) {
  const rows = await db
    .select({
      user,
      runs: usage.runs,
      costUsd: usage.costUsd,
      costThisMonthUsd: usage.costThisMonthUsd,
      lastRunAt: usage.lastRunAt,
    })
    .from(user)
    .leftJoin(usage, eq(usage.userId, user.id))
    .where(where)
    .orderBy(asc(user.name))
  return rows.map((row) => ({
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    image: row.user.image ?? null,
    role: toRole(row.user.role),
    status: userStatus(row.user),
    runs: row.runs ?? 0,
    costUsd: row.costUsd ?? 0,
    costThisMonthUsd: row.costThisMonthUsd ?? 0,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    createdAt: row.user.createdAt.toISOString(),
  }))
}

export type AdminUserDto = Awaited<ReturnType<typeof selectUsers>>[number]

// Pending users first, then by name (the query already sorts by name; sort is stable).
export async function listUsers(): Promise<AdminUserDto[]> {
  const users = await selectUsers()
  return users.sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'))
}

async function getUserDto(id: string): Promise<AdminUserDto> {
  const [dto] = await selectUsers(eq(user.id, id))
  if (!dto) throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  return dto
}

// Matches the "pending" status: not approved, not disabled, not removed.
export async function countPendingUsers(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(user)
    .where(and(isNull(user.approvedAt), eq(user.banned, false), isNull(user.deletedAt)))
  return row?.n ?? 0
}

const isActiveAdmin = (target: UserRow) =>
  target.role === 'admin' && !target.banned && target.deletedAt === null

async function loadTarget(tx: Tx, actor: Actor, id: string, allowRemoved = false) {
  if (id === actor.id) {
    throw new BadRequestError('CANNOT_MODIFY_SELF', 'You cannot change your own account')
  }
  const [target] = await tx.select().from(user).where(eq(user.id, id)).for('update')
  if (!target) throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  if (target.deletedAt && !allowRemoved) {
    throw new ConflictError('USER_REMOVED', 'This user has been removed. Restore them first.')
  }
  return target
}

// Called under lockAdmins before anything that takes away an active admin.
async function assertAnotherActiveAdmin(tx: Tx, excludeId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(user)
    .where(
      and(
        eq(user.role, 'admin'),
        eq(user.banned, false),
        isNull(user.deletedAt),
        ne(user.id, excludeId),
      ),
    )
  if ((row?.n ?? 0) === 0) {
    throw new ConflictError('LAST_ADMIN', 'At least one active admin must remain')
  }
}

// Runs `change` in a transaction holding the admin lock, then returns the fresh row.
async function mutate(
  actor: Actor,
  id: string,
  change: (tx: Tx, target: UserRow) => Promise<void>,
  allowRemoved = false,
): Promise<AdminUserDto> {
  await db.transaction(async (tx) => {
    await lockAdmins(tx)
    const target = await loadTarget(tx, actor, id, allowRemoved)
    await change(tx, target)
  })
  return getUserDto(id)
}

const signOut = (tx: Tx, id: string) => tx.delete(session).where(eq(session.userId, id))

export const approveUser = (actor: Actor, id: string) =>
  mutate(actor, id, async (tx, target) => {
    if (target.approvedAt) {
      throw new ConflictError('ALREADY_APPROVED', 'This user is already approved')
    }
    await tx.update(user).set({ approvedAt: new Date() }).where(eq(user.id, id))
  })

export const disableUser = (actor: Actor, id: string) =>
  mutate(actor, id, async (tx, target) => {
    if (target.banned) return
    if (isActiveAdmin(target)) await assertAnotherActiveAdmin(tx, id)
    await tx
      .update(user)
      .set({ banned: true, banReason: null, banExpires: null })
      .where(eq(user.id, id))
    await signOut(tx, id)
  })

export const enableUser = (actor: Actor, id: string) =>
  mutate(actor, id, async (tx, target) => {
    if (!target.banned) return
    await tx.update(user).set({ banned: false }).where(eq(user.id, id))
  })

export const removeUser = (actor: Actor, id: string) =>
  mutate(actor, id, async (tx, target) => {
    if (isActiveAdmin(target)) await assertAnotherActiveAdmin(tx, id)
    await tx.update(user).set({ deletedAt: new Date() }).where(eq(user.id, id))
    await signOut(tx, id)
  })

export const restoreUser = (actor: Actor, id: string) =>
  mutate(
    actor,
    id,
    async (tx, target) => {
      if (!target.deletedAt) throw new ConflictError('USER_NOT_REMOVED', 'This user is not removed')
      await tx.update(user).set({ deletedAt: null }).where(eq(user.id, id))
    },
    true,
  )

// Promoting a pending user approves them too: an admin who can't scan makes no sense.
export const setUserRole = (actor: Actor, id: string, role: Role) =>
  mutate(actor, id, async (tx, target) => {
    if (toRole(target.role) === role) return
    if (role === 'user' && isActiveAdmin(target)) await assertAnotherActiveAdmin(tx, id)
    await tx
      .update(user)
      .set(role === 'admin' ? { role, approvedAt: target.approvedAt ?? new Date() } : { role })
      .where(eq(user.id, id))
  })
