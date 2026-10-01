<script setup lang="ts">
import { onMounted } from 'vue'
import { loadPublicConfig, publicConfig } from '../lib/public-config'

onMounted(loadPublicConfig)
</script>

<template>
  <div class="space-y-1 text-xs text-fg-muted">
    <p class="flex flex-wrap items-center gap-x-1.5">
      Built on
      <a
        href="https://strix.ai"
        target="_blank"
        rel="noopener"
        class="font-medium text-fg hover:text-accent hover:underline"
        >Strix</a
      >
      <span aria-hidden="true">·</span>
      <a
        href="https://github.com/usestrix/strix"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-1 hover:text-fg hover:underline"
      >
        <span class="icon-[lucide--github] size-3.5" aria-hidden="true" />
        GitHub
      </a>
    </p>
    <p v-if="publicConfig?.branding.showPoweredBy" data-testid="powered-by">
      Powered by
      <a
        href="https://codium.co"
        target="_blank"
        rel="noopener"
        class="font-medium text-fg hover:text-accent hover:underline"
        >CODIUM</a
      >
    </p>
  </div>
</template>
