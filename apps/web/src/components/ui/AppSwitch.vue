<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

defineProps<{ id?: string; disabled?: boolean }>()

const checked = defineModel<boolean>({ required: true })
</script>

<template>
  <SwitchRoot
    :id="id"
    v-model="checked"
    :disabled="disabled"
    class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-line bg-surface-sunken transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:border-accent data-[state=checked]:bg-accent"
  >
    <SwitchThumb
      class="block size-5 translate-x-0.5 rounded-full bg-surface-raised shadow-sm transition-transform data-[state=checked]:translate-x-5"
    />
  </SwitchRoot>
</template>
