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
// a user retry frees the id with `releaseScanJob` and enqueues it again.
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

export function migrateQueue(client: PoolClient) {
  return runMigrations(client, QUEUE_SCHEMA)
}
