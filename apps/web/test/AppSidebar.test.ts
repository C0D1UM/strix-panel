import { mount } from '@vue/test-utils'
import { afterEach, expect, test } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppSidebar from '../src/components/AppSidebar.vue'
import { currentUser, type CurrentUser } from '../src/lib/current-user'

const Empty = { template: '<div />' }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/dashboard', name: 'dashboard', component: Empty },
    { path: '/scans', name: 'scans', component: Empty },
    { path: '/admin/users', name: 'admin-users', component: Empty },
  ],
})

const user = (over: Partial<CurrentUser>): CurrentUser => ({
  id: 'u1',
  name: 'Ann',
  email: 'ann@example.com',
  image: null,
  role: 'user',
  approved: true,
  ...over,
})

const mountSidebar = (collapsed = false) =>
  mount(AppSidebar, {
    props: { variant: 'desktop', collapsed },
    global: { plugins: [router], stubs: { ThemeToggle: true } },
  })

afterEach(() => {
  currentUser.value = null
})

test('regular users see no Admin section', () => {
  currentUser.value = user({})
  const text = mountSidebar().text()
  expect(text).toContain('Scans')
  expect(text).not.toContain('Admin')
  expect(text).not.toContain('Users')
})

test('admins see the Admin section with a pending badge', () => {
  currentUser.value = user({ role: 'admin', pendingUsers: 2 })
  const wrapper = mountSidebar()
  expect(wrapper.text()).toContain('Admin')
  expect(wrapper.find('[data-testid="nav-badge"]').text()).toBe('2')
})

test('no badge when nothing is pending', () => {
  currentUser.value = user({ role: 'admin', pendingUsers: 0 })
  expect(mountSidebar().find('[data-testid="nav-badge"]').exists()).toBe(false)
})

test('collapsed sidebar shows a dot instead of the count', () => {
  currentUser.value = user({ role: 'admin', pendingUsers: 3 })
  const wrapper = mountSidebar(true)
  expect(wrapper.find('[data-testid="nav-badge-dot"]').exists()).toBe(true)
  expect(wrapper.find('[data-testid="nav-badge"]').exists()).toBe(false)
})
