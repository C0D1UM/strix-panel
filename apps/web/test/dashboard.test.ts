import { expect, test } from 'vitest'
import { formatBucket, presetStart, toOffsetIso } from '../src/lib/dashboard'

test('toOffsetIso keeps the instant and writes an explicit offset', () => {
  const date = new Date(2026, 8, 24, 15, 30, 5)
  const iso = toOffsetIso(date)
  expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
  expect(new Date(iso).getTime()).toBe(date.getTime())
})

test('presetStart is local midnight, counting today as day one', () => {
  const start = new Date(presetStart('7d', new Date(2026, 8, 24, 15, 30))!)
  expect([start.getMonth(), start.getDate(), start.getHours(), start.getMinutes()]).toEqual([
    8, 18, 0, 0,
  ])
  expect(presetStart('all')).toBeUndefined()
})

test('formatBucket labels days and months', () => {
  expect(formatBucket('2026-09-02', 'day')).toContain('2')
  expect(formatBucket('2026-09', 'month')).toContain('26')
})
