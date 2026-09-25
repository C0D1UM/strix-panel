import { schema } from '@strix-panel/db'
import { notifyScanUpdate } from '@strix-panel/db/notify'
import { enqueueScan, releaseScanJob, removeScanJob } from '@strix-panel/db/queue'
import {
  checkScanResume,
  MAX_SCAN_TARGETS,
  normalizeScanTarget,
  type ScanMode,
  type ScanStatus,
} from '@strix-panel/shared'
import { and, asc, count, desc, eq, gt, sql, type SQL } from 'drizzle-orm'
import type { AuthUser } from '../../lib/auth'
import { db } from '../../lib/db'
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors'
import { scanQueue } from '../../lib/queue'

type Viewer = Pick<AuthUser, 'id' | 'role'>
type ScanRow = typeof schema.scan.$inferSelect
type OwnerRow = { id: string; name: string; email: string }

export interface CreateScanInput {
  name?: string
  targets: string[]
  scanMode: ScanMode
  instruction?: string
  maxBudgetUsd?: number
}

const owner = { id: schema.user.id, name: schema.user.name, email: schema.user.email }

export function toScanDto(row: ScanRow, ownerRow: OwnerRow) {
  return {
    id: row.id,
    name: row.name,
    targets: row.targets,
    scanMode: row.scanMode,
    instruction: row.instruction,
    maxBudgetUsd: row.maxBudgetUsd,
    status: row.status,
    runName: row.runName,
    error: row.error,
    requests: row.requests,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cachedTokens: row.cachedTokens,
    costUsd: row.costUsd,
    findings: {
      critical: row.findingsCritical,
      high: row.findingsHigh,
      medium: row.findingsMedium,
      low: row.findingsLow,
      info: row.findingsInfo,
    },
    hasReport: row.reportMd !== null,
    agents: row.agents,
    owner: ownerRow,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export type ScanDto = ReturnType<typeof toScanDto>

// Users see their own scans; admins see everyone's. Anything else is a 404, so ids don't leak.
const visibleTo = (viewer: Viewer): SQL | undefined =>
  viewer.role === 'admin' ? undefined : eq(schema.scan.userId, viewer.id)

async function findScan(viewer: Viewer, id: string) {
  const [row] = await db
    .select({ scan: schema.scan, owner })
    .from(schema.scan)
    .innerJoin(schema.user, eq(schema.user.id, schema.scan.userId))
    .where(and(eq(schema.scan.id, id), visibleTo(viewer)))
    .limit(1)
  if (!row) throw new NotFoundError('Scan not found')
  return row
}

export function parseTargets(targets: string[]): string[] {
  const normalized = targets.map((target) => {
    const url = normalizeScanTarget(target)
    if (!url) throw new BadRequestError('INVALID_TARGET', `Not an http(s) URL: ${target.trim()}`)
    return url
  })
  const unique = [...new Set(normalized)]
  if (unique.length > MAX_SCAN_TARGETS) {
    throw new BadRequestError('INVALID_TARGET', `At most ${MAX_SCAN_TARGETS} targets per scan`)
  }
  return unique
}

export async function createScan(viewer: Viewer, input: CreateScanInput): Promise<ScanDto> {
  const targets = parseTargets(input.targets)
  const [row] = await db
    .insert(schema.scan)
    .values({
      userId: viewer.id,
      name: input.name?.trim() || null,
      targets,
      scanMode: input.scanMode,
      instruction: input.instruction?.trim() || null,
      maxBudgetUsd: input.maxBudgetUsd ?? null,
    })
    .returning()
  try {
    await enqueueScan(scanQueue, row!.id)
  } catch (error) {
    await db
      .update(schema.scan)
      .set({ status: 'failed', error: 'Could not enqueue the scan', finishedAt: new Date() })
      .where(eq(schema.scan.id, row!.id))
    throw error
  }
  return getScan(viewer, row!.id)
}

export async function getScan(viewer: Viewer, id: string): Promise<ScanDto> {
  const row = await findScan(viewer, id)
  return toScanDto(row.scan, row.owner)
}

export async function listScans(viewer: Viewer, page: number, pageSize: number) {
  const where = visibleTo(viewer)
  const [rows, [total]] = await Promise.all([
    db
      .select({ scan: schema.scan, owner })
      .from(schema.scan)
      .innerJoin(schema.user, eq(schema.user.id, schema.scan.userId))
      .where(where)
      .orderBy(desc(schema.scan.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(schema.scan).where(where),
  ])
  return {
    items: rows.map((row) => toScanDto(row.scan, row.owner)),
    page,
    pageSize,
    total: total?.value ?? 0,
  }
}

export async function listEvents(viewer: Viewer, id: string, after?: string) {
  await findScan(viewer, id)
  return listEventsUnchecked(id, after)
}

// For the stream, which checks access once when it opens.
export async function listEventsUnchecked(id: string, after?: string) {
  const rows = await db
    .select()
    .from(schema.scanEvent)
    .where(and(eq(schema.scanEvent.scanId, id), after ? gt(schema.scanEvent.id, after) : undefined))
    .orderBy(asc(schema.scanEvent.id))
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

export type ScanEventDto = Awaited<ReturnType<typeof listEventsUnchecked>>[number]

const severityRank = sql`case ${schema.scanFinding.severity}
  when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end`

export async function listFindings(viewer: Viewer, id: string) {
  await findScan(viewer, id)
  const rows = await db
    .select()
    .from(schema.scanFinding)
    .where(eq(schema.scanFinding.scanId, id))
    .orderBy(severityRank, asc(schema.scanFinding.foundAt))
  return rows.map(({ scanId: _scanId, createdAt: _c, updatedAt: _u, foundAt, ...rest }) => ({
    ...rest,
    foundAt: foundAt.toISOString(),
  }))
}

export type ScanFindingDto = Awaited<ReturnType<typeof listFindings>>[number]

export async function getReport(viewer: Viewer, id: string): Promise<string> {
  const { scan } = await findScan(viewer, id)
  if (scan.reportMd === null) {
    throw new NotFoundError('The report is not available yet', 'REPORT_NOT_AVAILABLE')
  }
  return scan.reportMd
}

async function transition(id: string, from: ScanStatus, to: ScanStatus, message: string) {
  const changed = await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.scan)
      .set({ status: to, ...(to === 'stopped' ? { finishedAt: new Date() } : {}) })
      .where(and(eq(schema.scan.id, id), eq(schema.scan.status, from)))
      .returning({ id: schema.scan.id })
    if (rows.length === 0) return false
    await tx.insert(schema.scanEvent).values({ scanId: id, type: 'status', message })
    return true
  })
  if (changed) await notifyScanUpdate(db, id)
  return changed
}

export async function stopScan(viewer: Viewer, id: string): Promise<ScanDto> {
  const { scan } = await findScan(viewer, id)
  if (scan.status === 'queued') {
    await removeScanJob(scanQueue, id)
    await transition(id, 'queued', 'stopped', 'Scan cancelled before it started')
  } else if (scan.status === 'running') {
    await transition(id, 'running', 'stopping', 'Stop requested')
  } else {
    throw new ConflictError('SCAN_NOT_RUNNING', `Scan is ${scan.status} and cannot be stopped`)
  }
  return getScan(viewer, id)
}

// Queues a failed or stopped scan again. The worker continues its Strix run with `--resume`, or starts over when
// Strix never created one. Usage, findings and the original start time carry over.
export async function resumeScan(viewer: Viewer, id: string): Promise<ScanDto> {
  const { scan } = await findScan(viewer, id)
  const check = checkScanResume({ ...scan, agentCount: scan.agents.length })
  if (!check.ok) throw new ConflictError(check.code, check.message)
  if (!(await releaseScanJob(scanQueue, id))) {
    throw new ConflictError(
      'SCAN_NOT_RESUMABLE',
      'The previous attempt is still finishing, try again shortly',
    )
  }
  const requeued = await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.scan)
      .set({ status: 'queued', error: null, finishedAt: null })
      .where(and(eq(schema.scan.id, id), eq(schema.scan.status, scan.status)))
      .returning({ id: schema.scan.id })
    if (rows.length === 0) return false
    await tx
      .insert(schema.scanEvent)
      .values({ scanId: id, type: 'status', message: 'Scan resumed' })
    return true
  })
  if (!requeued) {
    throw new ConflictError('SCAN_NOT_RESUMABLE', 'The scan changed in the meantime, try again')
  }
  try {
    await enqueueScan(scanQueue, id)
  } catch (error) {
    await db
      .update(schema.scan)
      .set({ status: 'failed', error: 'Could not enqueue the scan', finishedAt: new Date() })
      .where(eq(schema.scan.id, id))
    throw error
  } finally {
    await notifyScanUpdate(db, id)
  }
  return getScan(viewer, id)
}
