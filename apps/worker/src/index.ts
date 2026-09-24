import { createDb } from '@strix-panel/db'
import { createScanWorker } from '@strix-panel/db/queue'
import { env } from './env'
import { createScanProcessor, markFailed } from './processor'
import { createScanStore } from './scan-store'

const { db, pool } = createDb(env.DATABASE_URL)
const store = createScanStore(db)
const processScan = createScanProcessor({
  store,
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
await worker.waitUntilReady()
console.log('[worker] ready')

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
  await worker.close()
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
