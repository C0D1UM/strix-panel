export const ROLES = ['admin', 'user'] as const
export type Role = (typeof ROLES)[number]

export const THEMES = ['light', 'dark', 'auto'] as const
export type Theme = (typeof THEMES)[number]

export function isAllowedEmail(email: string, allowedDomains: readonly string[]): boolean {
  if (allowedDomains.length === 0) return true
  const domain = email.split('@').at(-1)?.toLowerCase()
  return domain !== undefined && allowedDomains.includes(domain)
}
