import type { FindingSeverity, ScanStatus, ScanTab } from '@strix-panel/shared'
import type { api } from './api'

type ScanList = NonNullable<Awaited<ReturnType<typeof api.v1.scans.get>>['data']>
export type Scan = ScanList['items'][number]
type ScanRoutes = ReturnType<typeof api.v1.scans>
export type ScanEvent = NonNullable<
  Awaited<ReturnType<ScanRoutes['events']['get']>>['data']
>[number]
export type ScanFinding = NonNullable<
  Awaited<ReturnType<ScanRoutes['findings']['get']>>['data']
>[number]

export const STATUS_LABELS: Record<ScanStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  stopping: 'Stopping',
  completed: 'Completed',
  failed: 'Failed',
  stopped: 'Stopped',
}

export const SCAN_TAB_LABELS: Record<ScanTab, string> = {
  all: 'All',
  active: 'Active',
  completed: 'Completed',
  failed: 'Failed',
  stopped: 'Stopped',
}

export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
}

export const SCAN_MODE_HINTS = {
  quick: 'Fast checks, good for CI',
  standard: 'Routine testing',
  deep: 'Thorough review (Strix default)',
} as const

export function scanTitle(scan: Pick<Scan, 'name' | 'targets'>): string {
  if (scan.name) return scan.name
  const [first, ...rest] = scan.targets
  const host = first ? new URL(first).host : 'Scan'
  return rest.length > 0 ? `${host} +${rest.length}` : host
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(n > 0 && n < 1 ? 4 : 2)}`
}

export function formatDuration(from: string | null, to: string | Date | null): string {
  if (!from) return '—'
  const end = to ? new Date(to).getTime() : Date.now()
  const total = Math.max(0, Math.floor((end - new Date(from).getTime()) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { timeStyle: 'medium' })
}
