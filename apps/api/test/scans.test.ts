import { schema } from '@strix-panel/db'
import { notifyScanUpdate } from '@strix-panel/db/notify'
import { createReportWorker } from '@strix-panel/db/queue'
import type { BudgetWindow } from '@strix-panel/shared'
import { reportPdfPath } from '@strix-panel/shared/env'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, test } from 'bun:test'
import { db } from '../src/lib/db'
import { env } from '../src/lib/env'
import { reportQueue, scanQueue } from '../src/lib/queue'
import { request, signUp } from './helpers'

let admin: string
let alice: string
let bob: string

beforeEach(async () => {
  await db.delete(schema.user)
  await scanQueue.obliterate({ force: true })
  await reportQueue.obliterate({ force: true })
  admin = (await signUp('admin@example.com')).cookie
  alice = (await signUp('alice@example.com')).cookie
  bob = (await signUp('bob@example.com')).cookie
})

const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ targets: ['https://example.com'], scanMode: 'quick', ...over })

async function create(cookie: string, over: Record<string, unknown> = {}) {
  const res = await request('/api/v1/scans', {
    method: 'POST',
    body: body(over),
    headers: { cookie },
  })
  return { res, scan: (await res.json()) as Record<string, unknown> & { id: string } }
}

const setStatus = (id: string, status: 'running' | 'completed') =>
  db.update(schema.scan).set({ status }).where(eq(schema.scan.id, id))

const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code

describe('POST /api/v1/scans', () => {
  test('creates a queued scan, normalizes targets and enqueues a job', async () => {
    const { res, scan } = await create(alice, {
      name: '  Shop  ',
      targets: ['https://Example.com', 'https://example.com/', 'http://localhost:8080/app'],
      maxBudgetUsd: 2.5,
    })
    expect(res.status).toBe(201)
    expect(scan).toMatchObject({
      name: 'Shop',
      targets: ['https://example.com/', 'http://localhost:8080/app'],
      scanMode: 'quick',
      status: 'queued',
      maxBudgetUsd: 2.5,
      costUsd: 0,
      hasReport: false,
      agents: [],
      findings: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    })
    expect((scan.owner as { email: string }).email).toBe('alice@example.com')
    const job = await scanQueue.getJob(scan.id)
    expect(job?.data).toEqual({ scanId: scan.id })
  })

  test('rejects targets that are not http(s) URLs', async () => {
    for (const target of ['ftp://example.com', 'example.com', 'file:///tmp/x']) {
      const { res, scan } = await create(alice, { targets: [target] })
      expect(res.status).toBe(400)
      expect((scan.error as { code: string }).code).toBe('INVALID_TARGET')
    }
  })

  test('rejects more than three targets, an empty list and a non-positive budget', async () => {
    const tooMany = await create(alice, {
      targets: ['https://a.example', 'https://b.example', 'https://c.example', 'https://d.example'],
    })
    expect(tooMany.res.status).toBe(422)
    const none = await create(alice, { targets: [] })
    expect(none.res.status).toBe(422)
    const budget = await create(alice, { maxBudgetUsd: 0 })
    expect(budget.res.status).toBe(422)
  })

  test('requires a session', async () => {
    const res = await request('/api/v1/scans', { method: 'POST', body: body() })
    expect(res.status).toBe(401)
  })
})

describe('visibility', () => {
  test('users see their own scans, admins see all with owners', async () => {
    const mine = await create(alice)
    const theirs = await create(bob)

    const asAlice = (await (
      await request('/api/v1/scans', { headers: { cookie: alice } })
    ).json()) as { items: { id: string }[]; total: number }
    expect(asAlice.items.map((s) => s.id)).toEqual([mine.scan.id])
    expect(asAlice.total).toBe(1)

    const asAdmin = (await (
      await request('/api/v1/scans?pageSize=1&page=2', { headers: { cookie: admin } })
    ).json()) as { items: { id: string; owner: { email: string } }[]; total: number; page: number }
    expect(asAdmin.total).toBe(2)
    expect(asAdmin.page).toBe(2)
    expect(asAdmin.items).toHaveLength(1)
    expect(asAdmin.items[0]!.id).toBe(mine.scan.id)
    expect(asAdmin.items[0]!.owner.email).toBe('alice@example.com')

    expect(
      (await request(`/api/v1/scans/${theirs.scan.id}`, { headers: { cookie: alice } })).status,
    ).toBe(404)
    expect(
      (await request(`/api/v1/scans/${theirs.scan.id}/events`, { headers: { cookie: alice } }))
        .status,
    ).toBe(404)
    expect(
      (await request(`/api/v1/scans/${theirs.scan.id}/findings`, { headers: { cookie: alice } }))
        .status,
    ).toBe(404)
    expect(
      (await request(`/api/v1/scans/${theirs.scan.id}`, { headers: { cookie: admin } })).status,
    ).toBe(200)
  })
})

describe('GET /api/v1/scans filters', () => {
  type List = {
    items: { id: string }[]
    total: number
    counts: Record<'all' | 'active' | 'completed' | 'failed' | 'stopped', number>
  }
  const list = async (cookie: string, query: string) => {
    const res = await request(`/api/v1/scans?${query}`, { headers: { cookie } })
    expect(res.status).toBe(200)
    return (await res.json()) as List
  }
  const ids = (l: List) => l.items.map((s) => s.id).sort()
  const statusOf = (id: string, status: 'running' | 'stopping' | 'failed' | 'stopped') =>
    db.update(schema.scan).set({ status }).where(eq(schema.scan.id, id))

  test('search matches name or any target, case-insensitively, and escapes wildcards', async () => {
    const shop = await create(alice, { name: 'Shop API' })
    const blog = await create(alice, { targets: ['https://a.example', 'https://Blog.example'] })
    const pct = await create(alice, { name: '100% coverage' })

    expect(ids(await list(alice, 'q=shop'))).toEqual([shop.scan.id])
    expect(ids(await list(alice, 'q=BLOG.'))).toEqual([blog.scan.id])
    expect(ids(await list(alice, 'q=%25'))).toEqual([pct.scan.id])
    expect(ids(await list(alice, 'q=_'))).toEqual([])
    expect((await list(alice, 'q=%20%20')).total).toBe(3)
  })

  test('tabs group statuses and counts ignore the tab but respect search', async () => {
    const queued = await create(alice, { name: 'one' })
    const running = await create(alice, { name: 'two' })
    const stopping = await create(alice, { name: 'three' })
    const done = await create(alice, { name: 'four' })
    const failed = await create(alice, { name: 'five' })
    const stopped = await create(alice, { name: 'six' })
    await statusOf(running.scan.id, 'running')
    await statusOf(stopping.scan.id, 'stopping')
    await setStatus(done.scan.id, 'completed')
    await statusOf(failed.scan.id, 'failed')
    await statusOf(stopped.scan.id, 'stopped')

    const active = await list(alice, 'tab=active')
    expect(ids(active)).toEqual([queued.scan.id, running.scan.id, stopping.scan.id].sort())
    expect(active.total).toBe(3)
    expect(active.counts).toEqual({ all: 6, active: 3, completed: 1, failed: 1, stopped: 1 })
    expect(ids(await list(alice, 'tab=completed'))).toEqual([done.scan.id])
    expect(ids(await list(alice, 'tab=failed'))).toEqual([failed.scan.id])
    expect(ids(await list(alice, 'tab=stopped'))).toEqual([stopped.scan.id])
    expect((await list(alice, '')).total).toBe(6)

    const searched = await list(alice, 'q=f&tab=completed')
    expect(searched.counts).toEqual({ all: 2, active: 0, completed: 1, failed: 1, stopped: 0 })

    const bad = await request('/api/v1/scans?tab=queued', { headers: { cookie: alice } })
    expect(bad.status).toBe(422)
  })

  test('admins filter by owner; users cannot widen or change their scope with it', async () => {
    const mine = await create(alice)
    const theirs = await create(bob)
    const bobId = (
      await db.select().from(schema.user).where(eq(schema.user.email, 'bob@example.com'))
    )[0]!.id

    const asAdmin = await list(admin, `ownerId=${bobId}`)
    expect(ids(asAdmin)).toEqual([theirs.scan.id])
    expect(asAdmin.counts.all).toBe(1)

    expect(ids(await list(alice, `ownerId=${bobId}`))).toEqual([mine.scan.id])
  })
})

describe('events, findings and report', () => {
  test('events come back oldest first and support ?after', async () => {
    const { scan } = await create(alice)
    const inserted = await db
      .insert(schema.scanEvent)
      .values([
        { scanId: scan.id, type: 'status', message: 'Scan started' },
        {
          scanId: scan.id,
          type: 'agent_started',
          message: 'Agent root started',
          data: { agentId: 'root' },
        },
      ])
      .returning({ id: schema.scanEvent.id })

    const all = (await (
      await request(`/api/v1/scans/${scan.id}/events`, { headers: { cookie: alice } })
    ).json()) as { id: string; message: string }[]
    expect(all.map((e) => e.message)).toEqual(['Scan started', 'Agent root started'])

    const after = (await (
      await request(`/api/v1/scans/${scan.id}/events?after=${inserted[0]!.id}`, {
        headers: { cookie: alice },
      })
    ).json()) as { id: string }[]
    expect(after.map((e) => e.id)).toEqual([inserted[1]!.id])
  })

  test('findings are ordered by severity and the report downloads once it exists', async () => {
    const { scan } = await create(alice)
    const foundAt = new Date()
    await db.insert(schema.scanFinding).values([
      {
        scanId: scan.id,
        strixId: 'vuln-0001',
        title: 'Low one',
        severity: 'low',
        foundAt,
        report: {},
      },
      {
        scanId: scan.id,
        strixId: 'vuln-0002',
        title: 'Critical one',
        severity: 'critical',
        foundAt,
        report: { a: 1 },
      },
    ])
    const findings = (await (
      await request(`/api/v1/scans/${scan.id}/findings`, { headers: { cookie: alice } })
    ).json()) as { strixId: string; report: unknown }[]
    expect(findings.map((f) => f.strixId)).toEqual(['vuln-0002', 'vuln-0001'])
    expect(findings[0]!.report).toEqual({ a: 1 })

    const missing = await request(`/api/v1/scans/${scan.id}/report.md`, {
      headers: { cookie: alice },
    })
    expect(missing.status).toBe(404)
    expect(await errorCode(missing)).toBe('REPORT_NOT_AVAILABLE')

    await db.update(schema.scan).set({ reportMd: '# Report\n' }).where(eq(schema.scan.id, scan.id))
    const res = await request(`/api/v1/scans/${scan.id}/report.md`, { headers: { cookie: alice } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/markdown')
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="strix-report-${scan.id}.md"`,
    )
    expect(await res.text()).toBe('# Report\n')
  })
})

describe('PDF report', () => {
  const pdfStatus = (id: string, cookie: string, method = 'GET') =>
    request(`/api/v1/scans/${id}/report-pdf`, { method, headers: { cookie } })

  test('only a completed scan has one, and only its viewers see it', async () => {
    const { scan } = await create(alice)
    const running = await pdfStatus(scan.id, alice, 'POST')
    expect(running.status).toBe(409)
    expect(await errorCode(running)).toBe('REPORT_NOT_AVAILABLE')

    await setStatus(scan.id, 'completed')
    expect((await pdfStatus(scan.id, bob, 'POST')).status).toBe(404)
    expect((await pdfStatus(scan.id, admin)).status).toBe(200)
  })

  test('a request queues one render, and the PDF downloads once the worker wrote it', async () => {
    const { scan } = await create(alice)
    await setStatus(scan.id, 'completed')

    expect(await (await pdfStatus(scan.id, alice)).json()).toEqual({ state: 'none', error: null })
    const started = await pdfStatus(scan.id, alice, 'POST')
    expect(await started.json()).toEqual({ state: 'pending', error: null })
    expect((await reportQueue.getJob(scan.id))?.data).toEqual({ scanId: scan.id })
    expect(await (await pdfStatus(scan.id, alice, 'POST')).json()).toEqual({
      state: 'pending',
      error: null,
    })
    expect(await reportQueue.getJobCounts()).toMatchObject({ waiting: 1 })

    const notYet = await request(`/api/v1/scans/${scan.id}/report.pdf`, {
      headers: { cookie: alice },
    })
    expect(notYet.status).toBe(404)

    await Bun.write(reportPdfPath(env.REPORT_DIR, scan.id), '%PDF-1.4 fake')
    expect(await (await pdfStatus(scan.id, alice)).json()).toEqual({ state: 'ready', error: null })
    const res = await request(`/api/v1/scans/${scan.id}/report.pdf`, {
      headers: { cookie: alice },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="strix-report-${scan.id}.pdf"`,
    )
    expect(await res.text()).toBe('%PDF-1.4 fake')
  })

  test('a failed render reports why, and the next request retries it', async () => {
    const { scan } = await create(alice)
    await setStatus(scan.id, 'completed')
    const failed = Promise.withResolvers<void>()
    const worker = createReportWorker(env.DATABASE_URL, async () => {
      throw new Error('Rendering the PDF failed: boom')
    })
    worker.on('failed', () => failed.resolve())
    await pdfStatus(scan.id, alice, 'POST')
    await failed.promise
    await worker.close()

    expect(await (await pdfStatus(scan.id, alice)).json()).toEqual({
      state: 'failed',
      error: 'Rendering the PDF failed: boom',
    })
    expect(await (await pdfStatus(scan.id, alice, 'POST')).json()).toEqual({
      state: 'pending',
      error: null,
    })
    expect(await (await reportQueue.getJob(scan.id))?.getState()).toBe('waiting')
  })
})

describe('POST /api/v1/scans/:id/stop', () => {
  const stop = (id: string, cookie: string) =>
    request(`/api/v1/scans/${id}/stop`, { method: 'POST', headers: { cookie } })

  test('a queued scan is cancelled and its job removed', async () => {
    const { scan } = await create(alice)
    const res = await stop(scan.id, alice)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { status: string }).status).toBe('stopped')
    expect(await scanQueue.getJob(scan.id)).toBeUndefined()
  })

  test('a running scan moves to stopping; finished scans conflict; others get 404', async () => {
    const { scan } = await create(alice)
    await setStatus(scan.id, 'running')
    expect(((await (await stop(scan.id, alice)).json()) as { status: string }).status).toBe(
      'stopping',
    )

    await setStatus(scan.id, 'completed')
    const done = await stop(scan.id, alice)
    expect(done.status).toBe(409)
    expect(await errorCode(done)).toBe('SCAN_NOT_RUNNING')

    expect((await stop(scan.id, bob)).status).toBe(404)
  })
})

describe('POST /api/v1/scans/:id/resume', () => {
  const resume = (id: string, cookie: string) =>
    request(`/api/v1/scans/${id}/resume`, { method: 'POST', headers: { cookie } })
  const end = (id: string, over: Partial<typeof schema.scan.$inferInsert> = {}) =>
    db
      .update(schema.scan)
      .set({ status: 'failed', error: 'boom', finishedAt: new Date(), ...over })
      .where(eq(schema.scan.id, id))
  const agents = [
    { id: 'root', name: 'StrixAgent', parentId: null, status: 'running', error: null },
  ]
  const messages = async (id: string) =>
    (await db.select().from(schema.scanEvent).where(eq(schema.scanEvent.scanId, id))).map(
      (e) => e.message,
    )

  test('a scan that failed before Strix started is queued again with a fresh job', async () => {
    const { scan } = await create(alice)
    await end(scan.id)
    const res = await resume(scan.id, admin)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'queued', error: null, finishedAt: null })
    expect((await scanQueue.getJob(scan.id))?.data).toEqual({ scanId: scan.id })
    expect(await messages(scan.id)).toContain('Scan resumed')
  })

  test('a failed or stopped run with saved agents keeps its run, usage and start time', async () => {
    const { scan } = await create(alice, { maxBudgetUsd: 5 })
    const startedAt = new Date('2026-09-01T00:00:00Z')
    await end(scan.id, { runName: 'example-com_a1b2', agents, costUsd: 1.5, startedAt })
    const res = await resume(scan.id, alice)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      status: 'queued',
      runName: 'example-com_a1b2',
      costUsd: 1.5,
      error: null,
      finishedAt: null,
      startedAt: startedAt.toISOString(),
    })

    const { scan: stopped } = await create(alice)
    await end(stopped.id, { status: 'stopped', error: null, runName: 'x_1', agents })
    expect((await resume(stopped.id, alice)).status).toBe(200)
  })

  test('live, completed, snapshot-less and over-budget scans conflict; others get 404', async () => {
    const { scan } = await create(alice, { maxBudgetUsd: 2 })
    const queued = await resume(scan.id, alice)
    expect(queued.status).toBe(409)
    expect(await errorCode(queued)).toBe('SCAN_NOT_RESUMABLE')

    await setStatus(scan.id, 'completed')
    expect(await errorCode(await resume(scan.id, alice))).toBe('SCAN_NOT_RESUMABLE')

    await end(scan.id, { runName: 'example-com_a1b2' })
    const empty = await resume(scan.id, alice)
    expect(empty.status).toBe(409)
    expect(await errorCode(empty)).toBe('SCAN_NOT_RESUMABLE')

    await end(scan.id, { runName: 'example-com_a1b2', agents, costUsd: 2 })
    const broke = await resume(scan.id, alice)
    expect(broke.status).toBe(409)
    expect(await errorCode(broke)).toBe('SCAN_BUDGET_EXHAUSTED')

    expect((await resume(scan.id, bob)).status).toBe(404)
  })
})

describe('user budget', () => {
  const setBudget = (budgetUsd: number | null, budgetWindow: BudgetWindow = 'month') =>
    db
      .update(schema.user)
      .set({ budgetUsd, budgetWindow })
      .where(eq(schema.user.email, 'alice@example.com'))
  const spend = async (costUsd: number) => {
    const { scan } = await create(alice)
    await db
      .update(schema.scan)
      .set({ status: 'completed', costUsd })
      .where(eq(schema.scan.id, scan.id))
    return scan
  }

  test('refuses to start below the minimum, and with a zero budget', async () => {
    await setBudget(10)
    await spend(8)
    const low = await create(alice)
    expect(low.res.status).toBe(403)
    expect(low.scan.error).toEqual({
      code: 'BUDGET_INSUFFICIENT',
      message: 'You have $2.00 of budget left; at least $3.00 is needed to start a scan',
    })

    await setBudget(0)
    const none = await create(alice)
    expect(none.res.status).toBe(403)
    expect((none.scan.error as { code: string }).code).toBe('BUDGET_INSUFFICIENT')
  })

  test('the cap cannot exceed what is left; equal or empty is fine', async () => {
    await setBudget(10)
    await spend(1.995)
    const over = await create(alice, { maxBudgetUsd: 8.01 })
    expect(over.res.status).toBe(400)
    expect(over.scan.error).toEqual({
      code: 'BUDGET_EXCEEDED',
      message: 'At most $8.00 is left in your budget',
    })
    const exact = await create(alice, { maxBudgetUsd: 8 })
    expect(exact.res.status).toBe(201)
    const empty = await create(alice)
    expect(empty.res.status).toBe(201)
    expect(empty.scan.maxBudgetUsd).toBeNull()
  })

  test('spend outside the window does not count, and unlimited users are not limited', async () => {
    await setBudget(5, 'week')
    const old = await spend(100)
    await db
      .update(schema.scan)
      .set({ createdAt: new Date('2020-01-01T00:00:00Z') })
      .where(eq(schema.scan.id, old.id))
    expect((await create(alice, { maxBudgetUsd: 5 })).res.status).toBe(201)

    await setBudget(null)
    expect((await create(alice, { maxBudgetUsd: 1000 })).res.status).toBe(201)
  })

  test('resume needs the minimum too', async () => {
    const scan = await spend(9)
    await db.update(schema.scan).set({ status: 'failed' }).where(eq(schema.scan.id, scan.id))
    await setBudget(10)
    const res = await request(`/api/v1/scans/${scan.id}/resume`, {
      method: 'POST',
      headers: { cookie: alice },
    })
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('BUDGET_INSUFFICIENT')
  })

  test("resume checks the owner's budget, not the admin's", async () => {
    const scan = await spend(9)
    await db.update(schema.scan).set({ status: 'failed' }).where(eq(schema.scan.id, scan.id))
    const resume = () =>
      request(`/api/v1/scans/${scan.id}/resume`, { method: 'POST', headers: { cookie: admin } })
    await db
      .update(schema.user)
      .set({ budgetUsd: 0 })
      .where(eq(schema.user.email, 'admin@example.com'))
    await setBudget(10)
    const refused = await resume()
    expect(refused.status).toBe(403)
    expect(await errorCode(refused)).toBe('BUDGET_INSUFFICIENT')
    await setBudget(null)
    expect((await resume()).status).toBe(200)
  })

  test('a limited user cannot resume a scan from an earlier budget window', async () => {
    const scan = await spend(1)
    await db
      .update(schema.scan)
      .set({ status: 'failed', createdAt: new Date('2020-01-01T00:00:00Z') })
      .where(eq(schema.scan.id, scan.id))
    await setBudget(10)
    const res = await request(`/api/v1/scans/${scan.id}/resume`, {
      method: 'POST',
      headers: { cookie: alice },
    })
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('BUDGET_WINDOW_CLOSED')
    await setBudget(10, 'forever')
    const forever = await request(`/api/v1/scans/${scan.id}/resume`, {
      method: 'POST',
      headers: { cookie: alice },
    })
    expect(forever.status).toBe(200)
  })

  test('GET /api/v1/me/budget reports limit, spend and window', async () => {
    const get = async () =>
      (await (await request('/api/v1/me/budget', { headers: { cookie: alice } })).json()) as Record<
        string,
        unknown
      >
    expect(await get()).toMatchObject({
      limitUsd: null,
      window: 'month',
      spentUsd: 0,
      remainingUsd: null,
      minToStartUsd: 3,
    })
    await spend(1.5)
    await setBudget(10, 'forever')
    expect(await get()).toEqual({
      limitUsd: 10,
      window: 'forever',
      spentUsd: 1.5,
      remainingUsd: 8.5,
      minToStartUsd: 3,
      windowStartsAt: null,
      resetsAt: null,
    })
  })
})

describe('GET /api/v1/scans/:id/stream', () => {
  // Reads SSE frames until `until` matches or the stream ends. Frames are separated by a blank line.
  async function readFrames(res: Response, until: (frames: string[]) => boolean) {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const frames: string[] = []
    while (!until(frames)) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      frames.push(...parts.filter(Boolean))
    }
    return { frames, reader }
  }

  test('sends a snapshot, then updates after a notify, and closes when the scan finishes', async () => {
    const { scan } = await create(alice)
    await setStatus(scan.id, 'running')
    const controller = new AbortController()
    const res = await request(`/api/v1/scans/${scan.id}/stream`, {
      headers: { cookie: alice },
      signal: controller.signal,
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('cache-control')).toContain('no-transform')

    const { frames, reader } = await readFrames(res, (f) => f.length >= 1)
    expect(frames[0]).toContain('event: snapshot')
    expect(frames[0]).toContain(`"id":"${scan.id}"`)

    await db.insert(schema.scanEvent).values({
      scanId: scan.id,
      type: 'finding',
      message: 'HIGH: Something',
      data: { findingId: 'vuln-0001', severity: 'high' },
    })
    await notifyScanUpdate(db, scan.id)
    const more = await (async () => {
      const collected = [...frames]
      while (!collected.some((f) => f.includes('event: findings'))) {
        const { value, done } = await reader.read()
        if (done) break
        const text = typeof value === 'string' ? value : new TextDecoder().decode(value)
        collected.push(...text.split('\n\n').filter(Boolean))
      }
      return collected
    })()
    expect(more.some((f) => f.includes('event: scan\n'))).toBe(true)
    expect(more.some((f) => f.includes('event: event\n') && f.includes('HIGH: Something'))).toBe(
      true,
    )

    await setStatus(scan.id, 'completed')
    await notifyScanUpdate(db, scan.id)
    let ended = false
    for (let i = 0; i < 10 && !ended; i++) ended = (await reader.read()).done
    expect(ended).toBe(true)
    controller.abort()
  }, 15_000)

  test('closes an open stream once the viewer is signed out (disabled or removed)', async () => {
    const { scan } = await create(alice)
    await setStatus(scan.id, 'running')
    const controller = new AbortController()
    const res = await request(`/api/v1/scans/${scan.id}/stream`, {
      headers: { cookie: alice },
      signal: controller.signal,
    })
    const { reader } = await readFrames(res, (f) => f.length >= 1)

    await db.delete(schema.session)
    await notifyScanUpdate(db, scan.id)
    const frames: string[] = []
    let ended = false
    for (let i = 0; i < 10 && !ended; i++) {
      const { value, done } = await reader.read()
      ended = done
      if (value) frames.push(typeof value === 'string' ? value : new TextDecoder().decode(value))
    }
    expect(ended).toBe(true)
    expect(frames.some((f) => f.includes('event: scan\n'))).toBe(false)
    controller.abort()
  }, 15_000)

  test('is a 404 for scans the viewer cannot see', async () => {
    const { scan } = await create(bob)
    const res = await request(`/api/v1/scans/${scan.id}/stream`, { headers: { cookie: alice } })
    expect(res.status).toBe(404)
  })
})

describe('pending approval', () => {
  const pend = (email: string) =>
    db.update(schema.user).set({ approvedAt: null }).where(eq(schema.user.email, email))

  test('a pending user cannot create a scan', async () => {
    await pend('alice@example.com')
    const { res, scan } = await create(alice)
    expect(res.status).toBe(403)
    expect((scan.error as { code: string }).code).toBe('PENDING_APPROVAL')
  })

  test('a pending user cannot resume a scan', async () => {
    const { scan } = await create(alice)
    await db.update(schema.scan).set({ status: 'failed' }).where(eq(schema.scan.id, scan.id))
    await pend('alice@example.com')
    const res = await request(`/api/v1/scans/${scan.id}/resume`, {
      method: 'POST',
      headers: { cookie: alice },
    })
    expect(res.status).toBe(403)
    expect(await errorCode(res)).toBe('PENDING_APPROVAL')
  })
})

describe('removed owners', () => {
  test('scan owner is marked removed', async () => {
    const { scan } = await create(alice)
    expect((scan.owner as { removed: boolean }).removed).toBe(false)
    await db
      .update(schema.user)
      .set({ deletedAt: new Date() })
      .where(eq(schema.user.email, 'alice@example.com'))
    const res = await request(`/api/v1/scans/${scan.id}`, { headers: { cookie: admin } })
    expect(((await res.json()) as { owner: { removed: boolean } }).owner.removed).toBe(true)
  })
})
