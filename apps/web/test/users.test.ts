import { expect, test, vi } from 'vitest'
import { availableActions, filterUsers, type AdminUser } from '../src/lib/users'

vi.mock('../src/lib/api', () => ({ api: {} }))

const u = (over: Partial<AdminUser>): AdminUser => ({
  id: 'x',
  name: 'Ann',
  email: 'ann@example.com',
  image: null,
  role: 'user',
  status: 'active',
  runs: 0,
  costUsd: 0,
  costThisMonthUsd: 0,
  lastRunAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

test('actions offered per status and role', () => {
  expect(availableActions(u({ status: 'pending' }))).toEqual([
    'approve',
    'makeAdmin',
    'disable',
    'remove',
  ])
  expect(availableActions(u({ status: 'active' }))).toEqual(['makeAdmin', 'disable', 'remove'])
  expect(availableActions(u({ status: 'active', role: 'admin' }))).toEqual([
    'removeAdmin',
    'disable',
    'remove',
  ])
  expect(availableActions(u({ status: 'disabled' }))).toEqual(['enable', 'makeAdmin', 'remove'])
  expect(availableActions(u({ status: 'removed', role: 'admin' }))).toEqual(['restore'])
})

test('tabs filter by status; "all" leaves out removed', () => {
  const users = [
    u({ id: 'a', status: 'active' }),
    u({ id: 'p', status: 'pending' }),
    u({ id: 'r', status: 'removed' }),
  ]
  expect(filterUsers(users, 'all', '').map((x) => x.id)).toEqual(['a', 'p'])
  expect(filterUsers(users, 'pending', '').map((x) => x.id)).toEqual(['p'])
  expect(filterUsers(users, 'removed', '').map((x) => x.id)).toEqual(['r'])
})

test('search matches name or email, case-insensitive', () => {
  const users = [
    u({ id: '1', name: 'Alice', email: 'a@example.com' }),
    u({ id: '2', name: 'Bob', email: 'bob@corp.example' }),
  ]
  expect(filterUsers(users, 'all', 'ALI').map((x) => x.id)).toEqual(['1'])
  expect(filterUsers(users, 'all', 'corp').map((x) => x.id)).toEqual(['2'])
  expect(filterUsers(users, 'all', '  ').map((x) => x.id)).toEqual(['1', '2'])
})
