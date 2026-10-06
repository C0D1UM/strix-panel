// Per-user scan budgets: a USD limit over a calendar window (UTC). A user's spend in a window is the cost of the
// scans they created in it.

export const BUDGET_WINDOWS = ['week', 'month', 'year', 'forever'] as const
export type BudgetWindow = (typeof BUDGET_WINDOWS)[number]

// Start of the window `now` falls in: ISO week (Monday), calendar month or year, all in UTC. Null for `forever`.
export function budgetWindowStart(window: BudgetWindow, now: Date): Date | null {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = now.getUTCDate()
  switch (window) {
    case 'week':
      return new Date(Date.UTC(y, m, d - ((now.getUTCDay() + 6) % 7)))
    case 'month':
      return new Date(Date.UTC(y, m, 1))
    case 'year':
      return new Date(Date.UTC(y, 0, 1))
    case 'forever':
      return null
  }
}

// When the window `now` falls in ends and the budget resets. Null for `forever`.
export function budgetWindowEnd(window: BudgetWindow, now: Date): Date | null {
  const start = budgetWindowStart(window, now)
  if (!start) return null
  const y = start.getUTCFullYear()
  const m = start.getUTCMonth()
  if (window === 'week') return new Date(Date.UTC(y, m, start.getUTCDate() + 7))
  if (window === 'month') return new Date(Date.UTC(y, m + 1, 1))
  return new Date(Date.UTC(y + 1, 0, 1))
}

// Rounds down to the cent, ignoring float noise (0.3 - 0.1 is 0.19999…).
export const floorCents = (n: number) => Math.floor(Math.round(n * 1e6) / 1e4) / 100

export const formatBudgetUsd = (n: number) => `$${n.toFixed(2)}`

// What is left of a budget: null when unlimited, never negative.
export function remainingBudget(limitUsd: number | null, spentUsd: number): number | null {
  return limitUsd === null ? null : floorCents(Math.max(0, limitUsd - spentUsd))
}

export interface ScanBudgetInput {
  limitUsd: number | null
  spentUsd: number
  // The budget.minToStartUsd setting: what must be left to start or resume a scan, so it doesn't run out halfway.
  minUsd: number
}

export type ScanBudgetCheck =
  { ok: true } | { ok: false; code: 'BUDGET_INSUFFICIENT'; message: string }

export function checkScanBudget({ limitUsd, spentUsd, minUsd }: ScanBudgetInput): ScanBudgetCheck {
  const remaining = remainingBudget(limitUsd, spentUsd)
  if (remaining === null) return { ok: true }
  if (limitUsd === 0) {
    return {
      ok: false,
      code: 'BUDGET_INSUFFICIENT',
      message: 'Your account has no scan budget. Ask an admin.',
    }
  }
  if (remaining <= 0)
    return { ok: false, code: 'BUDGET_INSUFFICIENT', message: 'Your budget is used up' }
  if (remaining < minUsd) {
    return {
      ok: false,
      code: 'BUDGET_INSUFFICIENT',
      message: `You have ${formatBudgetUsd(remaining)} of budget left; at least ${formatBudgetUsd(minUsd)} is needed to start a scan`,
    }
  }
  return { ok: true }
}

// Spend counts toward the window a scan was created in, so resuming a scan from an earlier window would spend
// budget that no current window sees. Limited users start a new scan instead.
export function isBeforeBudgetWindow(
  window: BudgetWindow,
  createdAt: Date,
  now: Date = new Date(),
) {
  const start = budgetWindowStart(window, now)
  return start !== null && createdAt < start
}

export const BUDGET_WINDOW_CLOSED_MESSAGE =
  'This scan was started in an earlier budget period, so it cannot be resumed. Start a new scan.'
