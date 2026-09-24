import { onScopeDispose, readonly, ref } from 'vue'

const TOKENS = [
  'fg',
  'fg-muted',
  'line',
  'accent',
  'success',
  'danger',
  'warning',
  'sev-critical',
  'sev-high',
  'sev-medium',
  'sev-low',
  'sev-info',
] as const

export type ChartColors = Record<(typeof TOKENS)[number], string>

function read(): ChartColors {
  const style = getComputedStyle(document.documentElement)
  return Object.fromEntries(
    TOKENS.map((token) => [token, style.getPropertyValue(`--${token}`).trim()]),
  ) as ChartColors
}

// Charts draw on canvas and can't use Tailwind classes, so they read the same semantic tokens.
// useTheme toggles `dark` on <html>; re-read when that class changes.
export function useChartColors() {
  const colors = ref(read())
  const observer = new MutationObserver(() => (colors.value = read()))
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  onScopeDispose(() => observer.disconnect())
  return readonly(colors)
}
