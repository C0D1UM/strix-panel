import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import ScansPage from '../src/pages/ScansPage.vue'
import { currentUser, type CurrentUser } from '../src/lib/current-user'

const counts = { all: 0, active: 0, completed: 0, failed: 0, stopped: 0 }
const scansGet = vi.fn()
const usersGet = vi.fn()

vi.mock('../src/lib/api', () => ({
  api: {
    v1: {
      scans: { get: (...args: unknown[]) => scansGet(...args) },
      admin: { users: { get: () => usersGet() } },
    },
  },
}))

const Empty = { template: '<div />' }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/scans', name: 'scans', component: Empty },
    { path: '/scans/:id', name: 'scan', component: Empty },
  ],
})

const me = (approved: boolean, role: 'user' | 'admin' = 'user'): CurrentUser => ({
  id: 'u1',
  name: 'Ann',
  email: 'ann@example.com',
  image: null,
  role,
  approved,
})

const list = (over: Partial<typeof counts> = {}, total = 0) => ({
  data: { items: [], page: 1, pageSize: 20, total, counts: { ...counts, ...over } },
  error: null,
})

async function mountPage(user: CurrentUser) {
  currentUser.value = user
  await router.push('/scans')
  const wrapper = mount(ScansPage, {
    global: { plugins: [router], stubs: { NewScanDialog: true } },
  })
  await flushPromises()
  return wrapper
}

const lastQuery = () => scansGet.mock.lastCall?.[0].query

beforeEach(() => {
  scansGet.mockReset().mockResolvedValue(list())
  usersGet.mockReset().mockResolvedValue({
    data: [
      { id: 'u1', name: 'Ann', status: 'active' },
      { id: 'u2', name: 'Bob', status: 'removed' },
    ],
    error: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
  currentUser.value = null
})

const newScanButtons = async (approved: boolean) =>
  (await mountPage(me(approved))).findAll('button').filter((b) => b.text().includes('New scan'))

test('pending users cannot open the new scan form', async () => {
  const buttons = await newScanButtons(false)
  expect(buttons).toHaveLength(2)
  for (const button of buttons) {
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('title')).toBe('Waiting for admin approval')
  }
})

test('approved users can', async () => {
  const buttons = await newScanButtons(true)
  for (const button of buttons) expect(button.attributes('disabled')).toBeUndefined()
})

test('tabs show counts and filter the list', async () => {
  scansGet.mockResolvedValue(list({ all: 3, active: 1, completed: 2 }, 3))
  const wrapper = await mountPage(me(true))
  expect(lastQuery()).toEqual({ page: 1, pageSize: 20 })
  expect(wrapper.get('[data-testid="tab-completed"]').text()).toContain('2')

  await wrapper.get('[data-testid="tab-completed"]').trigger('click')
  await flushPromises()
  expect(lastQuery()).toEqual({ page: 1, pageSize: 20, tab: 'completed' })
})

test('search is debounced, trimmed and resets to page 1', async () => {
  scansGet.mockResolvedValue(list({ all: 60 }, 60))
  const wrapper = await mountPage(me(true))
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Next')!
    .trigger('click')
  await flushPromises()
  expect(lastQuery().page).toBe(2)

  vi.useFakeTimers()
  const calls = scansGet.mock.calls.length
  await wrapper.get('input[type="search"]').setValue('  shop ')
  expect(scansGet.mock.calls.length).toBe(calls)
  await vi.advanceTimersByTimeAsync(300)
  expect(lastQuery()).toEqual({ page: 1, pageSize: 20, q: 'shop' })
})

test('only admins get the owner filter, which lists removed users labelled', async () => {
  const asUser = await mountPage(me(true))
  expect(asUser.find('select').exists()).toBe(false)
  expect(usersGet).not.toHaveBeenCalled()

  const asAdmin = await mountPage(me(true, 'admin'))
  const options = asAdmin.findAll('select option').map((o) => o.text())
  expect(options).toEqual(['All owners', 'Ann', 'Bob (removed)'])

  await asAdmin.get('select').setValue('u2')
  await flushPromises()
  expect(lastQuery()).toEqual({ page: 1, pageSize: 20, ownerId: 'u2' })
})

test('a filtered list with no matches says so instead of the first-scan prompt', async () => {
  scansGet.mockResolvedValue(list({ all: 4, completed: 4 }))
  const wrapper = await mountPage(me(true))
  await wrapper.get('[data-testid="tab-failed"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('No failed scans.')
  expect(wrapper.text()).not.toContain('No scans yet')
})
