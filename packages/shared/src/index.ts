export const ROLES = ['admin', 'user'] as const
export type Role = (typeof ROLES)[number]

export function toRole(role: string | null | undefined): Role {
  return ROLES.includes(role as Role) ? (role as Role) : 'user'
}

export const USER_STATUSES = ['active', 'pending', 'disabled', 'removed'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export interface UserStatusInput {
  approvedAt: Date | string | null | undefined
  banned: boolean | null | undefined
  deletedAt: Date | string | null | undefined
}

// Priority: removed > disabled > pending > active. Restoring only clears deletedAt, so the earlier state returns.
export function userStatus(user: UserStatusInput): UserStatus {
  if (user.deletedAt) return 'removed'
  if (user.banned) return 'disabled'
  if (!user.approvedAt) return 'pending'
  return 'active'
}

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

export interface ResumableScan {
  status: ScanStatus
  runName: string | null
  agentCount: number
  costUsd: number
  maxBudgetUsd: number | null
}

export type ScanResumeCheck =
  | { ok: true; mode: 'fresh' | 'continue' }
  | { ok: false; code: 'SCAN_NOT_RESUMABLE' | 'SCAN_BUDGET_EXHAUSTED'; message: string }

// Whether a scan can be resumed, and how. A scan that ended before Strix created its run starts over (`fresh`);
// one with a run and a saved agent snapshot continues it with `strix --resume` (`continue`).
export function checkScanResume(scan: ResumableScan): ScanResumeCheck {
  if (scan.status !== 'failed' && scan.status !== 'stopped') {
    return {
      ok: false,
      code: 'SCAN_NOT_RESUMABLE',
      message: `Scan is ${scan.status} and cannot be resumed`,
    }
  }
  if (scan.runName === null) return { ok: true, mode: 'fresh' }
  if (scan.agentCount === 0) {
    return {
      ok: false,
      code: 'SCAN_NOT_RESUMABLE',
      message: 'The scan ended before Strix saved any progress, so there is nothing to resume',
    }
  }
  if (scan.maxBudgetUsd !== null && scan.costUsd >= scan.maxBudgetUsd) {
    return { ok: false, code: 'SCAN_BUDGET_EXHAUSTED', message: 'The budget cap is used up' }
  }
  return { ok: true, mode: 'continue' }
}
