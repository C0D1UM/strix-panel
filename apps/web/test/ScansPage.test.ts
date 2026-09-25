import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import ScansPage from '../src/pages/ScansPage.vue'
import { currentUser, type CurrentUser } from '../src/lib/current-user'

vi.mock('../src/lib/api', () => ({
  api: {
    v1: {
      scans: {
        get: () =>
          Promise.resolve({ data: { items: [], page: 1, pageSize: 20, total: 0 }, error: null }),
      },
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

const me = (approved: boolean): CurrentUser => ({
  id: 'u1',
  name: 'Ann',
  email: 'ann@example.com',
  image: null,
  role: 'user',
  approved,
})

const newScanButtons = async (approved: boolean) => {
  currentUser.value = me(approved)
  await router.push('/scans')
  const wrapper = mount(ScansPage, {
    global: { plugins: [router], stubs: { NewScanDialog: true } },
  })
  await flushPromises()
  return wrapper.findAll('button').filter((b) => b.text().includes('New scan'))
}

afterEach(() => {
  currentUser.value = null
})

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
