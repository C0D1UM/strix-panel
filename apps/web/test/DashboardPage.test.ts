import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, test, vi } from 'vitest'
import DashboardPage from '../src/pages/DashboardPage.vue'
import { currentUser, type CurrentUser } from '../src/lib/current-user'

const get = vi.fn()
vi.mock('../src/lib/api', () => ({
  api: { v1: { dashboard: { get: (options: unknown) => get(options) } } },
}))

const zeroFindings = { critical: 0, high: 0, medium: 0, low: 0, info: 1 }
const response = (withAdmin: boolean, total = 1) => ({
  data: {
    kpis: {
      runs: { total, completed: total, failed: 0, stopped: 0, running: 0 },
      tokens: { input: 1000, output: 500, cached: 0 },
      costUsd: 1.5,
      findings: zeroFindings,
    },
    series: {
      granularity: 'day',
      points: [{ bucket: '2026-09-24', runs: 1, tokens: 1500, costUsd: 1.5 }],
    },
    statusCounts: { queued: 0, running: 0, stopping: 0, completed: total, failed: 0, stopped: 0 },
    ...(withAdmin
      ? {
          admin: {
            users: { total: 3, active: 1 },
            health: { queued: 0, running: 0, failureRate: null },
            perUser: [
              {
                userId: 'u1',
                name: 'alice',
                email: 'alice@example.com',
                runs: 1,
                tokens: 1500,
                costUsd: 1.5,
                findings: 1,
              },
            ],
          },
        }
      : {}),
  },
  error: null,
})

const stubs = { TrendChart: true, SeverityChart: true, StatusChart: true, RouterLink: true }
const signIn = (role: 'admin' | 'user') => {
  currentUser.value = {
    id: 'me',
    name: 'Me',
    email: 'me@example.com',
    image: null,
    role,
  } as CurrentUser
}

beforeEach(() => get.mockReset())

test('members see their metrics without admin sections or the scope toggle', async () => {
  signIn('user')
  get.mockResolvedValue(response(false))
  const wrapper = mount(DashboardPage, { global: { stubs } })
  await flushPromises()
  expect(wrapper.text()).toContain('$1.50')
  expect(wrapper.find('[data-testid="scope-toggle"]').exists()).toBe(false)
  expect(wrapper.find('[data-testid="admin-section"]').exists()).toBe(false)
  expect(get.mock.calls[0]![0]).toEqual({ query: { start: expect.any(String) } })
})

test('admins get the admin section and can switch to their own scans', async () => {
  signIn('admin')
  get.mockResolvedValue(response(true))
  const wrapper = mount(DashboardPage, { global: { stubs } })
  await flushPromises()
  expect(wrapper.find('[data-testid="admin-section"]').exists()).toBe(true)
  expect(wrapper.findAll('[data-testid="user-usage-row"]')).toHaveLength(1)
  const mine = wrapper
    .findAll('[data-testid="scope-toggle"] button')
    .find((b) => b.text() === 'Mine')!
  await mine.trigger('click')
  await flushPromises()
  expect(get.mock.calls.at(-1)![0]).toMatchObject({ query: { scope: 'me' } })
})

test('all time sends no start', async () => {
  signIn('user')
  get.mockResolvedValue(response(false))
  const wrapper = mount(DashboardPage, { global: { stubs } })
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'All time')!
    .trigger('click')
  await flushPromises()
  expect(get.mock.calls.at(-1)![0]).toEqual({ query: {} })
})

test('shows an empty state when there are no scans in range', async () => {
  signIn('user')
  get.mockResolvedValue(response(false, 0))
  const wrapper = mount(DashboardPage, { global: { stubs } })
  await flushPromises()
  expect(wrapper.find('[data-testid="dashboard-empty"]').exists()).toBe(true)
})

test('hides the previous data when a reload fails', async () => {
  signIn('user')
  get
    .mockResolvedValueOnce(response(false))
    .mockResolvedValueOnce({ data: null, error: { status: 500 } })
  const wrapper = mount(DashboardPage, { global: { stubs } })
  await flushPromises()
  expect(wrapper.text()).toContain('$1.50')
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '7 days')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect(wrapper.text()).not.toContain('$1.50')
})
