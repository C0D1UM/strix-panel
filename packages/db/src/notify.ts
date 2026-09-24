// Live scan updates over Postgres LISTEN/NOTIFY. The payload is only the scan id; listeners re-read the rows.
import { sql } from 'drizzle-orm'
import { Client } from 'pg'
import type { Database } from './index'

export const SCAN_UPDATES_CHANNEL = 'scan_updates'

export async function notifyScanUpdate(db: Database, scanId: string) {
  await db.execute(sql`SELECT pg_notify(${SCAN_UPDATES_CHANNEL}, ${scanId})`)
}

export interface ScanListener {
  // Calls `onUpdate` for each notification about `scanId`, and once after a reconnect (updates may have been missed).
  subscribe(scanId: string, onUpdate: () => void): () => void
  ready(): Promise<void>
  close(): Promise<void>
}

const MAX_BACKOFF_MS = 10_000

// One dedicated connection per process, fanned out to in-process subscribers.
export function createScanListener(connectionString: string): ScanListener {
  const subscribers = new Map<string, Set<() => void>>()
  let client: Client | null = null
  let closed = false
  let attempt = 0
  let connected = Promise.withResolvers<void>()

  const notifyAll = () => {
    for (const set of subscribers.values()) for (const fn of set) fn()
  }

  async function connect(): Promise<void> {
    if (closed) return
    const next = new Client({ connectionString })
    next.on('notification', (msg) => {
      if (msg.channel !== SCAN_UPDATES_CHANNEL || !msg.payload) return
      for (const fn of subscribers.get(msg.payload) ?? []) fn()
    })
    next.on('error', () => {
      if (client === next) scheduleReconnect()
    })
    next.on('end', () => {
      if (client === next) scheduleReconnect()
    })
    try {
      await next.connect()
      await next.query(`LISTEN ${SCAN_UPDATES_CHANNEL}`)
    } catch (error) {
      await next.end().catch(() => {})
      console.error(`[scan-listener] connect failed: ${(error as Error).message}`)
      scheduleReconnect()
      return
    }
    if (closed) {
      await next.end().catch(() => {})
      return
    }
    const reconnected = attempt > 0
    client = next
    attempt = 0
    connected.resolve()
    if (reconnected) notifyAll()
  }

  function scheduleReconnect() {
    if (closed) return
    const previous = client
    client = null
    previous?.end().catch(() => {})
    attempt += 1
    const delay = Math.min(MAX_BACKOFF_MS, 250 * 2 ** (attempt - 1))
    setTimeout(() => void connect(), delay)
  }

  void connect()

  return {
    subscribe(scanId, onUpdate) {
      let set = subscribers.get(scanId)
      if (!set) subscribers.set(scanId, (set = new Set()))
      set.add(onUpdate)
      return () => {
        set.delete(onUpdate)
        if (set.size === 0) subscribers.delete(scanId)
      }
    },
    ready: () => connected.promise,
    async close() {
      closed = true
      subscribers.clear()
      const current = client
      client = null
      connected = Promise.withResolvers<void>()
      await current?.end().catch(() => {})
    },
  }
}
