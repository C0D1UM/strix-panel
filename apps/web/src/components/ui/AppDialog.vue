<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'

defineProps<{
  title: string
  description?: string
}>()

const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-fg/40" />
      <DialogContent
        class="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-surface-raised p-6 shadow-lg focus:outline-none"
      >
        <DialogTitle class="pr-8 text-lg font-semibold">{{ title }}</DialogTitle>
        <DialogDescription v-if="description" class="mt-1 text-sm text-fg-muted">
          {{ description }}
        </DialogDescription>
        <div class="mt-5">
          <slot />
        </div>
        <DialogClose
          aria-label="Close"
          class="absolute top-3 right-3 grid size-8 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
        >
          <span class="icon-[lucide--x] size-4" aria-hidden="true" />
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
