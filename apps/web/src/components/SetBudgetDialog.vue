<script setup lang="ts">
import { BUDGET_WINDOWS, formatBudgetUsd, type BudgetWindow } from '@strix-panel/shared'
import { computed, onMounted, ref } from 'vue'
import { useToast } from '../composables/useToast'
import { WINDOW_LABELS } from '../lib/budget'
import { loadPublicConfig, publicConfig } from '../lib/public-config'
import { saveUserBudget, type AdminUser } from '../lib/users'
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'

const props = defineProps<{ user: AdminUser }>()
const emit = defineEmits<{ saved: [user: AdminUser] }>()
const open = defineModel<boolean>('open', { required: true })
const { toast } = useToast()

// v-model on a number input yields a number (or '' when empty).
const amount = ref<number | string>(props.user.budget.limitUsd ?? '')
const period = ref<BudgetWindow>(props.user.budget.window)
const saving = ref(false)

onMounted(() => void loadPublicConfig())

const amountValue = computed(() =>
  String(amount.value).trim() === '' ? null : Number(amount.value),
)
const amountError = computed(() => {
  const value = amountValue.value
  if (value === null) return null
  if (!Number.isFinite(value) || value < 0) return 'Enter 0 or more'
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return 'Use whole cents'
  return null
})
const minToStart = computed(() => publicConfig.value?.budget.minToStartUsd ?? null)
const belowMinimum = computed(
  () =>
    amountValue.value !== null &&
    amountValue.value > 0 &&
    minToStart.value !== null &&
    amountValue.value < minToStart.value,
)

const inputClass =
  'mt-1.5 block h-10 w-full rounded-md border border-line bg-surface-raised px-3 text-sm focus:border-accent focus:outline-none'

async function save() {
  if (amountError.value || saving.value) return
  saving.value = true
  const result = await saveUserBudget(props.user.id, {
    budgetUsd: amountValue.value,
    window: period.value,
  })
  saving.value = false
  if (result.error) {
    toast(`Couldn't set the budget of ${props.user.name}: ${result.error}`, 'error')
    return
  }
  toast(`Budget of ${props.user.name} saved.`)
  emit('saved', result.data!)
  open.value = false
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    :title="`Set budget for ${user.name}`"
    description="What their scans may spend on the LLM per period. Running scans are not affected."
  >
    <form class="space-y-4" novalidate @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <label class="block text-sm font-medium">
          Amount
          <span class="relative mt-1.5 block">
            <span
              class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-muted"
            >
              $
            </span>
            <input
              v-model="amount"
              data-testid="budget-amount"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              placeholder="Unlimited"
              :class="inputClass"
              class="mt-0 pl-7"
              :aria-invalid="amountError !== null"
            />
          </span>
        </label>
        <label class="block text-sm font-medium">
          Per
          <select v-model="period" data-testid="budget-window" :class="inputClass">
            <option v-for="w in BUDGET_WINDOWS" :key="w" :value="w">{{ WINDOW_LABELS[w] }}</option>
          </select>
        </label>
      </div>
      <p v-if="amountError" class="-mt-2 text-sm text-danger">{{ amountError }}</p>
      <p
        v-else-if="belowMinimum"
        data-testid="budget-below-minimum"
        class="-mt-2 text-sm text-fg-muted"
      >
        Below the {{ formatBudgetUsd(minToStart!) }} minimum, so this user can't start scans.
      </p>
      <p class="text-xs text-fg-muted">
        Leave empty for no limit. 0 means no scans. Periods are calendar weeks (from Monday), months
        and years in UTC.
      </p>
      <div class="flex justify-end gap-2 pt-2">
        <AppButton variant="secondary" @click="open = false">Cancel</AppButton>
        <AppButton type="submit" :loading="saving" :disabled="amountError !== null">
          Save budget
        </AppButton>
      </div>
    </form>
  </AppDialog>
</template>
