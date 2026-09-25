<script setup lang="ts">
import type { UserStatus } from '@strix-panel/shared'
import { USER_STATUS_LABELS } from '../lib/users'

defineProps<{ status: UserStatus }>()

const styles: Record<UserStatus, string> = {
  active: 'border-success text-success',
  pending: 'border-warning text-warning',
  disabled: 'border-danger text-danger',
  removed: 'border-line text-fg-muted',
}
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="styles[status]"
  >
    {{ USER_STATUS_LABELS[status] }}
  </span>
</template>
