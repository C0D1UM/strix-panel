import { beforeEach, describe, expect, test, vi } from 'vitest'
import { THEME_STORAGE_KEY, useTheme } from '../src/composables/useTheme'

let systemDark = false
const listeners: (() => void)[] = []

vi.stubGlobal('matchMedia', () => ({
  get matches() {
    return systemDark
  },
  addEventListener: (_: string, cb: () => void) => listeners.push(cb),
}))

const isDark = () => document.documentElement.classList.contains('dark')

beforeEach(() => {
  systemDark = false
  useTheme().setTheme('auto')
})

describe('useTheme', () => {
  test('defaults to auto and follows the system setting live', () => {
    const { theme } = useTheme()
    expect(theme.value).toBe('auto')
    expect(isDark()).toBe(false)

    systemDark = true
    listeners.forEach((cb) => cb())
    expect(isDark()).toBe(true)
  })

  test('explicit choice overrides the system and persists', () => {
    systemDark = true
    useTheme().setTheme('light')
    expect(isDark()).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    listeners.forEach((cb) => cb())
    expect(isDark()).toBe(false)
  })

  test('switching back to auto clears the stored choice', () => {
    useTheme().setTheme('dark')
    expect(isDark()).toBe(true)
    useTheme().setTheme('auto')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(isDark()).toBe(false)
  })
})
