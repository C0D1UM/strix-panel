<script setup lang="ts">
import type { Theme } from '@strix-panel/shared'
import { computed } from 'vue'
import { useTheme } from '../composables/useTheme'

// `compact` renders one button that cycles light → dark → auto (for the collapsed sidebar).
defineProps<{ compact?: boolean }>()

const { theme, setTheme } = useTheme()

const options: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'icon-[lucide--sun]' },
  { value: 'dark', label: 'Dark', icon: 'icon-[lucide--moon]' },
  { value: 'auto', label: 'Match system', icon: 'icon-[lucide--monitor]' },
]

const currentIndex = computed(() => options.findIndex((o) => o.value === theme.value))
const current = computed(() => options[currentIndex.value]!)
const next = computed(() => options[(currentIndex.value + 1) % options.length]!)
</script>

<template>
  <button
    v-if="compact"
    type="button"
    :title="`Theme: ${current.label}. Switch to ${next.label}`"
    :aria-label="`Theme: ${current.label}. Switch to ${next.label}`"
    class="grid size-8 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
    @click="setTheme(next.value)"
  >
    <span :class="current.icon" class="size-4" aria-hidden="true" />
  </button>
  <div
    v-else
    role="group"
    aria-label="Theme"
    class="inline-flex rounded-md border border-line bg-surface-raised p-0.5"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :title="option.label"
      :aria-label="option.label"
      :aria-pressed="theme === option.value"
      class="grid size-7 place-items-center rounded text-fg-muted transition-colors hover:text-fg aria-pressed:bg-surface-sunken aria-pressed:text-fg"
      @click="setTheme(option.value)"
    >
      <span :class="option.icon" class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>
