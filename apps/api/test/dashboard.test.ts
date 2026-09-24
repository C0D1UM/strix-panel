import { schema } from '@strix-panel/db'
import type { ScanStatus } from '@strix-panel/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { db } from '../src/lib/db'
import { scanQueue } from '../src/lib/queue'
import { scanListener } from '../src/lib/scan-listener'
import { request, signUp } from './helpers'

let admin: string
let alice: string
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
  aliceId = await userId('alice@example.com')
  bobId = await userId('bob@example.com')
})

afterAll(async () => {
  await scanListener.close()
  await scanQueue.close()
})

interface ScanSeed {
  status?: ScanStatus
  createdAt?: Date
  costUsd?: number
  inputTokens?: number
  outputTokens?: number
  cachedTokens?: number
  findingsHigh?: number
  findingsLow?: number
}

const insertScan = (owner: string, seed: ScanSeed = {}) =>
  db.insert(schema.scan).values({
    userId: owner,
    targets: ['https://example.com/'],
    scanMode: 'quick',
    status: 'completed',
    ...seed,
  })

type Dashboard = {
  kpis: {
    runs: Record<'total' | 'completed' | 'failed' | 'stopped' | 'running', number>
    tokens: Record<'input' | 'output' | 'cached', number>
    costUsd: number
    findings: Record<'critical' | 'high' | 'medium' | 'low' | 'info', number>
  }
  series: {
    granularity: 'day' | 'month'
    points: { bucket: string; runs: number; tokens: number; costUsd: number }[]
  }
  statusCounts: Record<ScanStatus, number>
  admin?: {
    users: { total: number; active: number }
    health: { queued: number; running: number; failureRate: number | null }
    perUser: {
      userId: string
      name: string
      email: string
      runs: number
      tokens: number
      costUsd: number
      findings: number
    }[]
  }
}

async function get(cookie: string | null, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString()
  const res = await request(`/api/v1/dashboard${qs ? `?${qs}` : ''}`, {
    headers: cookie ? { cookie } : {},
  })
  return { res, body: (await res.json()) as Dashboard & { error?: { code: string } } }
}

describe('GET /api/v1/dashboard', () => {
  test('requires a session', async () => {
    const { res } = await get(null)
    expect(res.status).toBe(401)
  })

  test('members see only their own scans and no admin block', async () => {
    await insertScan(aliceId, {
      costUsd: 1.25,
      inputTokens: 100,
      outputTokens: 50,
      findingsHigh: 2,
    })
    await insertScan(bobId, { costUsd: 2 })
    const { res, body } = await get(alice)
    expect(res.status).toBe(200)
    expect(body.kpis.runs.total).toBe(1)
    expect(body.kpis.costUsd).toBe(1.25)
    expect(body.kpis.tokens).toEqual({ input: 100, output: 50, cached: 0 })
    expect(body.kpis.findings.high).toBe(2)
    expect(body.admin).toBeUndefined()
  })

  test('members cannot ask for everyone', async () => {
    const { res, body } = await get(alice, { scope: 'all' })
    expect(res.status).toBe(403)
    expect(body.error!.code).toBe('FORBIDDEN')
  })

  test('admins default to everyone, with per-user totals sorted by cost', async () => {
    await insertScan(aliceId, { costUsd: 1, findingsHigh: 1, findingsLow: 2 })
    await insertScan(bobId, { costUsd: 3, inputTokens: 10, outputTokens: 5 })
    const { body } = await get(admin)
    expect(body.kpis.runs.total).toBe(2)
    expect(body.kpis.costUsd).toBe(4)
    expect(body.admin!.users).toEqual({ total: 3, active: 2 })
    expect(body.admin!.perUser.map((u) => u.email)).toEqual([
      'bob@example.com',
      'alice@example.com',
    ])
    expect(body.admin!.perUser[0]).toMatchObject({ runs: 1, tokens: 15, costUsd: 3, findings: 0 })
    expect(body.admin!.perUser[1]).toMatchObject({ findings: 3 })
  })

  test('admin scope=me narrows kpis but not the admin block', async () => {
    await insertScan(aliceId, { costUsd: 1 })
    const { body } = await get(admin, { scope: 'me' })
    expect(body.kpis.runs.total).toBe(0)
    expect(body.admin!.perUser).toHaveLength(1)
    expect(body.admin!.users.active).toBe(1)
  })

  test('filters by inclusive start and end', async () => {
    await insertScan(aliceId, { createdAt: new Date('2026-09-01T00:00:00Z') })
    await insertScan(aliceId, { createdAt: new Date('2026-09-10T00:00:00Z') })
    await insertScan(aliceId, { createdAt: new Date('2026-09-20T00:00:00Z') })
    const bounded = await get(alice, {
      start: '2026-09-01T00:00:00Z',
      end: '2026-09-10T00:00:00Z',
    })
    expect(bounded.body.kpis.runs.total).toBe(2)
    const openStart = await get(alice, { end: '2026-09-15T00:00:00Z' })
    expect(openStart.body.kpis.runs.total).toBe(2)
    expect(openStart.body.series.points[0]!.bucket).toBe('2026-09-01')
  })

  test('rejects bad bounds with INVALID_RANGE', async () => {
    const queries: Record<string, string>[] = [
      { start: 'yesterday' },
      { start: '2026-09-01T00:00:00' }, // no offset
      { start: '2026-02-30T00:00:00Z' }, // no such day
      { start: '2026-09-01T25:00:00Z' }, // no such hour
      { start: '0000-01-01T00:00:00Z' }, // before any scan could exist; Postgres rejects year 0
      { start: '2026-09-10T00:00:00Z', end: '2026-09-01T00:00:00Z' },
    ]
    for (const query of queries) {
      const { res, body } = await get(alice, query)
      expect(res.status).toBe(400)
      expect(body.error!.code).toBe('INVALID_RANGE')
    }
  })

  test('buckets days in the offset of start and zero-fills', async () => {
    await insertScan(aliceId, { createdAt: new Date('2026-09-01T20:00:00Z'), costUsd: 0.5 })
    const { body } = await get(alice, {
      start: '2026-09-01T00:00:00+07:00',
      end: '2026-09-03T23:59:59+07:00',
    })
    expect(body.series.granularity).toBe('day')
    expect(body.series.points).toEqual([
      { bucket: '2026-09-01', runs: 0, tokens: 0, costUsd: 0 },
      { bucket: '2026-09-02', runs: 1, tokens: 0, costUsd: 0.5 },
      { bucket: '2026-09-03', runs: 0, tokens: 0, costUsd: 0 },
    ])
  })

  test('negative offset', async () => {
    await insertScan(aliceId, { createdAt: new Date('2026-09-02T03:00:00Z') })
    const { body } = await get(alice, {
      start: '2026-09-01T00:00:00-05:00',
      end: '2026-09-02T23:59:59-05:00',
    })
    expect(body.series.points.map((p) => [p.bucket, p.runs])).toEqual([
      ['2026-09-01', 1],
      ['2026-09-02', 0],
    ])
  })

  test('switches to months for spans over 92 days', async () => {
    await insertScan(aliceId, { createdAt: new Date('2026-03-15T00:00:00Z') })
    const { body } = await get(alice, {
      start: '2026-01-01T00:00:00Z',
      end: '2026-09-24T00:00:00Z',
    })
    expect(body.series.granularity).toBe('month')
    expect(body.series.points.map((p) => p.bucket)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ])
    expect(body.series.points[2]!.runs).toBe(1)
  })

  test('zero-length range', async () => {
    const { res, body } = await get(alice, {
      start: '2026-09-01T00:00:00Z',
      end: '2026-09-01T00:00:00Z',
    })
    expect(res.status).toBe(200)
    expect(body.series.points.map((p) => p.bucket)).toEqual(['2026-09-01'])
  })

  test('empty range', async () => {
    const open = await get(admin)
    expect(open.body.kpis.costUsd).toBe(0)
    expect(open.body.series.points).toEqual([])
    expect(open.body.admin!.health.failureRate).toBeNull()
    const bounded = await get(alice, {
      start: '2026-09-01T00:00:00Z',
      end: '2026-09-02T00:00:00Z',
    })
    expect(bounded.body.series.points).toHaveLength(2)
  })

  test('status counts, live health and failure rate', async () => {
    for (const status of ['completed', 'failed', 'stopped', 'queued', 'running'] as const) {
      await insertScan(aliceId, { status })
    }
    const { body } = await get(admin)
    expect(body.statusCounts).toEqual({
      queued: 1,
      running: 1,
      stopping: 0,
      completed: 1,
      failed: 1,
      stopped: 1,
    })
    expect(body.kpis.runs).toEqual({ total: 5, completed: 1, failed: 1, stopped: 1, running: 1 })
    expect(body.admin!.health.queued).toBe(1)
    expect(body.admin!.health.running).toBe(1)
    expect(body.admin!.health.failureRate).toBeCloseTo(1 / 3)
  })

  test('sums are numbers', async () => {
    await insertScan(aliceId, { costUsd: 0.1234, inputTokens: 5_000_000_000 })
    const { body } = await get(alice)
    expect(typeof body.kpis.costUsd).toBe('number')
    expect(body.kpis.costUsd).toBe(0.1234)
    expect(body.kpis.tokens.input).toBe(5_000_000_000)
  })
})
