<script setup lang="ts">
import { onMounted } from 'vue'
import { loadPublicConfig, publicConfig } from '../lib/public-config'

onMounted(loadPublicConfig)
</script>

<template>
  <p class="flex flex-wrap items-center gap-x-1 text-[11px] text-fg-muted">
    <a
      href="https://github.com/C0D1UM/strix-panel"
      target="_blank"
      rel="noopener"
      aria-label="Strix Panel on GitHub"
      title="Strix Panel on GitHub"
      class="-m-1 inline-flex rounded p-1 hover:text-fg"
    >
      <span class="icon-[lucide--github] size-3.5" aria-hidden="true" />
    </a>
    <span aria-hidden="true">·</span>
    Built on
    <a
      href="https://strix.ai"
      target="_blank"
      rel="noopener"
      class="font-medium text-fg underline decoration-line underline-offset-2 hover:text-accent hover:decoration-current"
      >Strix</a
    >
    <template v-if="publicConfig?.branding.showPoweredBy">
      by
      <a
        href="https://codium.co"
        target="_blank"
        rel="noopener"
        data-testid="powered-by"
        class="font-medium text-fg underline decoration-line underline-offset-2 hover:text-accent hover:decoration-current"
        >CODIUM</a
      >
    </template>
  </p>
</template>
