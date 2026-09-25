<script setup lang="ts">
import { ToastClose, ToastDescription, ToastProvider, ToastRoot, ToastViewport } from 'reka-ui'
import { useToast, type ToastTone } from '../../composables/useToast'

const { toasts, dismiss } = useToast()

// Errors stay longer: they usually carry a reason worth reading.
const DURATION: Record<ToastTone, number> = { success: 4000, error: 6000 }

const tones: Record<ToastTone, { box: string; icon: string }> = {
  success: { box: 'border-success', icon: 'icon-[lucide--circle-check] text-success' },
  error: { box: 'border-danger', icon: 'icon-[lucide--circle-alert] text-danger' },
}
</script>

<template>
  <ToastProvider swipe-direction="right">
    <ToastRoot
      v-for="item in toasts"
      :key="item.id"
      :duration="DURATION[item.tone]"
      :type="item.tone === 'error' ? 'foreground' : 'background'"
      data-testid="toast"
      :data-tone="item.tone"
      class="flex items-start gap-3 rounded-lg border bg-surface-raised p-3 pr-2 text-sm shadow-lg"
      :class="tones[item.tone].box"
      @update:open="(open) => !open && dismiss(item.id)"
    >
      <span :class="tones[item.tone].icon" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <ToastDescription class="flex-1 break-words">{{ item.message }}</ToastDescription>
      <ToastClose
        aria-label="Dismiss"
        class="grid size-6 shrink-0 place-items-center rounded text-fg-muted hover:bg-surface-sunken hover:text-fg"
      >
        <span class="icon-[lucide--x] size-3.5" aria-hidden="true" />
      </ToastClose>
    </ToastRoot>
    <ToastViewport
      class="fixed right-0 bottom-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 outline-none"
    />
  </ToastProvider>
</template>
