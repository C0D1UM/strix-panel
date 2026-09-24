import { schema } from '@strix-panel/db'
import { FINISHED_SCAN_STATUSES, SCAN_STATUSES, type ScanStatus } from '@strix-panel/shared'
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  lte,
  min,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { AuthUser } from '../../lib/auth'
import { db } from '../../lib/db'
import { BadRequestError, ForbiddenError } from '../../lib/errors'
import type { DashboardScope } from './schema'

type Viewer = Pick<AuthUser, 'id' | 'role'>
type Granularity = 'day' | 'month'

export interface DashboardQuery {
  start?: string
  end?: string
  scope?: DashboardScope
}

interface Bound {
  date: Date
  // `+HH:MM` / `-HH:MM`, as the client wrote it (`Z` becomes `+00:00`).
  offset: string
}

const DAILY_MAX_DAYS = 92
const DAY_MS = 86_400_000
const PER_USER_LIMIT = 20
const ISO_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
// Nothing was scanned before this; older years also break Postgres (year 0) and ISO keys.
const MIN_YEAR = 1970

const scan = schema.scan
const tokensExpr = sql`${scan.inputTokens} + ${scan.outputTokens}`
const findingsExpr = sql`${scan.findingsCritical} + ${scan.findingsHigh} + ${scan.findingsMedium} + ${scan.findingsLow} + ${scan.findingsInfo}`

// Postgres returns sums of bigint/numeric as strings; map them to numbers.
const total = (expr: unknown) => sql<number>`coalesce(sum(${expr}), 0)`.mapWith(Number)
const countWhere = (condition: SQL) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number)

export function parseBound(value: string, name: 'start' | 'end'): Bound {
  const invalid = () =>
    new BadRequestError('INVALID_RANGE', `${name} must be an ISO 8601 timestamp with a UTC offset`)
  const match = ISO_WITH_OFFSET.exec(value)
  const date = new Date(value)
  if (!match || Number.isNaN(date.getTime())) throw invalid()
  const [, year, month, day, hour, minute, zone] = match.map(String)
  const offset = zone === 'Z' ? '+00:00' : zone!
  // `new Date` rolls impossible values over (Feb 30 -> Mar 2); read the wall time back and compare.
  const local = new Date(date.getTime() + offsetMinutes(offset) * 60_000)
  const fields = [
    local.getUTCFullYear(),
    local.getUTCMonth() + 1,
    local.getUTCDate(),
    local.getUTCHours(),
    local.getUTCMinutes(),
  ]
  if (fields.join() !== [year, month, day, hour, minute].map(Number).join()) throw invalid()
  if (Number(year) < MIN_YEAR) throw invalid()
  return { date, offset }
}

const offsetMinutes = (offset: string) =>
  (offset.startsWith('-') ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)))

const toKey = (date: Date, granularity: Granularity) =>
  date.toISOString().slice(0, granularity === 'day' ? 10 : 7)

const localKey = (date: Date, minutes: number, granularity: Granularity) =>
  toKey(new Date(date.getTime() + minutes * 60_000), granularity)

// Every bucket key from `first` to `last` inclusive, so charts get a continuous axis.
function bucketKeys(first: string, last: string, granularity: Granularity): string[] {
  const keys: string[] = []
  const cursor = new Date(granularity === 'day' ? `${first}T00:00:00Z` : `${first}-01T00:00:00Z`)
  for (let key = first; key <= last; key = toKey(cursor, granularity)) {
    keys.push(key)
    if (granularity === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1)
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return keys
}

async function getStatusCounts(where: SQL | undefined) {
  const rows = await db
    .select({ status: scan.status, n: count() })
    .from(scan)
    .where(where)
    .groupBy(scan.status)
  const counts = Object.fromEntries(SCAN_STATUSES.map((s) => [s, 0])) as Record<ScanStatus, number>
  for (const row of rows) counts[row.status] = row.n
  return counts
}

async function getTotals(where: SQL | undefined) {
  const [row] = await db
    .select({
      input: total(scan.inputTokens),
      output: total(scan.outputTokens),
      cached: total(scan.cachedTokens),
      costUsd: total(scan.costUsd),
      critical: total(scan.findingsCritical),
      high: total(scan.findingsHigh),
      medium: total(scan.findingsMedium),
      low: total(scan.findingsLow),
      info: total(scan.findingsInfo),
    })
    .from(scan)
    .where(where)
  return row!
}

async function getSeries(where: SQL | undefined, start: Bound | undefined, endDate: Date) {
  const firstDate =
    start?.date ??
    (
      await db
        .select({ first: min(scan.createdAt) })
        .from(scan)
        .where(where)
    )[0]?.first
  if (!firstDate) return { granularity: 'day' as Granularity, points: [] }

  const offset = start?.offset ?? '+00:00'
  const granularity: Granularity =
    endDate.getTime() - firstDate.getTime() <= DAILY_MAX_DAYS * DAY_MS ? 'day' : 'month'
  // `offset` and the unit come from a strict regex and a closed union, so inlining them is safe.
  // They must be literals: bound params would differ between SELECT and GROUP BY.
  const local = sql`${scan.createdAt} AT TIME ZONE ${sql.raw(`'${offset}'::interval`)}`
  const format = granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'
  const bucket = sql<string>`to_char(date_trunc(${sql.raw(`'${granularity}'`)}, ${local}), ${sql.raw(`'${format}'`)})`

  const rows = await db
    .select({ bucket, runs: count(), tokens: total(tokensExpr), costUsd: total(scan.costUsd) })
    .from(scan)
    .where(where)
    .groupBy(bucket)
  const byKey = new Map(rows.map((row) => [row.bucket, row]))
  const minutes = offsetMinutes(offset)
  const keys = bucketKeys(
    localKey(firstDate, minutes, granularity),
    localKey(endDate, minutes, granularity),
    granularity,
  )
  const points = keys.map((key) => {
    const row = byKey.get(key)
    return {
      bucket: key,
      runs: row?.runs ?? 0,
      tokens: row?.tokens ?? 0,
      costUsd: row?.costUsd ?? 0,
    }
  })
  return { granularity, points }
}

// Admin-only numbers. Always across all users; `inRange` is the date filter only.
async function getAdminBlock(inRange: SQL | undefined) {
  const [[users], [active], [live], [outcomes], perUser] = await Promise.all([
    db.select({ total: count() }).from(schema.user),
    db
      .select({ n: countDistinct(scan.userId) })
      .from(scan)
      .where(inRange),
    db
      .select({
        queued: countWhere(eq(scan.status, 'queued')),
        running: countWhere(inArray(scan.status, ['running', 'stopping'])),
      })
      .from(scan),
    db
      .select({
        finished: countWhere(inArray(scan.status, [...FINISHED_SCAN_STATUSES])),
        failed: countWhere(eq(scan.status, 'failed')),
      })
      .from(scan)
      .where(inRange),
    db
      .select({
        userId: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        runs: count(),
        tokens: total(tokensExpr),
        costUsd: total(scan.costUsd),
        findings: total(findingsExpr),
      })
      .from(scan)
      .innerJoin(schema.user, eq(schema.user.id, scan.userId))
      .where(inRange)
      .groupBy(schema.user.id)
      .orderBy(desc(sql`sum(${scan.costUsd})`), asc(schema.user.name))
      .limit(PER_USER_LIMIT),
  ])
  return {
    users: { total: users!.total, active: active!.n },
    health: {
      queued: live!.queued,
      running: live!.running,
      failureRate: outcomes!.finished > 0 ? outcomes!.failed / outcomes!.finished : null,
    },
    perUser,
  }
}

export async function getDashboard(viewer: Viewer, query: DashboardQuery) {
  const isAdmin = viewer.role === 'admin'
  const scope = query.scope ?? (isAdmin ? 'all' : 'me')
  if (scope === 'all' && !isAdmin) throw new ForbiddenError("Only admins can view everyone's usage")

  const start = query.start === undefined ? undefined : parseBound(query.start, 'start')
  const end = query.end === undefined ? undefined : parseBound(query.end, 'end')
  const endDate = end?.date ?? new Date()
  if (start && start.date > endDate) {
    throw new BadRequestError('INVALID_RANGE', 'start must not be after end')
  }

  // No `end` means "up to now". Leave it unbounded: the DB clock may run ahead of ours.
  const inRange = and(
    start ? gte(scan.createdAt, start.date) : undefined,
    end ? lte(scan.createdAt, end.date) : undefined,
  )
  const where = and(inRange, scope === 'me' ? eq(scan.userId, viewer.id) : undefined)

  const [statusCounts, totals, series, admin] = await Promise.all([
    getStatusCounts(where),
    getTotals(where),
    getSeries(where, start, endDate),
    isAdmin ? getAdminBlock(inRange) : undefined,
  ])

  return {
    kpis: {
      runs: {
        total: SCAN_STATUSES.reduce((sum, status) => sum + statusCounts[status], 0),
        completed: statusCounts.completed,
        failed: statusCounts.failed,
        stopped: statusCounts.stopped,
        running: statusCounts.running + statusCounts.stopping,
      },
      tokens: { input: totals.input, output: totals.output, cached: totals.cached },
      costUsd: totals.costUsd,
      findings: {
        critical: totals.critical,
        high: totals.high,
        medium: totals.medium,
        low: totals.low,
        info: totals.info,
      },
    },
    series,
    statusCounts,
    ...(admin ? { admin } : {}),
  }
}
