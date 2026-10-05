<script setup lang="ts">
import { BUDGET_WINDOWS, formatBudgetUsd } from '@strix-panel/shared'
import { diffSettings, type Settings } from '@strix-panel/shared/settings'
import { computed, onMounted, onUnmounted, ref, toRaw } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import AppButton from '../components/ui/AppButton.vue'
import AppDialog from '../components/ui/AppDialog.vue'
import AppSwitch from '../components/ui/AppSwitch.vue'
import { useToast } from '../composables/useToast'
import { api } from '../lib/api'
import { WINDOW_LABELS } from '../lib/budget'
import { reloadPublicConfig } from '../lib/public-config'
import { session } from '../lib/session'

// Listed in the outline. Add new sections here and as a <section :id> below.
const SECTIONS = [
  { id: 'sign-up', title: 'Sign-up' },
  { id: 'budgets', title: 'Budgets' },
] as const

// Same bounds as the API (and a user's budget). Number inputs give '' when empty.
const MAX_USD = 100_000
function amountError(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter an amount'
  if (value < 0) return 'Enter 0 or more'
  if (value > MAX_USD) return `Enter at most ${formatBudgetUsd(MAX_USD)}`
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return 'Use whole cents'
  return null
}

const inputClass =
  'mt-1.5 block h-10 w-full rounded-md border border-line bg-surface-raised px-3 text-sm focus:border-accent focus:outline-none'

const router = useRouter()
const { toast } = useToast()
const saved = ref<Settings | null>(null)
const draft = ref<Settings | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const activeSection = ref<string>(SECTIONS[0].id)
// Where the user tried to go with unsaved changes; non-null opens the confirm dialog.
const leaveTo = ref<string | null>(null)
let leaving = false

const patch = computed(() =>
  saved.value && draft.value ? diffSettings(saved.value, draft.value) : {},
)
const dirty = computed(() => Object.keys(patch.value).length > 0)
const limitError = computed(() =>
  draft.value?.budget.newUserLimitEnabled ? amountError(draft.value.budget.newUserLimitUsd) : null,
)
const minError = computed(() =>
  draft.value ? amountError(draft.value.budget.minToStartUsd) : null,
)
const invalid = computed(() => limitError.value !== null || minError.value !== null)
// A default limit users could never start a scan with (0 is a deliberate "no scans").
const limitBelowMinimum = computed(() => {
  const budget = draft.value?.budget
  if (!budget?.newUserLimitEnabled || invalid.value) return false
  return budget.newUserLimitUsd > 0 && budget.newUserLimitUsd < budget.minToStartUsd
})
const leaveDialogOpen = computed({
  get: () => leaveTo.value !== null,
  set: (open) => {
    if (!open) leaveTo.value = null
  },
})

async function load() {
  const { data, error } = await api.v1.admin.settings.get()
  loading.value = false
  if (error || !data) {
    loadError.value = 'Could not load settings.'
    return
  }
  saved.value = data
  draft.value = structuredClone(data)
}

function discard() {
  if (saved.value) draft.value = structuredClone(toRaw(saved.value))
}

async function save() {
  if (invalid.value) return
  saving.value = true
  const { data, error } = await api.v1.admin.settings.patch(patch.value)
  saving.value = false
  if (error || !data) {
    toast('Could not save settings.', 'error')
    return
  }
  saved.value = data
  draft.value = structuredClone(data)
  toast('Settings saved.')
  // The sign-in page reads registrationEnabled from the public config.
  void reloadPublicConfig()
}

onBeforeRouteLeave((to) => {
  // Signed out: the changes can't be saved anyway, so don't hold the user on the page.
  if (!dirty.value || leaving || !session.value) return true
  leaveTo.value = to.fullPath
  return false
})

function confirmLeave() {
  const to = leaveTo.value
  leaveTo.value = null
  if (!to) return
  leaving = true
  void router.push(to)
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) event.preventDefault()
}

// Highlights the outline entry of the section in view. jsdom has no IntersectionObserver.
let observer: IntersectionObserver | undefined
function observeSections() {
  if (typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.find((entry) => entry.isIntersecting)
      if (visible) activeSection.value = visible.target.id
    },
    { rootMargin: '0px 0px -70% 0px' },
  )
  for (const { id } of SECTIONS) {
    const el = document.getElementById(id)
    if (el) observer.observe(el)
  }
}

onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnload)
  await load()
  observeSections()
})
onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  observer?.disconnect()
})
</script>

<template>
  <div class="mx-auto max-w-screen-lg px-4 py-10 sm:px-8">
    <h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
    <p class="mt-1 text-sm text-fg-muted">Panel-wide settings. Changes apply right away.</p>

    <p v-if="loadError" role="alert" class="mt-6 text-sm text-danger">{{ loadError }}</p>

    <div v-else-if="!loading && draft" class="mt-8 lg:grid lg:grid-cols-[12rem_1fr] lg:gap-10">
      <nav aria-label="On this page" class="hidden lg:block">
        <ul class="sticky top-10 space-y-1 text-sm">
          <li v-for="section in SECTIONS" :key="section.id">
            <a
              :href="`#${section.id}`"
              class="block rounded-md px-3 py-1.5 transition-colors hover:bg-surface-sunken"
              :class="activeSection === section.id ? 'font-semibold text-fg' : 'text-fg-muted'"
              :aria-current="activeSection === section.id ? 'location' : undefined"
            >
              {{ section.title }}
            </a>
          </li>
        </ul>
      </nav>

      <div class="space-y-8">
        <section id="sign-up" aria-labelledby="sign-up-title" class="scroll-mt-10">
          <h2 id="sign-up-title" class="text-lg font-semibold">Sign-up</h2>
          <p class="mt-1 text-sm text-fg-muted">Who can create an account on this panel.</p>
          <div class="mt-4 divide-y divide-line rounded-lg border border-line bg-surface-raised">
            <div class="flex items-start justify-between gap-6 p-5">
              <div>
                <label for="registration-enabled" class="text-sm font-medium">
                  Allow new accounts
                </label>
                <p class="mt-1 text-sm text-fg-muted">
                  When off, nobody can create an account, by email or Google. Existing users can
                  still sign in.
                </p>
              </div>
              <AppSwitch id="registration-enabled" v-model="draft.auth.registrationEnabled" />
            </div>
            <div class="flex items-start justify-between gap-6 p-5">
              <div>
                <label for="auto-approve-users" class="text-sm font-medium">
                  Approve new users automatically
                </label>
                <p class="mt-1 text-sm text-fg-muted">
                  When off, new users can sign in but can't start scans until an admin approves them
                  on Users. Only affects new sign-ups.
                </p>
              </div>
              <AppSwitch id="auto-approve-users" v-model="draft.auth.autoApproveUsers" />
            </div>
          </div>
        </section>

        <section id="budgets" aria-labelledby="budgets-title" class="scroll-mt-10">
          <h2 id="budgets-title" class="text-lg font-semibold">Budgets</h2>
          <p class="mt-1 text-sm text-fg-muted">
            What scans may spend on the LLM. Change a user's own budget on Users.
          </p>
          <div class="mt-4 divide-y divide-line rounded-lg border border-line bg-surface-raised">
            <div class="p-5">
              <div class="flex items-start justify-between gap-6">
                <div>
                  <label for="new-user-limit" class="text-sm font-medium">Limit new users</label>
                  <p class="mt-1 text-sm text-fg-muted">
                    Gives every account created from now on, admins included, this budget. When off,
                    new accounts are unlimited. Existing users don't change.
                  </p>
                </div>
                <AppSwitch id="new-user-limit" v-model="draft.budget.newUserLimitEnabled" />
              </div>
              <div
                v-if="draft.budget.newUserLimitEnabled"
                data-testid="new-user-limit-fields"
                class="mt-4 grid gap-4 sm:grid-cols-[1fr_10rem]"
              >
                <label class="block text-sm font-medium">
                  Amount
                  <span class="relative mt-1.5 block">
                    <span
                      class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-muted"
                    >
                      $
                    </span>
                    <input
                      v-model="draft.budget.newUserLimitUsd"
                      data-testid="new-user-limit-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      inputmode="decimal"
                      :class="inputClass"
                      class="mt-0 pl-7"
                      :aria-invalid="limitError !== null"
                    />
                  </span>
                </label>
                <label class="block text-sm font-medium">
                  Per
                  <select
                    v-model="draft.budget.newUserWindow"
                    data-testid="new-user-limit-window"
                    :class="inputClass"
                  >
                    <option v-for="w in BUDGET_WINDOWS" :key="w" :value="w">
                      {{ WINDOW_LABELS[w] }}
                    </option>
                  </select>
                </label>
              </div>
              <p v-if="limitError" class="mt-2 text-sm text-danger">{{ limitError }}</p>
              <p
                v-else-if="limitBelowMinimum"
                data-testid="limit-below-minimum"
                class="mt-2 text-sm text-fg-muted"
              >
                Below the {{ formatBudgetUsd(draft.budget.minToStartUsd) }} minimum, so new users
                can't start scans.
              </p>
            </div>
            <div class="flex flex-wrap items-start justify-between gap-6 p-5">
              <div class="min-w-0 flex-1">
                <label for="min-to-start" class="text-sm font-medium">
                  Minimum to start a scan
                </label>
                <p class="mt-1 text-sm text-fg-muted">
                  Users with a budget need at least this much left to start or resume a scan, so it
                  doesn't run out halfway.
                </p>
                <p v-if="minError" class="mt-2 text-sm text-danger">{{ minError }}</p>
              </div>
              <span class="relative block w-40">
                <span
                  class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-muted"
                >
                  $
                </span>
                <input
                  id="min-to-start"
                  v-model="draft.budget.minToStartUsd"
                  data-testid="min-to-start"
                  type="number"
                  min="0"
                  step="0.01"
                  inputmode="decimal"
                  :class="inputClass"
                  class="mt-0 pl-7"
                  :aria-invalid="minError !== null"
                />
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>

    <div
      v-if="dirty"
      data-testid="save-bar"
      class="sticky bottom-4 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised px-5 py-3 shadow-lg"
    >
      <p class="text-sm font-medium">You have unsaved changes</p>
      <div class="flex gap-2">
        <AppButton variant="ghost" data-testid="discard" :disabled="saving" @click="discard">
          Discard
        </AppButton>
        <AppButton data-testid="save" :loading="saving" :disabled="invalid" @click="save">
          Save changes
        </AppButton>
      </div>
    </div>

    <AppDialog
      v-model:open="leaveDialogOpen"
      title="Discard unsaved changes?"
      description="Your changes to settings haven't been saved."
    >
      <div class="flex justify-end gap-2">
        <AppButton variant="secondary" @click="leaveTo = null">Keep editing</AppButton>
        <AppButton @click="confirmLeave">Discard changes</AppButton>
      </div>
    </AppDialog>
  </div>
</template>
