<script setup lang="ts">
import type { FindingSeverity } from '@strix-panel/shared'
import { SEVERITY_LABELS } from '../lib/scans'

withDefaults(defineProps<{ severity: FindingSeverity; count?: number; compact?: boolean }>(), {
  count: undefined,
  compact: false,
})

// Written out in full so Tailwind can find the classes.
const styles: Record<FindingSeverity, string> = {
  critical: 'border-sev-critical text-sev-critical',
  high: 'border-sev-high text-sev-high',
  medium: 'border-sev-medium text-sev-medium',
  low: 'border-sev-low text-sev-low',
  info: 'border-sev-info text-sev-info',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="styles[severity]"
    :title="compact ? SEVERITY_LABELS[severity] : undefined"
  >
    <template v-if="compact">{{ SEVERITY_LABELS[severity][0] }}</template>
    <template v-else>{{ SEVERITY_LABELS[severity] }}</template>
    <span v-if="count !== undefined" class="tabular-nums">{{ count }}</span>
  </span>
</template>
