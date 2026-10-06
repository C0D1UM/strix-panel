import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { createDb, schema } from '../src'
import { getUserBudget } from '../src/budget'

const { db, pool } = createDb(process.env.DATABASE_URL!)

afterAll(() => pool.end())

const now = new Date('2026-10-06T12:00:00Z')
let aliceId: string
let bobId: string

async function addUser(name: string) {
  const [row] = await db
    .insert(schema.user)
    .values({ name, email: `${name}-${crypto.randomUUID()}@example.com` })
    .returning()
  return row!.id
}

const addScan = (userId: string, costUsd: number, createdAt: string, status = 'completed') =>
  db.insert(schema.scan).values({
    userId,
    targets: [{ type: 'url', value: 'https://example.com/' }],
    scanMode: 'quick',
    status: status as 'completed',
    costUsd,
    createdAt: new Date(createdAt),
  })

beforeEach(async () => {
  await db.delete(schema.user)
  aliceId = await addUser('alice')
  bobId = await addUser('bob')
})

test('defaults to unlimited with a monthly window', async () => {
  expect(await getUserBudget(db, aliceId, now)).toEqual({
    limitUsd: null,
    window: 'month',
    spentUsd: 0,
    windowStartsAt: new Date('2026-10-01T00:00:00Z'),
    resetsAt: new Date('2026-11-01T00:00:00Z'),
  })
})

test('counts every status in the window, by creation time, for that user only', async () => {
  await db.update(schema.user).set({ budgetUsd: 50 }).where(eq(schema.user.id, aliceId))
  await addScan(aliceId, 1.25, '2026-10-01T00:00:00Z')
  await addScan(aliceId, 0.5, '2026-10-05T00:00:00Z', 'running')
  await addScan(aliceId, 2, '2026-10-06T00:00:00Z', 'failed')
  await addScan(aliceId, 9, '2026-09-30T23:59:59Z')
  await addScan(bobId, 7, '2026-10-02T00:00:00Z')
  const budget = await getUserBudget(db, aliceId, now)
  expect(budget).toMatchObject({ limitUsd: 50, spentUsd: 3.75 })
})

test('forever counts all scans and has no window', async () => {
  await db
    .update(schema.user)
    .set({ budgetUsd: 0, budgetWindow: 'forever' })
    .where(eq(schema.user.id, aliceId))
  await addScan(aliceId, 1, '2020-01-01T00:00:00Z')
  await addScan(aliceId, 2, '2026-10-06T00:00:00Z')
  expect(await getUserBudget(db, aliceId, now)).toEqual({
    limitUsd: 0,
    window: 'forever',
    spentUsd: 3,
    windowStartsAt: null,
    resetsAt: null,
  })
})

test('returns null for an unknown user', async () => {
  expect(await getUserBudget(db, '0190a000-0000-7000-8000-000000000000', now)).toBeNull()
})
