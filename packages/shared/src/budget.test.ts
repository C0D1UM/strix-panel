import { describe, expect, test } from 'bun:test'
import {
  budgetWindowEnd,
  budgetWindowStart,
  checkScanBudget,
  floorCents,
  remainingBudget,
} from './budget'

const at = (iso: string) => new Date(iso)

describe('budgetWindowStart / budgetWindowEnd', () => {
  test('week is the ISO week in UTC, starting Monday', () => {
    // 2026-10-04 is a Sunday.
    expect(budgetWindowStart('week', at('2026-10-04T23:59:59Z'))).toEqual(
      at('2026-09-28T00:00:00Z'),
    )
    expect(budgetWindowStart('week', at('2026-10-05T00:00:00Z'))).toEqual(
      at('2026-10-05T00:00:00Z'),
    )
    expect(budgetWindowEnd('week', at('2026-10-06T12:00:00Z'))).toEqual(at('2026-10-12T00:00:00Z'))
  })

  test('month and year are calendar periods in UTC', () => {
    expect(budgetWindowStart('month', at('2026-10-31T23:00:00Z'))).toEqual(
      at('2026-10-01T00:00:00Z'),
    )
    expect(budgetWindowEnd('month', at('2026-12-15T00:00:00Z'))).toEqual(at('2027-01-01T00:00:00Z'))
    expect(budgetWindowStart('year', at('2026-06-01T00:00:00Z'))).toEqual(
      at('2026-01-01T00:00:00Z'),
    )
    expect(budgetWindowEnd('year', at('2026-06-01T00:00:00Z'))).toEqual(at('2027-01-01T00:00:00Z'))
  })

  test('forever has no window', () => {
    expect(budgetWindowStart('forever', new Date())).toBeNull()
    expect(budgetWindowEnd('forever', new Date())).toBeNull()
  })
})

describe('remainingBudget', () => {
  test('is null when unlimited, never negative, floored to the cent', () => {
    expect(remainingBudget(null, 5)).toBeNull()
    expect(remainingBudget(10, 12)).toBe(0)
    expect(remainingBudget(10, 1.2345)).toBe(8.76)
    expect(remainingBudget(0.3, 0.1)).toBe(0.2)
    expect(floorCents(4.999)).toBe(4.99)
  })
})

describe('checkScanBudget', () => {
  test('unlimited users always pass', () => {
    expect(checkScanBudget({ limitUsd: null, spentUsd: 1000, minUsd: 3 })).toEqual({ ok: true })
  })

  test('a zero budget has its own message', () => {
    expect(checkScanBudget({ limitUsd: 0, spentUsd: 0, minUsd: 3 })).toEqual({
      ok: false,
      code: 'BUDGET_INSUFFICIENT',
      message: 'Your account has no scan budget. Ask an admin.',
    })
  })

  test('needs at least the minimum left', () => {
    expect(checkScanBudget({ limitUsd: 10, spentUsd: 8.8, minUsd: 3 })).toEqual({
      ok: false,
      code: 'BUDGET_INSUFFICIENT',
      message: 'You have $1.20 of budget left; at least $3.00 is needed to start a scan',
    })
    expect(checkScanBudget({ limitUsd: 10, spentUsd: 7, minUsd: 3 })).toEqual({ ok: true })
  })
})

test('checkScanBudget refuses an exhausted budget even with no minimum', () => {
  expect(checkScanBudget({ limitUsd: 10, spentUsd: 10, minUsd: 0 })).toEqual({
    ok: false,
    code: 'BUDGET_INSUFFICIENT',
    message: 'Your budget is used up',
  })
  expect(checkScanBudget({ limitUsd: 0, spentUsd: 0, minUsd: 0 })).toMatchObject({ ok: false })
})
