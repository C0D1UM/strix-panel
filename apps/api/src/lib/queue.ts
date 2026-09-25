import { createReportQueue, createScanQueue } from '@strix-panel/db/queue'
import { env } from './env'

// Producer side of the scans and reports queues. The worker consumes them.
export const scanQueue = createScanQueue(env.DATABASE_URL)
export const reportQueue = createReportQueue(env.DATABASE_URL)
