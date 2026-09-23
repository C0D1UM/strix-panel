import { expect, test } from 'vitest'
import { SIDEBAR_STORAGE_KEY, useSidebar } from '../src/composables/useSidebar'

test('collapse state toggles and is remembered', () => {
  const { collapsed, toggleCollapsed } = useSidebar()
  expect(collapsed.value).toBe(false)

  toggleCollapsed()
  expect(collapsed.value).toBe(true)
  expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('true')

  toggleCollapsed()
  expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('false')
})

test('mobile drawer opens and closes', () => {
  const { mobileOpen, openMobile, closeMobile } = useSidebar()
  openMobile()
  expect(mobileOpen.value).toBe(true)
  closeMobile()
  expect(mobileOpen.value).toBe(false)
})
