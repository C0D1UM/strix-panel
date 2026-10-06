<script setup lang="ts">
import { scanTargetLabel, type ScanTarget } from '@strix-panel/shared'

defineProps<{ target: ScanTarget }>()
</script>

<template>
  <span class="inline-flex min-w-0 items-center gap-1">
    <span
      :class="target.type === 'url' ? 'icon-[lucide--link]' : 'icon-[lucide--file-code]'"
      class="size-3.5 shrink-0"
      aria-hidden="true"
    />
    <span class="truncate">{{ scanTargetLabel(target) }}</span>
  </span>
</template>
