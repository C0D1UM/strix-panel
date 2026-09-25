import type { UserStatus } from '@strix-panel/shared'
import { api } from './api'

export type AdminUser = NonNullable<
  Awaited<ReturnType<typeof api.v1.admin.users.get>>['data']
>[number]

export type UserAction =
  'approve' | 'disable' | 'enable' | 'remove' | 'restore' | 'makeAdmin' | 'removeAdmin'

export const USER_TABS = ['all', 'pending', 'active', 'disabled', 'removed'] as const
export type UserTab = (typeof USER_TABS)[number]

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Active',
  pending: 'Pending',
  disabled: 'Disabled',
  removed: 'Removed',
}

export const TAB_LABELS: Record<UserTab, string> = { all: 'All', ...USER_STATUS_LABELS }

export const ACTION_LABELS: Record<UserAction, string> = {
  approve: 'Approve',
  disable: 'Disable',
  enable: 'Enable',
  remove: 'Remove',
  restore: 'Restore',
  makeAdmin: 'Make admin',
  removeAdmin: 'Remove admin',
}

// Actions that ask first. The rest run on click.
export const CONFIRMATIONS: Partial<
  Record<UserAction, { title: (name: string) => string; description: string; button: string }>
> = {
  disable: {
    title: (name) => `Disable ${name}?`,
    description:
      "They'll be signed out and can't sign in until re-enabled. Running scans will finish.",
    button: 'Disable user',
  },
  remove: {
    title: (name) => `Remove ${name}?`,
    description:
      "They'll be signed out and can't sign in. Their scans stay visible to admins, and you can restore them later.",
    button: 'Remove user',
  },
  removeAdmin: {
    title: (name) => `Remove admin from ${name}?`,
    description:
      "They'll keep their account but lose the Admin pages and access to other users' scans.",
    button: 'Remove admin',
  },
}

export const ACTION_DONE: Record<UserAction, (name: string) => string> = {
  approve: (name) => `${name} approved.`,
  disable: (name) => `${name} disabled.`,
  enable: (name) => `${name} enabled.`,
  remove: (name) => `${name} removed.`,
  restore: (name) => `${name} restored.`,
  makeAdmin: (name) => `${name} is now an admin.`,
  removeAdmin: (name) => `${name} is no longer an admin.`,
}

export const actionFailed = (action: UserAction, name: string, reason: string) =>
  `Couldn't ${ACTION_LABELS[action].toLowerCase()} ${name}: ${reason}`

export function availableActions(user: Pick<AdminUser, 'status' | 'role'>): UserAction[] {
  const roleAction: UserAction = user.role === 'admin' ? 'removeAdmin' : 'makeAdmin'
  switch (user.status) {
    case 'pending':
      return ['approve', 'makeAdmin', 'disable', 'remove']
    case 'active':
      return [roleAction, 'disable', 'remove']
    case 'disabled':
      return ['enable', roleAction, 'remove']
    case 'removed':
      return ['restore']
  }
}

export function filterUsers(users: AdminUser[], tab: UserTab, search: string): AdminUser[] {
  const query = search.trim().toLowerCase()
  return users.filter(
    (user) =>
      (tab === 'all' ? user.status !== 'removed' : user.status === tab) &&
      (!query ||
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)),
  )
}

function call(id: string, action: UserAction) {
  const user = api.v1.admin.users({ id })
  switch (action) {
    case 'approve':
      return user.approve.post()
    case 'disable':
      return user.disable.post()
    case 'enable':
      return user.enable.post()
    case 'restore':
      return user.restore.post()
    case 'remove':
      return user.delete()
    case 'makeAdmin':
      return user.role.post({ role: 'admin' })
    case 'removeAdmin':
      return user.role.post({ role: 'user' })
  }
}

export async function runUserAction(id: string, action: UserAction) {
  const { data, error } = await call(id, action)
  if (error || !data) {
    const message = (error?.value as { error?: { message?: string } } | undefined)?.error?.message
    return { data: null, error: message ?? 'Something went wrong. Try again.' }
  }
  return { data: data as AdminUser, error: null }
}
