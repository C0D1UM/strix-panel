export const ROLES = ['admin', 'user'] as const
export type Role = (typeof ROLES)[number]

export const THEMES = ['light', 'dark', 'auto'] as const
export type Theme = (typeof THEMES)[number]

export function isAllowedEmail(email: string, allowedDomains: readonly string[]): boolean {
  if (allowedDomains.length === 0) return true
  const domain = email.split('@').at(-1)?.toLowerCase()
  return domain !== undefined && allowedDomains.includes(domain)
}

export const SCAN_MODES = ['quick', 'standard', 'deep'] as const
export type ScanMode = (typeof SCAN_MODES)[number]

export const SCAN_STATUSES = [
  'queued',
  'running',
  'stopping',
  'completed',
  'failed',
  'stopped',
] as const
export type ScanStatus = (typeof SCAN_STATUSES)[number]

export const FINISHED_SCAN_STATUSES = [
  'completed',
  'failed',
  'stopped',
] as const satisfies readonly ScanStatus[]

export function isFinishedScanStatus(status: string): boolean {
  return (FINISHED_SCAN_STATUSES as readonly string[]).includes(status)
}

export const SCAN_EVENT_TYPES = [
  'status',
  'agent_started',
  'agent_finished',
  'agent_failed',
  'finding',
] as const
export type ScanEventType = (typeof SCAN_EVENT_TYPES)[number]

// Ordered most severe first.
export const FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number]

export const MAX_SCAN_TARGETS = 3
export const MAX_SCAN_INSTRUCTION_LENGTH = 4000
export const MAX_SCAN_NAME_LENGTH = 120

// Parses one http(s) target URL. Returns the normalized URL, or null when it is not a valid http(s) URL.
export function normalizeScanTarget(value: string): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname) return null
  return url.toString()
}
