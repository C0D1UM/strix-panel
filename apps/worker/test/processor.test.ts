import { createDb, schema } from '@strix-panel/db'
import type { ScanJob } from '@strix-panel/db/queue'
import { asc, eq } from 'drizzle-orm'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { createScanProcessor, strixEnv } from '../src/processor'
import type { Sandboxes } from '../src/sandbox'
import { createScanStore } from '../src/scan-store'

const { db, pool } = createDb(process.env.DATABASE_URL!)
const store = createScanStore(db)
const FAKE_STRIX = join(import.meta.dir, 'fixtures', 'fake-strix.sh')

afterAll(() => pool.end())

let userId: string
beforeEach(async () => {
  await db.delete(schema.user)
  const [user] = await db
    .insert(schema.user)
    .values({ name: 'Owner', email: `owner-${crypto.randomUUID()}@example.com` })
    .returning()
  userId = user!.id
})

async function createScan(status: 'queued' | 'running' = 'queued') {
  const [scan] = await db
    .insert(schema.scan)
    .values({
      userId,
      targets: ['https://example.com/'],
      scanMode: 'quick',
      status,
      maxBudgetUsd: 5,
    })
    .returning()
  return scan!
}

async function processor(scenario: string) {
  const workDir = await mkdtemp(join(tmpdir(), 'strix-worker-'))
  const removed: string[] = []
  const sandboxes: Sandboxes = {
    remove: async (scanId) => void removed.push(scanId),
    scanIds: async () => [],
  }
  const process = createScanProcessor({
    store,
    sandboxes,
    strixBin: FAKE_STRIX,
    workDir,
    pollIntervalMs: 100,
    env: { ...strixEnv(), FAKE_STRIX_SCENARIO: scenario },
    sigtermAfterMs: 2000,
    sigkillAfterMs: 4000,
  })
  return {
    workDir,
    removed,
    process: (scanId: string) => process({ id: scanId, data: { scanId } } as ScanJob),
  }
}

const load = (id: string) => db.query.scan.findFirst({ where: eq(schema.scan.id, id) })
const events = (id: string) =>
  db
    .select()
    .from(schema.scanEvent)
    .where(eq(schema.scanEvent.scanId, id))
    .orderBy(asc(schema.scanEvent.id))

test('a completed run mirrors usage, agents, findings and the report', async () => {
  const scan = await createScan()
  const { workDir, removed, process } = await processor('completed')
  await process(scan.id)

  const done = (await load(scan.id))!
  expect(done.status).toBe('completed')
  expect(removed).toEqual([scan.id])
  expect(done.runName).toBe('example-com_ab12')
  expect(done).toMatchObject({
    requests: 4,
    inputTokens: 6000,
    outputTokens: 1000,
    cachedTokens: 2500,
    costUsd: 0.25,
  })
  expect(done.findingsHigh).toBe(1)
  expect(done.reportMd).toContain('All good')
  expect(done.startedAt).toBeInstanceOf(Date)
  expect(done.finishedAt).toBeInstanceOf(Date)
  expect(done.agents.map((a) => [a.id, a.status])).toEqual([
    ['root', 'completed'],
    ['child', 'failed'],
  ])

  const findings = await db
    .select()
    .from(schema.scanFinding)
    .where(eq(schema.scanFinding.scanId, scan.id))
  expect(findings).toHaveLength(1)
  expect(findings[0]).toMatchObject({
    strixId: 'vuln-0001',
    severity: 'high',
    cvss: 7.1,
    endpoint: '/search',
  })

  const types = (await events(scan.id)).map((e) => e.type)
  expect(types[0]).toBe('status')
  expect(types.at(-1)).toBe('status')
  expect(types).toContain('agent_started')
  expect(types).toContain('finding')
  expect(types).toContain('agent_failed')
  expect(types).toContain('agent_finished')

  // Strix received the scan as argv, and no DB credentials in its environment.
  const argv = (await Bun.file(join(workDir, scan.id, 'argv.txt')).text()).trim().split('\n')
  expect(argv).toEqual(['-n', '-t', 'https://example.com/', '-m', 'quick', '--max-budget', '5'])
  expect(strixEnv({ DATABASE_URL: 'x', STRIX_LLM: 'y' })).toEqual({ STRIX_LLM: 'y' })
  // Strix labels its sandbox containers with the scan id, so they can be removed afterwards.
  const labels = (await Bun.file(join(workDir, scan.id, 'labels.txt')).text()).trim().split('\n')
  expect(labels).toEqual([scan.id, 'strix-panel'])
})

test('a non-zero exit without completion fails the scan with the stderr tail', async () => {
  const scan = await createScan()
  const { removed, process } = await processor('failed')
  await process(scan.id)
  const done = (await load(scan.id))!
  expect(done.status).toBe('failed')
  expect(removed).toEqual([scan.id])
  expect(done.error).toContain('code 2')
  expect(done.error).toContain('no LLM configured')
})

test('a stop request signals Strix and ends as stopped', async () => {
  const scan = await createScan()
  const { removed, process } = await processor('hang')
  const running = process(scan.id)
  await Bun.sleep(400)
  await db.update(schema.scan).set({ status: 'stopping' }).where(eq(schema.scan.id, scan.id))
  await running
  expect((await load(scan.id))!.status).toBe('stopped')
  expect(removed).toEqual([scan.id])
}, 15_000)

test('a redelivered job for a running scan marks it failed instead of restarting it', async () => {
  const scan = await createScan('running')
  const { removed, process } = await processor('completed')
  await process(scan.id)
  const done = (await load(scan.id))!
  expect(done.status).toBe('failed')
  expect(done.error).toBe('Worker restarted during the scan')
  expect(removed).toEqual([scan.id])
})

test('a scan that is no longer queued is skipped', async () => {
  const scan = await createScan()
  await db.update(schema.scan).set({ status: 'stopped' }).where(eq(schema.scan.id, scan.id))
  const { process } = await processor('completed')
  await process(scan.id)
  expect((await load(scan.id))!.status).toBe('stopped')
  expect(await events(scan.id)).toHaveLength(0)
})
