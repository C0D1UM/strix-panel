import { createDb, schema } from '@strix-panel/db'
import type { ReportJob } from '@strix-panel/db/queue'
import { reportPdfPath } from '@strix-panel/shared/env'
import { mkdir, mkdtemp, readdir, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, expect, test } from 'bun:test'
import { createReportProcessor } from '../src/report'
import { createScanStore } from '../src/scan-store'

const { db, pool } = createDb(process.env.DATABASE_URL!)
const store = createScanStore(db)
const FAKE_PYTHON = join(import.meta.dir, 'fixtures', 'fake-python.sh')

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

async function setup(options: { status?: 'completed' | 'failed'; runFiles?: boolean } = {}) {
  const [scan] = await db
    .insert(schema.scan)
    .values({
      userId,
      targets: ['https://example.com/'],
      scanMode: 'quick',
      status: options.status ?? 'completed',
      runName: 'example-com_ab12',
    })
    .returning()
  const workDir = await mkdtemp(join(tmpdir(), 'strix-worker-'))
  const reportDir = join(await mkdtemp(join(tmpdir(), 'strix-reports-')), 'reports')
  if (options.runFiles ?? true) {
    const runDir = join(workDir, scan!.id, 'strix_runs', 'example-com_ab12')
    await mkdir(runDir, { recursive: true })
    await Bun.write(join(runDir, 'run.json'), '{"run_name":"example-com_ab12"}')
  }
  return { scanId: scan!.id, workDir, reportDir }
}

const job = (scanId: string) => ({ id: scanId, data: { scanId } }) as ReportJob

test('renders the run with Strix into the report dir', async () => {
  const { scanId, workDir, reportDir } = await setup()
  await createReportProcessor({ store, workDir, reportDir, python: FAKE_PYTHON })(job(scanId))
  expect(await Bun.file(reportPdfPath(reportDir, scanId)).text()).toBe(
    '%PDF-fake {"run_name":"example-com_ab12"}',
  )
  expect(await readdir(reportDir)).toEqual([`${scanId}.pdf`])
})

test('a Strix error fails the job with its last line and leaves no file', async () => {
  const { scanId, workDir, reportDir } = await setup()
  const process = createReportProcessor({
    store,
    workDir,
    reportDir,
    python: FAKE_PYTHON,
    env: { FAKE_PYTHON_FAIL: '1' },
  })
  await expect(process(job(scanId))).rejects.toThrow(
    "Rendering the PDF failed: ModuleNotFoundError: No module named 'strix.interface.viewer.report_pdf'",
  )
  expect(await readdir(reportDir).catch(() => [])).toEqual([])
})

test('a render that hangs is killed', async () => {
  const { scanId, workDir, reportDir } = await setup()
  const process = createReportProcessor({
    store,
    workDir,
    reportDir,
    python: FAKE_PYTHON,
    env: { FAKE_PYTHON_SLEEP: '5' },
    timeoutMs: 200,
  })
  await expect(process(job(scanId))).rejects.toThrow('Rendering the PDF timed out')
})

test('refuses without STRIX_PYTHON, an unfinished scan or run files', async () => {
  const ready = await setup()
  await expect(
    createReportProcessor({ store, ...ready, python: '' })(job(ready.scanId)),
  ).rejects.toThrow('STRIX_PYTHON is empty')

  const failed = await setup({ status: 'failed' })
  await expect(
    createReportProcessor({ store, ...failed, python: FAKE_PYTHON })(job(failed.scanId)),
  ).rejects.toThrow('no completed Strix run')

  const gone = await setup({ runFiles: false })
  await expect(
    createReportProcessor({ store, ...gone, python: FAKE_PYTHON })(job(gone.scanId)),
  ).rejects.toThrow('run files of this scan are gone')
})

test('old PDFs are pruned on the next render', async () => {
  const { scanId, workDir, reportDir } = await setup()
  await mkdir(reportDir, { recursive: true })
  const stale = join(reportDir, 'old.pdf')
  await Bun.write(stale, 'old')
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
  await utimes(stale, twoHoursAgo, twoHoursAgo)
  await createReportProcessor({ store, workDir, reportDir, python: FAKE_PYTHON })(job(scanId))
  expect(await readdir(reportDir)).toEqual([`${scanId}.pdf`])
})
