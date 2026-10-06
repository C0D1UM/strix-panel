import { BUDGET_WINDOWS, type BudgetWindow } from './budget'
import { SCAN_TARGETS_HARD_LIMIT } from './index'

// Panel settings stored in the `setting` table and edited on Admin → Settings. Each field is one row keyed
// `<section>.<field>`; a missing row means the default below.
export interface Settings {
  auth: {
    // false blocks every new account (email sign-up and first-time Google sign-in), not the db:seed admin.
    registrationEnabled: boolean
    // false: new users start pending and cannot start scans until an admin approves them.
    autoApproveUsers: boolean
  }
  budget: {
    // What a user with a budget must have left (USD) to start or resume a scan, so scans don't run out halfway.
    minToStartUsd: number
    // Budget given to every new account (admins included). Off: new accounts are unlimited. The amount and
    // window are kept while it is off.
    newUserLimitEnabled: boolean
    newUserLimitUsd: number
    newUserWindow: BudgetWindow
  }
  scans: {
    // Targets (URLs and spec files together) a new scan may have, 1 to SCAN_TARGETS_HARD_LIMIT. Existing scans
    // keep theirs, also on resume.
    maxTargets: number
  }
}

export type SettingsPatch = { [S in keyof Settings]?: Partial<Settings[S]> }

export const DEFAULT_SETTINGS: Settings = {
  auth: { registrationEnabled: true, autoApproveUsers: true },
  budget: {
    minToStartUsd: 3,
    newUserLimitEnabled: false,
    newUserLimitUsd: 10,
    newUserWindow: 'month',
  },
  scans: { maxTargets: 3 },
}

// Fields limited to a fixed set of values. A stored value outside it falls back to the default.
const ALLOWED_VALUES: Record<string, readonly unknown[]> = {
  'budget.newUserWindow': BUDGET_WINDOWS,
}

// Whole-number fields and their bounds. A stored value outside them falls back to the default.
const INTEGER_RANGES: Record<string, readonly [number, number]> = {
  'scans.maxTargets': [1, SCAN_TARGETS_HARD_LIMIT],
}

function inRange(key: string, value: unknown): boolean {
  const range = INTEGER_RANGES[key]
  if (!range) return true
  return Number.isInteger(value) && (value as number) >= range[0] && (value as number) <= range[1]
}

type Section = Record<string, unknown>
type Sections = Record<string, Section | undefined>

// Lays stored rows over the defaults. Unknown keys and invalid values are ignored.
export function mergeSettings(rows: readonly { key: string; value: unknown }[]): Settings {
  const merged = structuredClone(DEFAULT_SETTINGS)
  const sections = merged as unknown as Sections
  for (const { key, value } of rows) {
    const [section, field, ...rest] = key.split('.')
    const target = section === undefined ? undefined : sections[section]
    if (rest.length > 0 || !target || field === undefined || !(field in target)) continue
    if (typeof target[field] !== typeof value) continue
    if (ALLOWED_VALUES[key] && !ALLOWED_VALUES[key].includes(value)) continue
    if (!inRange(key, value)) continue
    target[field] = value
  }
  return merged
}

export function flattenPatch(patch: SettingsPatch): { key: string; value: unknown }[] {
  return Object.entries(patch).flatMap(([section, fields]) =>
    Object.entries(fields ?? {}).map(([field, value]) => ({ key: `${section}.${field}`, value })),
  )
}

// The fields of `draft` that differ from `saved`; `{}` when nothing changed.
export function diffSettings(saved: Settings, draft: Settings): SettingsPatch {
  const before = saved as unknown as Sections
  const patch: Record<string, Section> = {}
  for (const [section, fields] of Object.entries(draft as unknown as Sections)) {
    for (const [field, value] of Object.entries(fields ?? {})) {
      if (before[section]?.[field] !== value) (patch[section] ??= {})[field] = value
    }
  }
  return patch as SettingsPatch
}
