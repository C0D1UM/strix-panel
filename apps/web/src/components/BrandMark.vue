<script setup lang="ts">
defineProps<{ iconOnly?: boolean }>()
</script>

<template>
  <span class="inline-flex items-center gap-2 font-semibold tracking-tight">
    <svg viewBox="0 0 32 32" class="size-6 shrink-0" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="var(--fg)" />
      <circle
        cx="16"
        cy="16"
        r="9"
        fill="none"
        stroke="var(--accent)"
        stroke-width="1.5"
        opacity=".5"
      />
      <path d="M16 16 L16 2 A14 14 0 0 1 28.1 9 Z" fill="var(--accent)" opacity=".85" />
      <circle cx="21" cy="11" r="2" fill="var(--surface)" />
    </svg>
    <span :class="{ 'sr-only': iconOnly }">Strix Panel</span>
  </span>
</template>
