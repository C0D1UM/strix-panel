import { createDb, schema } from '@strix-panel/db'
import type { ScanJob } from '@strix-panel/db/queue'
import type { ScanTarget } from '@strix-panel/shared'
import { asc, eq } from 'drizzle-orm'
import { exists, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
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

async function createScan(
  status: 'queued' | 'running' = 'queued',
  targets: ScanTarget[] = [{ type: 'url', value: 'https://example.com/' }],
) {
  const [scan] = await db
    .insert(schema.scan)
    .values({
      userId,
      targets,
      scanMode: 'quick',
      status,
      maxBudgetUsd: 5,
    })
    .returning()
  return scan!
}

async function processor(scenario: string, reuseWorkDir?: string) {
  const workDir = reuseWorkDir ?? (await mkdtemp(join(tmpdir(), 'strix-worker-')))
  // realpath: macOS's temp dir is a symlink, and the shell in fake Strix reports the resolved path.
  const uploadDir = await realpath(await mkdtemp(join(tmpdir(), 'strix-uploads-')))
  const tmpDir = await realpath(await mkdtemp(join(tmpdir(), 'strix-tmp-')))
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
    uploadDir,
    tmpDir,
    pollIntervalMs: 100,
    env: { ...strixEnv(), FAKE_STRIX_SCENARIO: scenario },
    sigtermAfterMs: 2000,
    sigkillAfterMs: 4000,
  })
  return {
    workDir,
    uploadDir,
    tmpDir,
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
  expect(done.error).toBe('Worker restarted during the scan. Resume it to continue.')
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

const requeue = (id: string) =>
  db.update(schema.scan).set({ status: 'queued', finishedAt: null }).where(eq(schema.scan.id, id))

test('a resumed scan continues its run without replaying the feed', async () => {
  const scan = await createScan()
  const first = await processor('failed')
  await first.process(scan.id)
  const failed = (await load(scan.id))!
  expect(failed.status).toBe('failed')
  expect(failed.runName).toBe('example-com_ab12')

  await requeue(scan.id)
  // Same work dir: the run files of the first attempt are still there.
  const second = await processor('completed', first.workDir)
  await second.process(scan.id)

  const done = (await load(scan.id))!
  expect(done.status).toBe('completed')
  expect(done.startedAt).toEqual(failed.startedAt)
  expect(done.costUsd).toBe(0.25)
  const argv = (await Bun.file(join(second.workDir, scan.id, 'argv.txt')).text()).trim()
  expect(argv.split('\n')).toEqual(['-n', '--resume', 'example-com_ab12', '--max-budget', '5'])
  const started = (await events(scan.id)).filter((e) => e.type === 'agent_started')
  expect(started.map((e) => e.message)).toEqual(['Agent StrixAgent started', 'Agent recon started'])
  const log = await Bun.file(join(second.workDir, scan.id, 'strix.log')).text()
  expect(log).toContain('no LLM configured')
  expect(log).toContain('--- resumed ')
})

test('a resumed scan whose run files are gone fails without starting Strix', async () => {
  const scan = await createScan()
  await db
    .update(schema.scan)
    .set({ runName: 'example-com_ab12' })
    .where(eq(schema.scan.id, scan.id))
  const { workDir, removed, process } = await processor('completed')
  await process(scan.id)
  const done = (await load(scan.id))!
  expect(done.status).toBe('failed')
  expect(done.error).toBe("The scan's run files are gone, so it can't be resumed")
  expect(removed).toEqual([scan.id])
  expect(await Bun.file(join(workDir, scan.id, 'argv.txt')).exists()).toBe(false)
})

test('passes uploaded files to Strix, runs it with STRIX_TMP_DIR and removes the spec staging afterwards', async () => {
  const scan = await createScan('queued', [{ type: 'file', name: 'pets.yaml' }])
  const { workDir, uploadDir, tmpDir, process } = await processor('completed')
  await mkdir(join(uploadDir, scan.id), { recursive: true })
  await writeFile(join(uploadDir, scan.id, 'pets.yaml'), 'openapi: 3.0.0\n')
  await process(scan.id)

  const argv = (await readFile(join(workDir, scan.id, 'argv.txt'), 'utf8')).split('\n')
  expect(argv.slice(0, 4)).toEqual(['-n', '-t', join(uploadDir, scan.id, 'pets.yaml'), '-m'])
  expect((await readFile(join(workDir, scan.id, 'tmpdir.txt'), 'utf8')).trim()).toBe(tmpDir)
  expect(await exists(join(tmpDir, 'strix_api_specs', 'example-com_ab12'))).toBe(false)
  expect((await load(scan.id))!.status).toBe('completed')
})

test('fails a scan whose uploaded file is missing without starting Strix', async () => {
  const scan = await createScan('queued', [{ type: 'file', name: 'gone.json' }])
  const { workDir, process } = await processor('completed')
  await process(scan.id)
  const failed = (await load(scan.id))!
  expect(failed.status).toBe('failed')
  expect(failed.error).toBe('An uploaded target file is missing: gone.json')
  expect(await exists(join(workDir, scan.id, 'argv.txt'))).toBe(false)
})

test('fails a resumed scan whose uploaded file is missing', async () => {
  const scan = await createScan('queued', [{ type: 'file', name: 'gone.json' }])
  const { workDir, process } = await processor('completed')
  const runDir = join(workDir, scan.id, 'strix_runs', 'example-com_ab12')
  await mkdir(join(runDir, '.state'), { recursive: true })
  await writeFile(
    join(runDir, 'run.json'),
    JSON.stringify({
      run_name: 'example-com_ab12',
      status: 'interrupted',
      llm_usage: { requests: 1, input_tokens: 1, output_tokens: 1, cost: 0.01 },
    }),
  )
  await writeFile(
    join(runDir, '.state', 'agents.json'),
    '{"statuses":{},"names":{},"parent_of":{},"errors":{}}',
  )
  await db
    .update(schema.scan)
    .set({ runName: 'example-com_ab12' })
    .where(eq(schema.scan.id, scan.id))
  await process(scan.id)
  const failed = (await load(scan.id))!
  expect(failed.status).toBe('failed')
  expect(failed.error).toBe('An uploaded target file is missing: gone.json')
  expect(await exists(join(workDir, scan.id, 'argv.txt'))).toBe(false)
})
