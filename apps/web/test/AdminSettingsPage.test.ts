import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useToast } from '../src/composables/useToast'
import AdminSettingsPage from '../src/pages/AdminSettingsPage.vue'
import { session } from '../src/lib/session'

const get = vi.fn()
const patch = vi.fn()
vi.mock('../src/lib/api', () => ({
  api: {
    v1: { admin: { settings: { get: () => get(), patch: (body: unknown) => patch(body) } } },
  },
}))
vi.mock('../src/lib/public-config', () => ({ reloadPublicConfig: vi.fn() }))

const saved = {
  auth: { registrationEnabled: true, autoApproveUsers: true },
  budget: {
    minToStartUsd: 3,
    newUserLimitEnabled: false,
    newUserLimitUsd: 10,
    newUserWindow: 'month',
  },
}
const Empty = { template: '<div />' }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/admin/settings', name: 'admin-settings', component: AdminSettingsPage },
    { path: '/dashboard', name: 'dashboard', component: Empty },
  ],
})

beforeEach(async () => {
  session.value = { user: { id: 'me' } } as unknown as typeof session.value
  get.mockResolvedValue({ data: structuredClone(saved), error: null })
  patch.mockReset()
  await router.push('/admin/settings')
})
afterEach(() => {
  useToast().toasts.value = []
})

// Mounted through the router so onBeforeRouteLeave applies.
const mountPage = async () => {
  const wrapper = mount(
    { template: '<RouterView />' },
    {
      global: { plugins: [router] },
      attachTo: document.body,
    },
  )
  await flushPromises()
  return wrapper
}
type Wrapper = Awaited<ReturnType<typeof mountPage>>
const switches = (w: Wrapper) => w.findAll('[role="switch"]')
const saveBar = (w: Wrapper) => w.find('[data-testid="save-bar"]')

test('shows the sign-up section in the outline and the saved values', async () => {
  const wrapper = await mountPage()
  const outline = wrapper.get('nav[aria-label="On this page"]').text()
  expect(outline).toContain('Sign-up')
  expect(outline).toContain('Budgets')
  expect(switches(wrapper).map((s) => s.attributes('aria-checked'))).toEqual([
    'true',
    'true',
    'false',
  ])
  expect(wrapper.find('[data-testid="new-user-limit-fields"]').exists()).toBe(false)
  expect((wrapper.get('[data-testid="min-to-start"]').element as HTMLInputElement).value).toBe('3')
  expect(saveBar(wrapper).exists()).toBe(false)
  wrapper.unmount()
})

test('discard restores the saved values', async () => {
  const wrapper = await mountPage()
  await switches(wrapper)[0]!.trigger('click')
  expect(saveBar(wrapper).exists()).toBe(true)
  await wrapper.get('[data-testid="discard"]').trigger('click')
  expect(saveBar(wrapper).exists()).toBe(false)
  expect(switches(wrapper)[0]!.attributes('aria-checked')).toBe('true')
  wrapper.unmount()
})

test('save sends only the changed fields', async () => {
  patch.mockResolvedValue({
    data: { ...saved, auth: { registrationEnabled: true, autoApproveUsers: false } },
    error: null,
  })
  const wrapper = await mountPage()
  await switches(wrapper)[1]!.trigger('click')
  await wrapper.get('[data-testid="save"]').trigger('click')
  await flushPromises()
  expect(patch).toHaveBeenCalledWith({ auth: { autoApproveUsers: false } })
  expect(saveBar(wrapper).exists()).toBe(false)
  expect(useToast().toasts.value.at(-1)).toMatchObject({
    message: 'Settings saved.',
    tone: 'success',
  })
  wrapper.unmount()
})

test('limiting new users shows the amount and period, and saves them', async () => {
  patch.mockImplementation(async (body: { budget: object }) => ({
    data: { ...saved, budget: { ...saved.budget, ...body.budget } },
    error: null,
  }))
  const wrapper = await mountPage()
  await switches(wrapper)[2]!.trigger('click')
  expect(wrapper.find('[data-testid="new-user-limit-fields"]').exists()).toBe(true)
  await wrapper.get('[data-testid="new-user-limit-amount"]').setValue('25')
  await wrapper.get('[data-testid="new-user-limit-window"]').setValue('week')
  await wrapper.get('[data-testid="save"]').trigger('click')
  await flushPromises()
  expect(patch).toHaveBeenCalledWith({
    budget: { newUserLimitEnabled: true, newUserLimitUsd: 25, newUserWindow: 'week' },
  })
  expect(saveBar(wrapper).exists()).toBe(false)
  wrapper.unmount()
})

test('an invalid amount blocks saving', async () => {
  const wrapper = await mountPage()
  await wrapper.get('[data-testid="min-to-start"]').setValue('')
  expect(wrapper.text()).toContain('Enter an amount')
  expect(wrapper.get('[data-testid="save"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-testid="min-to-start"]').setValue('1.234')
  expect(wrapper.text()).toContain('Use whole cents')
  await wrapper.get('[data-testid="save"]').trigger('click')
  expect(patch).not.toHaveBeenCalled()
  wrapper.unmount()
})

test('warns when the default limit is below the minimum to start', async () => {
  const wrapper = await mountPage()
  await switches(wrapper)[2]!.trigger('click')
  await wrapper.get('[data-testid="new-user-limit-amount"]').setValue('2')
  expect(wrapper.get('[data-testid="limit-below-minimum"]').text()).toContain('$3.00 minimum')
  wrapper.unmount()
})

test('a failed save keeps the changes and shows an error', async () => {
  patch.mockResolvedValue({ data: null, error: { status: 500 } })
  const wrapper = await mountPage()
  await switches(wrapper)[0]!.trigger('click')
  await wrapper.get('[data-testid="save"]').trigger('click')
  await flushPromises()
  expect(saveBar(wrapper).exists()).toBe(true)
  expect(useToast().toasts.value.at(-1)?.tone).toBe('error')
  wrapper.unmount()
})

test('leaving with unsaved changes asks first', async () => {
  const wrapper = await mountPage()
  await switches(wrapper)[0]!.trigger('click')
  await router.push('/dashboard')
  await flushPromises()
  expect(router.currentRoute.value.name).toBe('admin-settings')
  expect(document.body.textContent).toContain('Discard unsaved changes?')
  wrapper.unmount()
})

test('signing out with unsaved changes goes to the login page without asking', async () => {
  const wrapper = await mountPage()
  await switches(wrapper)[0]!.trigger('click')
  session.value = null
  await router.push('/dashboard')
  await flushPromises()
  expect(router.currentRoute.value.name).toBe('dashboard')
  expect(document.body.textContent).not.toContain('Discard unsaved changes?')
  wrapper.unmount()
})

test('a failed load shows an inline error', async () => {
  get.mockResolvedValue({ data: null, error: { status: 500 } })
  const wrapper = await mountPage()
  expect(wrapper.get('[role="alert"]').text()).toBe('Could not load settings.')
  wrapper.unmount()
})
