<script setup lang="ts">
import {
  FINDING_SEVERITIES,
  isFinishedScanStatus,
  SCAN_TABS,
  type ScanTab,
} from '@strix-panel/shared'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import NewScanDialog from '../components/NewScanDialog.vue'
import ScanStatusBadge from '../components/ScanStatusBadge.vue'
import SeverityBadge from '../components/SeverityBadge.vue'
import AppButton from '../components/ui/AppButton.vue'
import { api } from '../lib/api'
import { currentUser } from '../lib/current-user'
import {
  formatDate,
  formatTokens,
  formatUsd,
  SCAN_TAB_LABELS,
  scanTitle,
  type Scan,
} from '../lib/scans'
import type { AdminUser } from '../lib/users'

const PAGE_SIZE = 20
// The list has no live stream; it refreshes while any listed scan is still going.
const REFRESH_MS = 10_000
const SEARCH_DEBOUNCE_MS = 300

const scans = ref<Scan[]>([])
const total = ref(0)
const counts = ref<Record<ScanTab, number>>({
  all: 0,
  active: 0,
  completed: 0,
  failed: 0,
  stopped: 0,
})
const loading = ref(true)
const error = ref<string | null>(null)
const dialogOpen = ref(false)
const page = ref(1)
const tab = ref<ScanTab>('all')
const search = ref('')
// The trimmed search, updated once typing pauses.
const query = ref('')
const ownerId = ref('')
const owners = ref<AdminUser[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
let searchTimer: ReturnType<typeof setTimeout> | undefined
// Only the newest request may update the list, so a slow reply can't overwrite a newer filter.
let requestSeq = 0

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const isAdmin = computed(() => currentUser.value?.role === 'admin')
const pending = computed(() => currentUser.value?.approved === false)
const pendingHint = computed(() => (pending.value ? 'Waiting for admin approval' : undefined))
// The first-scan prompt only makes sense when nothing narrows the list.
const noScansAtAll = computed(() => counts.value.all === 0 && !query.value && !ownerId.value)

const emptyText = computed(() => {
  if (query.value) return 'No scans match your search.'
  return tab.value === 'all' ? 'No scans.' : `No ${tab.value} scans.`
})

async function load() {
  clearTimeout(timer)
  const seq = ++requestSeq
  const { data, error: err } = await api.v1.scans.get({
    query: {
      page: page.value,
      pageSize: PAGE_SIZE,
      ...(query.value && { q: query.value }),
      ...(tab.value !== 'all' && { tab: tab.value }),
      ...(ownerId.value && { ownerId: ownerId.value }),
    },
  })
  if (seq !== requestSeq) return
  loading.value = false
  if (err || !data) {
    error.value = 'Could not load scans.'
    return
  }
  error.value = null
  scans.value = data.items
  total.value = data.total
  counts.value = data.counts
  if (data.items.some((scan) => !isFinishedScanStatus(scan.status))) {
    timer = setTimeout(load, REFRESH_MS)
  }
}

async function loadOwners() {
  const { data } = await api.v1.admin.users.get()
  // Without the list the filter just offers "All owners".
  if (data) owners.value = data
}

function goTo(n: number) {
  page.value = n
  void load()
}

const severities = (scan: Scan) =>
  FINDING_SEVERITIES.filter((severity) => scan.findings[severity] > 0)

watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => (query.value = value.trim()), SEARCH_DEBOUNCE_MS)
})
watch([query, tab, ownerId], () => goTo(1))
watch(
  isAdmin,
  (admin) => {
    if (admin && owners.value.length === 0) void loadOwners()
  },
  { immediate: true },
)
onMounted(load)
onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(searchTimer)
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-8">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Scans</h1>
        <p class="mt-1 text-sm text-fg-muted">
          {{ isAdmin ? 'Every scan on this panel.' : 'Your Strix scans.' }}
        </p>
      </div>
      <AppButton :disabled="pending" :title="pendingHint" @click="dialogOpen = true">
        <span class="icon-[lucide--plus] size-4" aria-hidden="true" />
        New scan
      </AppButton>
    </div>

    <div class="mt-6 flex flex-wrap gap-3">
      <label class="relative block w-full sm:w-72">
        <span class="sr-only">Search scans</span>
        <span
          class="absolute top-1/2 left-3 icon-[lucide--search] size-4 -translate-y-1/2 text-fg-muted"
          aria-hidden="true"
        />
        <input
          v-model="search"
          type="search"
          placeholder="Search name or target"
          class="h-10 w-full rounded-md border border-line bg-surface-raised pr-3 pl-9 text-sm placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
      </label>
      <label v-if="isAdmin" class="block w-full sm:w-56">
        <span class="sr-only">Filter by owner</span>
        <select
          v-model="ownerId"
          class="h-10 w-full rounded-md border border-line bg-surface-raised px-3 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">All owners</option>
          <option v-for="owner in owners" :key="owner.id" :value="owner.id">
            {{ owner.name }}{{ owner.status === 'removed' ? ' (removed)' : '' }}
          </option>
        </select>
      </label>
    </div>

    <div
      role="tablist"
      aria-label="Filter by status"
      class="mt-4 flex flex-wrap gap-1 border-b border-line"
    >
      <button
        v-for="t in SCAN_TABS"
        :key="t"
        type="button"
        role="tab"
        :data-testid="`tab-${t}`"
        :aria-selected="tab === t"
        class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors"
        :class="
          tab === t ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
        "
        @click="tab = t"
      >
        {{ SCAN_TAB_LABELS[t] }}
        <span class="ml-1 text-xs text-fg-muted tabular-nums">{{ counts[t] }}</span>
      </button>
    </div>

    <p v-if="error" role="alert" class="mt-6 text-sm text-danger">{{ error }}</p>

    <section
      v-else-if="!loading && noScansAtAll"
      class="mt-6 rounded-lg border border-dashed border-line px-6 py-16 text-center"
    >
      <span class="icon-[lucide--radar] size-8 text-fg-muted" aria-hidden="true" />
      <h2 class="mt-3 font-semibold">No scans yet</h2>
      <p class="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
        Start one with a URL and follow it live.
      </p>
      <AppButton class="mt-5" :disabled="pending" :title="pendingHint" @click="dialogOpen = true">
        New scan
      </AppButton>
    </section>

    <p
      v-else-if="!loading && scans.length === 0"
      class="mt-6 rounded-lg border border-dashed border-line px-6 py-12 text-center text-sm text-fg-muted"
    >
      {{ emptyText }}
    </p>

    <div v-else class="mt-6 overflow-x-auto rounded-lg border border-line bg-surface-raised">
      <table class="w-full text-sm">
        <thead class="border-b border-line text-left text-xs text-fg-muted uppercase">
          <tr>
            <th class="px-4 py-3 font-medium">Scan</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Mode</th>
            <th class="px-4 py-3 font-medium">Findings</th>
            <th class="px-4 py-3 text-right font-medium">Tokens</th>
            <th class="px-4 py-3 text-right font-medium">Cost</th>
            <th v-if="isAdmin" class="px-4 py-3 font-medium">Owner</th>
            <th class="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="scan in scans"
            :key="scan.id"
            class="border-b border-line last:border-0 hover:bg-surface-sunken"
          >
            <td class="px-4 py-3">
              <RouterLink
                :to="{ name: 'scan', params: { id: scan.id } }"
                class="font-medium hover:underline"
              >
                {{ scanTitle(scan) }}
              </RouterLink>
              <p
                class="mt-0.5 max-w-xs truncate text-xs text-fg-muted"
                :title="scan.targets.join('\n')"
              >
                {{ scan.targets.join(', ') }}
              </p>
            </td>
            <td class="px-4 py-3"><ScanStatusBadge :status="scan.status" /></td>
            <td class="px-4 py-3 capitalize">{{ scan.scanMode }}</td>
            <td class="px-4 py-3">
              <div v-if="severities(scan).length > 0" class="flex flex-wrap gap-1">
                <SeverityBadge
                  v-for="severity in severities(scan)"
                  :key="severity"
                  :severity="severity"
                  :count="scan.findings[severity]"
                  compact
                />
              </div>
              <span v-else class="text-fg-muted">—</span>
            </td>
            <td class="px-4 py-3 text-right tabular-nums">
              {{ formatTokens(scan.inputTokens + scan.outputTokens) }}
            </td>
            <td class="px-4 py-3 text-right tabular-nums">{{ formatUsd(scan.costUsd) }}</td>
            <td v-if="isAdmin" class="px-4 py-3">
              <span class="block max-w-[12rem] truncate" :title="scan.owner.email">
                {{ scan.owner.name
                }}<span v-if="scan.owner.removed" class="text-fg-muted"> (removed)</span>
              </span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-fg-muted">
              {{ formatDate(scan.createdAt) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav
      v-if="pageCount > 1"
      class="mt-4 flex items-center justify-between text-sm"
      aria-label="Pagination"
    >
      <AppButton variant="secondary" :disabled="page <= 1" @click="goTo(page - 1)">
        Previous
      </AppButton>
      <span class="text-fg-muted">Page {{ page }} of {{ pageCount }}</span>
      <AppButton variant="secondary" :disabled="page >= pageCount" @click="goTo(page + 1)">
        Next
      </AppButton>
    </nav>

    <NewScanDialog v-model:open="dialogOpen" />
  </div>
</template>
