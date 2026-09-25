import { ref } from 'vue'

export type ToastTone = 'success' | 'error'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

// Shared by the whole app; AppToaster (mounted once in AppLayout) renders it.
const toasts = ref<Toast[]>([])
let nextId = 1

export function useToast() {
  function toast(message: string, tone: ToastTone = 'success') {
    toasts.value = [...toasts.value, { id: nextId++, message, tone }]
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, toast, dismiss }
}
