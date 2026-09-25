// The only place that knows the queue engine. BullMQ runs on its Postgres backend (schema `bullmq`),
// so swapping engines later means changing this file only.
import {
  Queue,
  Worker,
  createPostgresBackend,
  runMigrations,
  type Job,
  type PostgresQueueBackend,
} from 'bullmq'
import type { PoolClient } from 'pg'

export const QUEUE_SCHEMA = 'bullmq'
export const SCAN_QUEUE = 'scans'

export interface ScanJobData {
  scanId: string
}

export type ScanJob = Job<ScanJobData>

// BullMQ checks its own schema version on connect; migrations are applied explicitly by `migrate`.
const connection = (connectionString: string) => ({ connectionString, schema: QUEUE_SCHEMA })

export function createScanQueue(connectionString: string) {
  return new Queue<ScanJobData, void, string, ScanJobData, void, string, PostgresQueueBackend>(
    SCAN_QUEUE,
    { connection: connection(connectionString) },
    createPostgresBackend,
  )
}

export type ScanQueue = ReturnType<typeof createScanQueue>

// One job per scan: the job id is the scan id, so a scan can't be enqueued twice. BullMQ never retries a scan;
// a resume frees the id with `releaseScanJob` and enqueues it again.
export function enqueueScan(queue: ScanQueue, scanId: string) {
  return queue.add('scan', { scanId }, { jobId: scanId, attempts: 1 })
}

// Removes a scan's job if it has not started yet. Returns false when there was nothing to remove.
export async function removeScanJob(queue: ScanQueue, scanId: string) {
  return (await queue.remove(scanId)) === 1
}

// Removes a finished scan's job so its id can be reused. Returns false while a worker still holds the job.
export async function releaseScanJob(queue: ScanQueue, scanId: string) {
  try {
    await queue.remove(scanId)
  } catch {
    return false
  }
  return (await queue.getJob(scanId)) === undefined
}

export function createScanWorker(
  connectionString: string,
  processor: (job: ScanJob) => Promise<void>,
  options: { concurrency?: number; autorun?: boolean } = {},
) {
  return new Worker<ScanJobData, void, string, PostgresQueueBackend>(
    SCAN_QUEUE,
    processor,
    { connection: connection(connectionString), ...options },
    createPostgresBackend,
  )
}

// PDF reports are rendered on demand by the worker, one job per scan (job id = scan id). The PDF itself is a file in
// the shared reports directory; the job only tells whether one is being made or why the last attempt failed.
export const REPORT_QUEUE = 'reports'

export interface ReportJobData {
  scanId: string
}

export type ReportJob = Job<ReportJobData>

export function createReportQueue(connectionString: string) {
  return new Queue<ReportJobData, void, string, ReportJobData, void, string, PostgresQueueBackend>(
    REPORT_QUEUE,
    { connection: connection(connectionString) },
    createPostgresBackend,
  )
}

export type ReportQueue = ReturnType<typeof createReportQueue>

export type ReportJobState =
  | { state: 'none' }
  | { state: 'pending' }
  | { state: 'completed' }
  | { state: 'failed'; error: string }

export async function getReportJob(queue: ReportQueue, scanId: string): Promise<ReportJobState> {
  const job = await queue.getJob(scanId)
  if (!job) return { state: 'none' }
  const state = await job.getState()
  if (state === 'completed') return { state: 'completed' }
  if (state === 'failed') return { state: 'failed', error: job.failedReason || 'Unknown error' }
  if (state === 'unknown') return { state: 'none' }
  return { state: 'pending' }
}

// Queues a render. A finished job (done or failed) is removed first so its id can be reused; a waiting or active one
// is left alone, since adding a job whose id exists is a no-op.
export async function enqueueReport(queue: ReportQueue, scanId: string) {
  const { state } = await getReportJob(queue, scanId)
  if (state === 'completed' || state === 'failed') await queue.remove(scanId)
  return queue.add('report', { scanId }, { jobId: scanId, attempts: 1 })
}

export function createReportWorker(
  connectionString: string,
  processor: (job: ReportJob) => Promise<void>,
  options: { concurrency?: number; autorun?: boolean } = {},
) {
  return new Worker<ReportJobData, void, string, PostgresQueueBackend>(
    REPORT_QUEUE,
    processor,
    { connection: connection(connectionString), ...options },
    createPostgresBackend,
  )
}

export function migrateQueue(client: PoolClient) {
  return runMigrations(client, QUEUE_SCHEMA)
}
