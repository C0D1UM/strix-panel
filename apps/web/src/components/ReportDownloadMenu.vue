<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { watch } from 'vue'
import { useReportPdf } from '../composables/useReportPdf'

const props = defineProps<{
  scanId: string
  // PDF: completed scans only. Markdown: whenever Strix wrote its report.
  pdf: boolean
  markdown: boolean
}>()
const emit = defineEmits<{ error: [message: string | null] }>()

const { preparing, error, downloadPdf } = useReportPdf(props.scanId)
watch(error, (message) => emit('error', message))

const itemClass =
  'flex cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-surface-sunken'
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger
      :disabled="preparing"
      :aria-busy="preparing"
      class="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface-raised px-4 text-sm font-semibold hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        v-if="preparing"
        class="icon-[lucide--loader-circle] size-4 animate-spin"
        aria-hidden="true"
      />
      <span v-else class="icon-[lucide--download] size-4" aria-hidden="true" />
      {{ preparing ? 'Preparing PDF…' : 'Download report' }}
      <span class="icon-[lucide--chevron-down] size-4 text-fg-muted" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="4"
        class="z-50 min-w-40 rounded-md border border-line bg-surface-raised p-1 shadow-lg"
      >
        <DropdownMenuItem v-if="pdf" :class="itemClass" @select="downloadPdf">
          <span class="icon-[lucide--file-text] size-4 text-fg-muted" aria-hidden="true" />
          PDF
        </DropdownMenuItem>
        <DropdownMenuItem v-if="markdown" as-child :class="itemClass">
          <a :href="`/api/v1/scans/${scanId}/report.md`" download>
            <span class="icon-[lucide--file-code] size-4 text-fg-muted" aria-hidden="true" />
            Markdown
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
