import { afterAll, expect, test } from 'bun:test'
import { createDb } from '../src'
import { createScanListener, notifyScanUpdate } from '../src/notify'

const url = process.env.DATABASE_URL!
const { db, pool } = createDb(url)
const listener = createScanListener(url)

afterAll(async () => {
  await listener.close()
  await pool.end()
})

test('a notification reaches only the subscribers of that scan', async () => {
  await listener.ready()
  const scanId = crypto.randomUUID()
  const received = Promise.withResolvers<void>()
  let other = 0
  const unsubscribe = listener.subscribe(scanId, () => received.resolve())
  const unsubscribeOther = listener.subscribe(crypto.randomUUID(), () => other++)

  await notifyScanUpdate(db, scanId)
  await received.promise
  expect(other).toBe(0)

  unsubscribe()
  unsubscribeOther()
})
