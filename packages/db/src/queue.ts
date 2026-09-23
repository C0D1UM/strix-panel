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

// Placeholder payload until runs are designed.
export interface ScanJobData {
  runId: string
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
