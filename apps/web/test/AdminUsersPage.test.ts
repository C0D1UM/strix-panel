import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import UserActionsMenu from '../src/components/UserActionsMenu.vue'
import { useToast } from '../src/composables/useToast'
import AdminUsersPage from '../src/pages/AdminUsersPage.vue'
import type * as currentUserModule from '../src/lib/current-user'
import { currentUser } from '../src/lib/current-user'

type CurrentUserModule = typeof currentUserModule

const get = vi.fn()
const approve = vi.fn()
const patchBudget = vi.fn()
vi.mock('../src/lib/api', () => ({
  api: {
    v1: {
      admin: {
        users: Object.assign(
          ({ id }: { id: string }) => ({
            approve: { post: () => approve() },
            budget: { patch: (body: unknown) => patchBudget(id, body) },
          }),
          { get: () => get() },
        ),
      },
      config: {
        get: () =>
          Promise.resolve({
            data: {
              auth: { providers: ['email'], registrationEnabled: true },
              branding: { showPoweredBy: false },
              budget: { minToStartUsd: 3 },
            },
            error: null,
          }),
      },
    },
  },
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
  budget: { limitUsd: null as number | null, window: 'month', spentUsd: 0.25 },
  lastRunAt: id === 'a' ? '2026-09-24T15:30:00.000Z' : null,
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
  const { toasts } = useToast()
  toasts.value = []
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

test('your own row only offers the budget', async () => {
  const wrapper = await mountPage()
  const menus = wrapper.findAllComponents(UserActionsMenu)
  const mine = menus.find((m) => m.props('user').id === 'me')!
  expect(mine.props('self')).toBe(true)
  const ann = menus.find((m) => m.props('user').id === 'a')!
  expect(ann.props('self')).toBe(false)
})

test('shows an empty state for an empty tab', async () => {
  const wrapper = await mountPage()
  await wrapper.find('[data-testid="tab-disabled"]').trigger('click')
  expect(wrapper.text()).toContain('No disabled users.')
})

const annRow = (wrapper: Awaited<ReturnType<typeof mountPage>>) =>
  wrapper
    .findAll('[data-testid="user-row"]')
    .find((r) => r.find('[data-testid="user-name"]').text() === 'Ann')!

test('shows the budget, total cost and only the date of the last run', async () => {
  const wrapper = await mountPage()
  const ann = annRow(wrapper)
  expect(ann.find('[data-testid="budget"]').text()).toBe('Unlimited · $0.25 this month')
  expect(ann.text()).toContain('$0.5000')
  const lastRun = ann.find('[data-testid="last-run"]')
  expect(lastRun.text()).toBe(
    new Date('2026-09-24T15:30:00.000Z').toLocaleDateString(undefined, { dateStyle: 'medium' }),
  )
  expect(lastRun.find('a').exists()).toBe(false)
})

test('a successful action shows a success toast', async () => {
  approve.mockResolvedValue({ data: row('p', 'Pat', 'active'), error: null })
  const wrapper = await mountPage()
  const pat = wrapper.findAllComponents(UserActionsMenu).find((m) => m.props('user').id === 'p')!
  pat.vm.$emit('select', 'approve')
  await flushPromises()
  expect(useToast().toasts.value).toMatchObject([{ message: 'Pat approved.', tone: 'success' }])
})

test('a failed action shows an error toast with the reason', async () => {
  approve.mockResolvedValue({
    data: null,
    error: {
      value: { error: { code: 'ALREADY_APPROVED', message: 'This user is already approved' } },
    },
  })
  const wrapper = await mountPage()
  const pat = wrapper.findAllComponents(UserActionsMenu).find((m) => m.props('user').id === 'p')!
  pat.vm.$emit('select', 'approve')
  await flushPromises()
  expect(useToast().toasts.value).toMatchObject([
    { message: "Couldn't approve Pat: This user is already approved", tone: 'error' },
  ])
})

test('sets a budget from the menu and updates the row', async () => {
  patchBudget.mockResolvedValue({
    data: { ...row('a', 'Ann', 'active'), budget: { limitUsd: 2, window: 'week', spentUsd: 0.25 } },
    error: null,
  })
  const wrapper = await mountPage()
  const ann = wrapper.findAllComponents(UserActionsMenu).find((m) => m.props('user').id === 'a')!
  ann.vm.$emit('budget')
  await flushPromises()
  const dialog = document.body
  const amount = dialog.querySelector<HTMLInputElement>('[data-testid="budget-amount"]')!
  amount.value = '2'
  amount.dispatchEvent(new Event('input'))
  const period = dialog.querySelector<HTMLSelectElement>('[data-testid="budget-window"]')!
  period.value = 'week'
  period.dispatchEvent(new Event('change'))
  await flushPromises()
  expect(dialog.querySelector('[data-testid="budget-below-minimum"]')?.textContent).toContain(
    "Below the $3.00 minimum, so this user can't start scans.",
  )
  dialog.querySelector('form')!.dispatchEvent(new Event('submit'))
  await flushPromises()
  expect(patchBudget).toHaveBeenCalledWith('a', { budgetUsd: 2, window: 'week' })
  expect(annRow(wrapper).find('[data-testid="budget"]').text()).toBe('$0.25 / $2.00 · week')
  expect(useToast().toasts.value).toMatchObject([{ message: 'Budget of Ann saved.' }])
  wrapper.unmount()
})
