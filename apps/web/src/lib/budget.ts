import { formatBudgetUsd, type BudgetWindow } from '@strix-panel/shared'
import { api } from './api'

export type MyBudget = NonNullable<Awaited<ReturnType<typeof api.v1.me.budget.get>>['data']>

export const WINDOW_PHRASES: Record<BudgetWindow, string> = {
  week: 'this week',
  month: 'this month',
  year: 'this year',
  forever: 'in total',
}

export const WINDOW_LABELS: Record<BudgetWindow, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
  forever: 'Forever',
}

// Fetched on demand (not cached): spend changes while scans run.
export async function loadMyBudget(): Promise<MyBudget | null> {
  const { data } = await api.v1.me.budget.get()
  return data ?? null
}

export function formatResetDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// "$12.40 of $50.00 left this month · resets Nov 1"
export function budgetLeftText(budget: MyBudget): string | null {
  if (budget.limitUsd === null || budget.remainingUsd === null) return null
  const left = `${formatBudgetUsd(budget.remainingUsd)} of ${formatBudgetUsd(budget.limitUsd)} left ${WINDOW_PHRASES[budget.window]}`
  return budget.resetsAt ? `${left} · resets ${formatResetDate(budget.resetsAt)}` : left
}

// Why a scan can't start, or null when it can. Mirrors checkScanBudget on the API.
export function budgetBlockReason(budget: MyBudget): string | null {
  if (budget.remainingUsd === null) return null
  if (budget.limitUsd === 0) return 'Your account has no scan budget. Ask an admin.'
  if (budget.remainingUsd <= 0) return 'Your budget is used up'
  if (budget.remainingUsd < budget.minToStartUsd) {
    return `You need at least ${formatBudgetUsd(budget.minToStartUsd)} of budget to start a scan`
  }
  return null
}

// Dashboard card: "$12.40 left" / "$37.60 of $50.00 spent this month", or "Unlimited" / "$4.20 spent this month".
export function budgetCard(budget: MyBudget): { value: string; hint: string } {
  const phrase = WINDOW_PHRASES[budget.window]
  if (budget.limitUsd === null || budget.remainingUsd === null) {
    return { value: 'Unlimited', hint: `${formatBudgetUsd(budget.spentUsd)} spent ${phrase}` }
  }
  return {
    value: `${formatBudgetUsd(budget.remainingUsd)} left`,
    hint: `${formatBudgetUsd(budget.spentUsd)} of ${formatBudgetUsd(budget.limitUsd)} spent ${phrase}`,
  }
}
