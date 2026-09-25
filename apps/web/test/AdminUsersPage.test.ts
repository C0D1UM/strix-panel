import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import AdminUsersPage from '../src/pages/AdminUsersPage.vue'
import type * as currentUserModule from '../src/lib/current-user'
import { currentUser } from '../src/lib/current-user'

type CurrentUserModule = typeof currentUserModule

const get = vi.fn()
vi.mock('../src/lib/api', () => ({
  api: { v1: { admin: { users: Object.assign(() => ({}), { get: () => get() }) } } },
}))
vi.mock('../src/lib/current-user', async (original) => ({
  ...(await original<CurrentUserModule>()),
  loadCurrentUser: vi.fn(),
}))

const Empty = { template: '<div />' }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/scans/:id', name: 'scan', component: Empty }],
})

const row = (id: string, name: string, status: string, role = 'user') => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  image: null,
  role,
  status,
  runs: 1,
  costUsd: 0.5,
  lastRun: null,
  createdAt: '2026-01-01T00:00:00.000Z',
})

beforeEach(() => {
  currentUser.value = {
    id: 'me',
    name: 'Me',
    email: 'me@example.com',
    image: null,
    role: 'admin',
    approved: true,
    pendingUsers: 1,
  }
  get.mockResolvedValue({
    data: [
      row('p', 'Pat', 'pending'),
      row('me', 'Me', 'active', 'admin'),
      row('a', 'Ann', 'active'),
      row('r', 'Rex', 'removed'),
    ],
    error: null,
  })
})
afterEach(() => {
  currentUser.value = null
})

const mountPage = async () => {
  const wrapper = mount(AdminUsersPage, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const names = (wrapper: Awaited<ReturnType<typeof mountPage>>) =>
  wrapper.findAll('[data-testid="user-name"]').map((n) => n.text())

test('lists non-removed users with tab counts', async () => {
  const wrapper = await mountPage()
  expect(names(wrapper)).toEqual(['Pat', 'Me', 'Ann'])
  expect(wrapper.find('[data-testid="tab-pending"]').text()).toContain('1')
})

test('tabs and search filter the list', async () => {
  const wrapper = await mountPage()
  await wrapper.find('[data-testid="tab-removed"]').trigger('click')
  expect(names(wrapper)).toEqual(['Rex'])
  await wrapper.find('[data-testid="tab-all"]').trigger('click')
  await wrapper.find('input[type="search"]').setValue('ann')
  expect(names(wrapper)).toEqual(['Ann'])
})

test('your own row has no actions menu', async () => {
  const wrapper = await mountPage()
  const rows = wrapper.findAll('[data-testid="user-row"]')
  const byName = (name: string) =>
    rows.find((r) => r.find('[data-testid="user-name"]').text() === name)!
  const mine = byName('Me')
  expect(mine.text()).toContain('You')
  expect(mine.find('[data-testid="user-menu"]').exists()).toBe(false)
  const ann = byName('Ann')
  expect(ann.find('[data-testid="user-menu"]').exists()).toBe(true)
})

test('shows an empty state for an empty tab', async () => {
  const wrapper = await mountPage()
  await wrapper.find('[data-testid="tab-disabled"]').trigger('click')
  expect(wrapper.text()).toContain('No disabled users.')
})
