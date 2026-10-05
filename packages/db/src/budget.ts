// A user's scan budget and what they spent in its current window. Read by the API (gates, /me/budget) and the
// worker (the cap a scan runs with), so both count spend the same way.
import { budgetWindowEnd, budgetWindowStart, type BudgetWindow } from '@strix-panel/shared'
import { and, eq, gte, sql, type AnyColumn, type SQL } from 'drizzle-orm'
import type { Database } from './index'
import { scan, user } from './schema'

export interface UserBudget {
  // Null = unlimited.
  limitUsd: number | null
  window: BudgetWindow
  // Cost of the user's scans created in the current window, any status.
  spentUsd: number
  // Null for `forever`.
  windowStartsAt: Date | null
  resetsAt: Date | null
}

export async function getUserBudget(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<UserBudget | null> {
  const [row] = await db
    .select({ limitUsd: user.budgetUsd, window: user.budgetWindow })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!row) return null
  const start = budgetWindowStart(row.window, now)
  const [spend] = await db
    .select({ spentUsd: sql<number>`coalesce(sum(${scan.costUsd}), 0)::float8` })
    .from(scan)
    .where(and(eq(scan.userId, userId), start ? gte(scan.createdAt, start) : undefined))
  return {
    limitUsd: row.limitUsd,
    window: row.window,
    spentUsd: spend?.spentUsd ?? 0,
    windowStartsAt: start,
    resetsAt: budgetWindowEnd(row.window, now),
  }
}

// The same window start in SQL, for queries over many users (each with their own window). Null for `forever`.
export function windowStartSql(window: AnyColumn): SQL<Date | null> {
  return sql<Date | null>`case ${window}
    when 'week' then date_trunc('week', now() at time zone 'utc') at time zone 'utc'
    when 'month' then date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    when 'year' then date_trunc('year', now() at time zone 'utc') at time zone 'utc'
  end`
}
