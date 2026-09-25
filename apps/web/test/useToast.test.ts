import { afterEach, expect, test } from 'vitest'
import { useToast } from '../src/composables/useToast'

afterEach(() => {
  useToast().toasts.value = []
})

test('toasts are shared, default to success and can be dismissed', () => {
  const a = useToast()
  const b = useToast()
  a.toast('Saved.')
  b.toast('Failed.', 'error')
  expect(b.toasts.value.map((t) => [t.message, t.tone])).toEqual([
    ['Saved.', 'success'],
    ['Failed.', 'error'],
  ])
  a.dismiss(a.toasts.value[0]!.id)
  expect(b.toasts.value.map((t) => t.message)).toEqual(['Failed.'])
})
