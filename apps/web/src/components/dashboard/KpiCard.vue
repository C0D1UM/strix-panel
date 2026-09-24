<script setup lang="ts">
defineProps<{ label: string; value: string; icon: string; hint?: string }>()
</script>

<template>
  <div class="rounded-lg border border-line bg-surface-raised p-4">
    <p class="flex items-center gap-2 text-sm text-fg-muted">
      <span :class="[icon, 'size-4']" aria-hidden="true" />
      {{ label }}
    </p>
    <p class="mt-2 text-2xl font-semibold tabular-nums">{{ value }}</p>
    <p v-if="hint" class="mt-1 text-xs text-fg-muted">{{ hint }}</p>
  </div>
</template>
