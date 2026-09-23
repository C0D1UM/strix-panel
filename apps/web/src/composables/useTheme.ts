import { THEMES, type Theme } from '@strix-panel/shared'
import { readonly, ref } from 'vue'

// Keep in sync with the inline script in index.html.
export const THEME_STORAGE_KEY = 'strix-panel:theme'

const theme = ref<Theme>('auto')
let initialized = false

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)')

function readStored(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return THEMES.includes(value as Theme) ? (value as Theme) : 'auto'
  } catch {
    return 'auto'
  }
}

function apply() {
  const dark = theme.value === 'dark' || (theme.value === 'auto' && prefersDark().matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function useTheme() {
  if (!initialized) {
    initialized = true
    theme.value = readStored()
    prefersDark().addEventListener('change', () => {
      if (theme.value === 'auto') apply()
    })
    apply()
  }

  function setTheme(next: Theme) {
    theme.value = next
    try {
      if (next === 'auto') localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage can be unavailable (private mode); the theme still applies for this session.
    }
    apply()
  }

  return { theme: readonly(theme), setTheme }
}
