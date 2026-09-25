import { schema } from '@strix-panel/db'
import { notifyScanUpdate } from '@strix-panel/db/notify'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, test } from 'bun:test'
import { db } from '../src/lib/db'
import { scanQueue } from '../src/lib/queue'
import { request, signUp } from './helpers'

let admin: string
let alice: string
let bob: string

beforeEach(async () => {
  await db.delete(schema.user)
  await scanQueue.obliterate({ force: true })
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

describe('POST /api/v1/scans/:id/retry', () => {
  const retry = (id: string, cookie: string) =>
    request(`/api/v1/scans/${id}/retry`, { method: 'POST', headers: { cookie } })
  const fail = (id: string, runName: string | null = null) =>
    db
      .update(schema.scan)
      .set({ status: 'failed', runName, error: 'boom', finishedAt: new Date() })
      .where(eq(schema.scan.id, id))

  test('a scan that failed before Strix started is queued again with a fresh job', async () => {
    const { scan } = await create(alice)
    await fail(scan.id)
    const res = await retry(scan.id, admin)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'queued', error: null, finishedAt: null })
    expect((await scanQueue.getJob(scan.id))?.data).toEqual({ scanId: scan.id })
    const events = await db
      .select()
      .from(schema.scanEvent)
      .where(eq(schema.scanEvent.scanId, scan.id))
    expect(events.map((e) => e.message)).toContain('Scan retried')
  })

  test('scans that ran Strix, or did not fail, conflict; others get 404', async () => {
    const { scan } = await create(alice)
    const queued = await retry(scan.id, alice)
    expect(queued.status).toBe(409)
    expect(await errorCode(queued)).toBe('SCAN_NOT_RETRYABLE')

    await fail(scan.id, 'example-com_a1b2')
    const ran = await retry(scan.id, alice)
    expect(ran.status).toBe(409)
    expect(await errorCode(ran)).toBe('SCAN_NOT_RETRYABLE')

    expect((await retry(scan.id, bob)).status).toBe(404)
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

  test('is a 404 for scans the viewer cannot see', async () => {
    const { scan } = await create(bob)
    const res = await request(`/api/v1/scans/${scan.id}/stream`, { headers: { cookie: alice } })
    expect(res.status).toBe(404)
  })
})
