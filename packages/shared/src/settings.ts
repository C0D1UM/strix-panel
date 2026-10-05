// Panel settings stored in the `setting` table and edited on Admin → Settings. Each field is one row keyed
// `<section>.<field>`; a missing row means the default below.
export interface Settings {
  auth: {
    // false blocks every new account (email sign-up and first-time Google sign-in), not the db:seed admin.
    registrationEnabled: boolean
    // false: new users start pending and cannot start scans until an admin approves them.
    autoApproveUsers: boolean
  }
}

export type SettingsPatch = { [S in keyof Settings]?: Partial<Settings[S]> }

export const DEFAULT_SETTINGS: Settings = {
  auth: { registrationEnabled: true, autoApproveUsers: true },
}

type Section = Record<string, unknown>
type Sections = Record<string, Section | undefined>

// Lays stored rows over the defaults. Unknown keys and values of the wrong type are ignored.
export function mergeSettings(rows: readonly { key: string; value: unknown }[]): Settings {
  const merged = structuredClone(DEFAULT_SETTINGS)
  const sections = merged as unknown as Sections
  for (const { key, value } of rows) {
    const [section, field, ...rest] = key.split('.')
    const target = section === undefined ? undefined : sections[section]
    if (rest.length > 0 || !target || field === undefined || !(field in target)) continue
    if (typeof target[field] !== typeof value) continue
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
