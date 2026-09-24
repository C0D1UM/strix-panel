// Everything the processor reads from or writes to Postgres. Every write ends with a NOTIFY so the API can
// push the change to open scan pages.
import { schema, type Database } from '@strix-panel/db'
import { notifyScanUpdate } from '@strix-panel/db/notify'
import type { ScanStatus } from '@strix-panel/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { EventInsert, RunDiff, ScanPatch } from './strix/diff'

export type ScanRow = typeof schema.scan.$inferSelect

export function createScanStore(db: Database) {
  async function get(scanId: string): Promise<ScanRow | null> {
    const [row] = await db.select().from(schema.scan).where(eq(schema.scan.id, scanId)).limit(1)
    return row ?? null
  }

  async function status(scanId: string): Promise<ScanStatus | null> {
    const [row] = await db
      .select({ status: schema.scan.status })
      .from(schema.scan)
      .where(eq(schema.scan.id, scanId))
      .limit(1)
    return row?.status ?? null
  }

  async function write(scanId: string, patch: ScanPatch, events: EventInsert[], diff?: RunDiff) {
    await db.transaction(async (tx) => {
      if (Object.keys(patch).length > 0) {
        await tx.update(schema.scan).set(patch).where(eq(schema.scan.id, scanId))
      }
      if (diff && diff.findings.length > 0) {
        await tx
          .insert(schema.scanFinding)
          .values(diff.findings.map((finding) => ({ ...finding, scanId })))
          .onConflictDoUpdate({
            target: [schema.scanFinding.scanId, schema.scanFinding.strixId],
            set: {
              title: sql`excluded.title`,
              severity: sql`excluded.severity`,
              target: sql`excluded.target`,
              endpoint: sql`excluded.endpoint`,
              method: sql`excluded.method`,
              cve: sql`excluded.cve`,
              cwe: sql`excluded.cwe`,
              confidence: sql`excluded.confidence`,
              cvss: sql`excluded.cvss`,
              foundAt: sql`excluded.found_at`,
              report: sql`excluded.report`,
              updatedAt: new Date(),
            },
          })
      }
      if (events.length > 0) {
        await tx.insert(schema.scanEvent).values(events.map((e) => ({ ...e, scanId })))
      }
    })
    await notifyScanUpdate(db, scanId)
  }

  // queued → running, unless something (a stop) moved the scan on in the meantime.
  async function start(scanId: string): Promise<boolean> {
    const started = await db
      .update(schema.scan)
      .set({ status: 'running', startedAt: new Date() })
      .where(and(eq(schema.scan.id, scanId), eq(schema.scan.status, 'queued')))
      .returning({ id: schema.scan.id })
    if (started.length === 0) return false
    await write(scanId, {}, [{ type: 'status', message: 'Scan started', data: null }])
    return true
  }

  return {
    get,
    status,
    start,
    // A poll tick: usage, agents, findings and the events derived from them.
    applyDiff: (scanId: string, diff: RunDiff) => write(scanId, diff.patch, diff.events, diff),
    // A status transition, always with a matching feed line.
    setStatus: (scanId: string, next: ScanStatus, message: string, patch: ScanPatch = {}) =>
      write(scanId, { ...patch, status: next }, [{ type: 'status', message, data: null }]),
  }
}

export type ScanStore = ReturnType<typeof createScanStore>
