import { getUserBudget, type UserBudget } from '@strix-panel/db/budget'
import {
  BUDGET_WINDOW_CLOSED_MESSAGE,
  checkScanBudget,
  isBeforeBudgetWindow,
} from '@strix-panel/shared'
import { db } from './db'
import { env } from './env'
import { ForbiddenError, NotFoundError } from './errors'

export async function loadBudget(userId: string): Promise<UserBudget> {
  const budget = await getUserBudget(db, userId)
  if (!budget) throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  return budget
}

// Starting or resuming a scan needs MIN_SCAN_BUDGET_USD left, for users with a budget. `userId` is the scan's
// owner: their budget pays for it, whoever clicks.
export async function assertCanStartScan(userId: string, viewerId = userId): Promise<UserBudget> {
  const budget = await loadBudget(userId)
  const check = checkScanBudget({ ...budget, minUsd: env.MIN_SCAN_BUDGET_USD })
  if (!check.ok) {
    const message =
      viewerId === userId ? check.message : "The scan's owner doesn't have enough budget left"
    throw new ForbiddenError(message, check.code)
  }
  return budget
}

// Resuming also needs the scan to belong to the current budget window (see isBeforeBudgetWindow).
export async function assertCanResumeScan(
  scan: { userId: string; createdAt: Date },
  viewerId: string,
): Promise<void> {
  const budget = await assertCanStartScan(scan.userId, viewerId)
  if (budget.limitUsd !== null && isBeforeBudgetWindow(budget.window, scan.createdAt)) {
    throw new ForbiddenError(BUDGET_WINDOW_CLOSED_MESSAGE, 'BUDGET_WINDOW_CLOSED')
  }
}
