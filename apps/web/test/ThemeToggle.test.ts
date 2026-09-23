import { mount } from '@vue/test-utils'
import { expect, test, vi } from 'vitest'
import ThemeToggle from '../src/components/ThemeToggle.vue'
import { useTheme } from '../src/composables/useTheme'

vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {} }))

test('marks the selected theme as pressed', async () => {
  const wrapper = mount(ThemeToggle)
  await wrapper.get('button[aria-label="Dark"]').trigger('click')
  expect(wrapper.get('button[aria-label="Dark"]').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('button[aria-label="Light"]').attributes('aria-pressed')).toBe('false')
})

test('compact mode cycles light → dark → auto', async () => {
  const { theme, setTheme } = useTheme()
  setTheme('light')
  const wrapper = mount(ThemeToggle, { props: { compact: true } })
  const button = wrapper.get('button')

  await button.trigger('click')
  expect(theme.value).toBe('dark')
  await button.trigger('click')
  expect(theme.value).toBe('auto')
  await button.trigger('click')
  expect(theme.value).toBe('light')
})
