<script setup lang="ts">
import { FINDING_SEVERITIES, isFinishedScanStatus } from '@strix-panel/shared'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NewScanDialog from '../components/NewScanDialog.vue'
import ScanStatusBadge from '../components/ScanStatusBadge.vue'
import SeverityBadge from '../components/SeverityBadge.vue'
import AppButton from '../components/ui/AppButton.vue'
import { api } from '../lib/api'
import { currentUser } from '../lib/current-user'
import { formatDate, formatTokens, formatUsd, scanTitle, type Scan } from '../lib/scans'

const PAGE_SIZE = 20
// The list has no live stream; it refreshes while any listed scan is still going.
const REFRESH_MS = 10_000

const route = useRoute()
const router = useRouter()

const scans = ref<Scan[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)
const dialogOpen = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const page = computed(() => {
  const n = Number(route.query.page)
  return Number.isInteger(n) && n > 0 ? n : 1
})
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const isAdmin = computed(() => currentUser.value?.role === 'admin')

async function load() {
  clearTimeout(timer)
  const { data, error: err } = await api.v1.scans.get({
    query: { page: page.value, pageSize: PAGE_SIZE },
  })
  loading.value = false
  if (err || !data) {
    error.value = 'Could not load scans.'
    return
  }
  error.value = null
  scans.value = data.items
  total.value = data.total
  if (data.items.some((scan) => !isFinishedScanStatus(scan.status))) {
    timer = setTimeout(load, REFRESH_MS)
  }
}

const goTo = (n: number) => router.push({ query: n === 1 ? {} : { page: String(n) } })
const severities = (scan: Scan) =>
  FINDING_SEVERITIES.filter((severity) => scan.findings[severity] > 0)

watch(page, load)
onMounted(load)
onBeforeUnmount(() => clearTimeout(timer))
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
      <AppButton @click="dialogOpen = true">
        <span class="icon-[lucide--plus] size-4" aria-hidden="true" />
        New scan
      </AppButton>
    </div>

    <p v-if="error" role="alert" class="mt-8 text-sm text-danger">{{ error }}</p>

    <section
      v-else-if="!loading && scans.length === 0"
      class="mt-10 rounded-lg border border-dashed border-line px-6 py-16 text-center"
    >
      <span class="icon-[lucide--radar] size-8 text-fg-muted" aria-hidden="true" />
      <h2 class="mt-3 font-semibold">No scans yet</h2>
      <p class="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
        Start one with a URL and follow it live.
      </p>
      <AppButton class="mt-5" @click="dialogOpen = true">New scan</AppButton>
    </section>

    <div v-else class="mt-8 overflow-x-auto rounded-lg border border-line bg-surface-raised">
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
                {{ scan.owner.name }}
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
