import { createScanQueue, createScanWorker, type ScanJobData } from '@strix-panel/db/queue'
import { afterAll, expect, test } from 'bun:test'

const url = process.env.DATABASE_URL!
const queue = createScanQueue(url)

afterAll(async () => {
  await queue.obliterate({ force: true })
  await queue.close()
})

test('a job enqueued by the API side is processed by a worker', async () => {
  const received = Promise.withResolvers<ScanJobData>()
  const worker = createScanWorker(url, async (job) => received.resolve(job.data))

  await queue.add('scan', { runId: 'run-123' })
  expect(await received.promise).toEqual({ runId: 'run-123' })

  await worker.close()
})
