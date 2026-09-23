<script setup lang="ts">
withDefaults(defineProps<{ name: string; image?: string | null; size?: 'sm' | 'lg' }>(), {
  image: null,
  size: 'sm',
})
</script>

<template>
  <img
    v-if="image"
    :src="image"
    alt=""
    referrerpolicy="no-referrer"
    class="shrink-0 rounded-full"
    :class="size === 'lg' ? 'size-12' : 'size-8'"
  />
  <span
    v-else
    class="grid shrink-0 place-items-center rounded-full bg-surface-sunken font-semibold text-fg-muted"
    :class="size === 'lg' ? 'size-12 text-lg' : 'size-8 text-sm'"
    aria-hidden="true"
  >
    {{ name.charAt(0).toUpperCase() }}
  </span>
</template>
