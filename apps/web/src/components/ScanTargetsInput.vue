<script setup lang="ts">
import { MAX_SCAN_TARGETS, SCAN_TARGET_FILE_EXTENSIONS } from '@strix-panel/shared'
import { ref } from 'vue'
import { formatFileSize, newTargetRow, type TargetRow } from '../lib/scan-targets'

// The new scan form's target list: each row is a URL to type or an uploaded API spec file, in the order shown.
const rows = defineModel<TargetRow[]>({ required: true })
defineProps<{ invalid?: boolean }>()
const emit = defineEmits<{ blur: [] }>()

const accept = SCAN_TARGET_FILE_EXTENSIONS.join(',')
const fileInput = ref<HTMLInputElement | null>(null)
let pickingRowId: number | null = null

function setText(id: number, text: string) {
  rows.value = rows.value.map((row) =>
    row.id === id && row.kind === 'url' ? { ...row, text } : row,
  )
}

function pickFile(id: number) {
  pickingRowId = id
  fileInput.value?.click()
}

function onFilePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const id = pickingRowId
  pickingRowId = null
  // Reset, so picking the same file again still fires `change`.
  input.value = ''
  if (!file || id === null) return
  rows.value = rows.value.map((row) => (row.id === id ? { id, kind: 'file', file } : row))
  emit('blur')
}

function remove(id: number) {
  rows.value =
    rows.value.length === 1 ? [newTargetRow()] : rows.value.filter((row) => row.id !== id)
}

function add() {
  if (rows.value.length < MAX_SCAN_TARGETS) rows.value = [...rows.value, newTargetRow()]
}
</script>

<template>
  <div class="mt-1.5 space-y-2">
    <div v-for="(row, index) in rows" :key="row.id" class="flex items-center gap-2">
      <div v-if="row.kind === 'url'" class="relative min-w-0 flex-1">
        <input
          :value="row.text"
          type="url"
          inputmode="url"
          spellcheck="false"
          placeholder="https://staging.example.com"
          :aria-label="`Target ${index + 1}`"
          :aria-invalid="invalid"
          class="block h-10 w-full rounded-md border border-line bg-surface-raised pr-10 pl-3 font-mono text-sm focus:border-accent focus:outline-none"
          @input="setText(row.id, ($event.target as HTMLInputElement).value)"
          @blur="emit('blur')"
        />
        <button
          type="button"
          title="Upload an API spec file"
          aria-label="Upload an API spec file"
          class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-fg-muted hover:text-fg"
          data-testid="target-upload"
          @click="pickFile(row.id)"
        >
          <span class="icon-[lucide--paperclip] size-4" aria-hidden="true" />
        </button>
      </div>
      <div
        v-else
        class="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-surface-sunken px-3 text-sm"
        data-testid="target-file"
      >
        <span class="icon-[lucide--file-code] size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        <span class="truncate font-mono">{{ row.file.name }}</span>
        <span class="ml-auto shrink-0 text-xs text-fg-muted">
          {{ formatFileSize(row.file.size) }}
        </span>
      </div>
      <button
        type="button"
        :aria-label="`Remove target ${index + 1}`"
        class="flex size-10 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-sunken hover:text-fg"
        data-testid="target-remove"
        @click="remove(row.id)"
      >
        <span class="icon-[lucide--x] size-4" aria-hidden="true" />
      </button>
    </div>
    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      class="hidden"
      data-testid="target-file-input"
      @change="onFilePicked"
    />
    <div class="flex items-center justify-between">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:text-fg-muted disabled:no-underline"
        :disabled="rows.length >= MAX_SCAN_TARGETS"
        data-testid="target-add"
        @click="add"
      >
        <span class="icon-[lucide--plus] size-4" aria-hidden="true" />
        Add target
      </button>
      <span class="text-xs text-fg-muted">{{ rows.length }} of {{ MAX_SCAN_TARGETS }}</span>
    </div>
    <p class="text-xs text-fg-muted">URLs or OpenAPI / Postman files (.json, .yaml)</p>
  </div>
</template>
