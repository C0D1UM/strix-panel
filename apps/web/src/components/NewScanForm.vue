<script setup lang="ts">
import { SCAN_MODES, type ScanMode } from '@strix-panel/shared'
import { computed, ref } from 'vue'
import { api } from '../lib/api'
import { newTargetRow, validateTargetRows, type TargetRow } from '../lib/scan-targets'
import { SCAN_MODE_HINTS, type Scan } from '../lib/scans'
import ScanTargetsInput from './ScanTargetsInput.vue'
import AppButton from './ui/AppButton.vue'

const emit = defineEmits<{ created: [scan: Scan] }>()

const name = ref('')
const targetRows = ref<TargetRow[]>([newTargetRow()])
const scanMode = ref<ScanMode>('deep')
const instruction = ref('')
// v-model on a number input yields a number (or '' when empty).
const budget = ref<number | string>('')
const submitting = ref(false)
const error = ref<string | null>(null)
const touched = ref(false)

const parsed = computed(() => validateTargetRows(targetRows.value))
const budgetValue = computed(() =>
  String(budget.value).trim() === '' ? null : Number(budget.value),
)
const budgetError = computed(() =>
  budgetValue.value !== null && !(budgetValue.value > 0) ? 'Budget must be greater than 0' : null,
)
const canSubmit = computed(() => parsed.value.errors.length === 0 && budgetError.value === null)

const inputClass =
  'mt-1.5 block w-full rounded-md border border-line bg-surface-raised px-3 text-sm focus:border-accent focus:outline-none'

async function submit() {
  touched.value = true
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  error.value = null
  const trimmedName = name.value.trim()
  const trimmedInstruction = instruction.value.trim()
  const { data, error: err } = await api.v1.scans.post({
    targets: parsed.value.targets,
    scanMode: scanMode.value,
    // Unset fields are left out, not undefined: in a multipart request Eden would send them as "undefined".
    ...(trimmedName && { name: trimmedName }),
    ...(trimmedInstruction && { instruction: trimmedInstruction }),
    ...(budgetValue.value !== null && { maxBudgetUsd: budgetValue.value }),
  })
  submitting.value = false
  if (err || !data) {
    const body = err?.value as { error?: { message?: string } } | undefined
    error.value = body?.error?.message ?? 'Could not start the scan.'
    return
  }
  emit('created', data)
}
</script>

<template>
  <form class="space-y-4" novalidate @submit.prevent="submit">
    <label class="block text-sm font-medium">
      Name <span class="font-normal text-fg-muted">(optional)</span>
      <input v-model="name" maxlength="120" :class="inputClass" class="h-10" />
    </label>

    <fieldset>
      <legend class="text-sm font-medium">Targets</legend>
      <ScanTargetsInput
        v-model="targetRows"
        :invalid="touched && parsed.errors.length > 0"
        @blur="touched = true"
      />
    </fieldset>
    <ul v-if="touched && parsed.errors.length > 0" class="-mt-2 space-y-0.5 text-sm text-danger">
      <li v-for="message in parsed.errors" :key="message" data-testid="target-error">
        {{ message }}
      </li>
    </ul>

    <label class="block text-sm font-medium">
      Scan mode
      <select v-model="scanMode" :class="inputClass" class="h-10 capitalize">
        <option v-for="mode in SCAN_MODES" :key="mode" :value="mode">
          {{ mode }} — {{ SCAN_MODE_HINTS[mode] }}
        </option>
      </select>
    </label>

    <label class="block text-sm font-medium">
      Instructions <span class="font-normal text-fg-muted">(optional)</span>
      <textarea
        v-model="instruction"
        rows="3"
        maxlength="4000"
        placeholder="What to focus on, test accounts to use, areas to avoid…"
        :class="inputClass"
        class="py-2"
      />
    </label>

    <label class="block text-sm font-medium">
      Max budget
      <span class="relative mt-1.5 block">
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-muted">
          $
        </span>
        <input
          v-model="budget"
          type="number"
          min="0.01"
          step="0.01"
          inputmode="decimal"
          placeholder="No limit"
          :class="inputClass"
          class="mt-0 h-10 pl-7"
          :aria-invalid="budgetError !== null"
        />
      </span>
    </label>
    <p v-if="budgetError" class="-mt-2 text-sm text-danger">{{ budgetError }}</p>
    <p class="text-xs text-fg-muted">
      Strix stops cleanly when the LLM spend reaches the budget. Leave empty for no limit.
    </p>

    <p
      v-if="error"
      role="alert"
      class="flex gap-2 rounded-md bg-danger-surface px-3 py-2.5 text-sm text-danger"
    >
      <span class="icon-[lucide--circle-alert] mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {{ error }}
    </p>

    <div class="flex justify-end pt-2">
      <AppButton type="submit" :loading="submitting" :disabled="touched && !canSubmit">
        <span class="icon-[lucide--play] size-4" aria-hidden="true" />
        Start scan
      </AppButton>
    </div>
  </form>
</template>
