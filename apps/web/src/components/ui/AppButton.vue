<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    type?: 'button' | 'submit'
    loading?: boolean
    disabled?: boolean
  }>(),
  { variant: 'primary', type: 'button', loading: false, disabled: false },
)

const variants = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-line bg-surface-raised text-fg hover:bg-surface-sunken',
  ghost: 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading"
    class="inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    :class="variants[variant]"
  >
    <span
      v-if="loading"
      class="icon-[lucide--loader-circle] size-4 animate-spin"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
