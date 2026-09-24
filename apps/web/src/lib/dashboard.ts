import type { api } from './api'

export type Dashboard = NonNullable<Awaited<ReturnType<typeof api.v1.dashboard.get>>['data']>

export const RANGE_PRESETS = ['7d', '30d', '90d', 'all'] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

export const RANGE_LABELS: Record<RangePreset, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  all: 'All time',
}

const PRESET_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const

const pad = (n: number) => String(n).padStart(2, '0')

// Local wall time with its UTC offset, e.g. 2026-09-18T00:00:00+07:00. The API buckets days in this offset.
export function toOffsetIso(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

// Start of the range: local midnight, counting today as the first day. `all` has no start.
export function presetStart(preset: RangePreset, now = new Date()): string | undefined {
  if (preset === 'all') return undefined
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (PRESET_DAYS[preset] - 1),
  )
  return toOffsetIso(start)
}

export function formatBucket(bucket: string, granularity: 'day' | 'month'): string {
  if (granularity === 'day') {
    return new Date(`${bucket}T00:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  }
  return new Date(`${bucket}-01T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    year: '2-digit',
  })
}
