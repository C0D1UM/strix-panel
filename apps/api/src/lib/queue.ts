import { createScanQueue } from '@strix-panel/db/queue'
import { env } from './env'

// Producer side of the scans queue. The worker consumes it.
export const scanQueue = createScanQueue(env.DATABASE_URL)
