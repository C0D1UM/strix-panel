<script setup lang="ts">
import type { ScanStatus } from '@strix-panel/shared'
import { STATUS_LABELS } from '../lib/scans'

defineProps<{ status: ScanStatus }>()

const styles: Record<ScanStatus, string> = {
  queued: 'border-line text-fg-muted',
  running: 'border-accent text-accent',
  stopping: 'border-warning text-warning',
  completed: 'border-success text-success',
  failed: 'border-danger text-danger',
  stopped: 'border-warning text-warning',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="styles[status]"
  >
    <span
      v-if="status === 'running' || status === 'stopping'"
      class="icon-[lucide--loader-circle] size-3 animate-spin"
      aria-hidden="true"
    />
    {{ STATUS_LABELS[status] }}
  </span>
</template>
