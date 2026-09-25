import { createDb } from '@strix-panel/db'
import { createReportWorker, createScanWorker } from '@strix-panel/db/queue'
import { env } from './env'
import { createScanProcessor, markFailed } from './processor'
import { createReportProcessor } from './report'
import { createDockerSandboxes, sweepSandboxes } from './sandbox'
import { createScanStore } from './scan-store'

const { db, pool } = createDb(env.DATABASE_URL)
const store = createScanStore(db)
const sandboxes = createDockerSandboxes()
const processScan = createScanProcessor({
  store,
  sandboxes,
  strixBin: env.STRIX_BIN,
  workDir: env.STRIX_WORK_DIR,
  pollIntervalMs: env.STRIX_POLL_INTERVAL_MS,
})

const worker = createScanWorker(env.DATABASE_URL, processScan, {
  concurrency: env.WORKER_CONCURRENCY,
})
worker.on('failed', (job, error) => {
  console.error(`[worker] job ${job?.id} failed:`, error)
  if (job) void markFailed(store, job.data.scanId, error.message).catch(() => {})
})
worker.on('error', (error) => console.error(`[worker] error: ${error.message}`))

// PDF reports get their own consumer, so a render never waits behind a running scan.
const reportWorker = createReportWorker(
  env.DATABASE_URL,
  createReportProcessor({
    store,
    workDir: env.STRIX_WORK_DIR,
    reportDir: env.REPORT_DIR,
    python: env.STRIX_PYTHON,
  }),
  { concurrency: 2 },
)
reportWorker.on('failed', (job, error) =>
  console.error(`[worker] report ${job?.id} failed: ${error.message}`),
)
reportWorker.on('error', (error) => console.error(`[worker] report error: ${error.message}`))

await Promise.all([worker.waitUntilReady(), reportWorker.waitUntilReady()])
console.log('[worker] ready')
if (!env.STRIX_PYTHON) console.log('[worker] STRIX_PYTHON is empty: PDF reports are off')

// Containers of scans that ended while no worker was around to clean up (a crash, a SIGKILL).
void sweepSandboxes(sandboxes, store.status)
  .then((removed) => {
    if (removed.length > 0)
      console.log(`[worker] removed sandbox containers of ${removed.length} finished scan(s)`)
  })
  .catch((error: Error) => console.error(`[worker] sandbox sweep failed: ${error.message}`))

const health = Bun.serve({
  port: env.WORKER_HEALTH_PORT,
  fetch: () =>
    worker.isRunning()
      ? Response.json({ status: 'ok' })
      : Response.json({ status: 'stopped' }, { status: 503 }),
})
console.log(`[worker] health on http://localhost:${health.port}`)

async function shutdown() {
  console.log('[worker] shutting down')
  await health.stop()
  await Promise.all([worker.close(), reportWorker.close()])
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
