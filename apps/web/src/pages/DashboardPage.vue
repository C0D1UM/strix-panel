<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import KpiCard from '../components/dashboard/KpiCard.vue'
import SeverityChart from '../components/dashboard/SeverityChart.vue'
import StatusChart from '../components/dashboard/StatusChart.vue'
import TrendChart from '../components/dashboard/TrendChart.vue'
import UserUsageTable from '../components/dashboard/UserUsageTable.vue'
import UserAvatar from '../components/UserAvatar.vue'
import { api } from '../lib/api'
import { currentUser } from '../lib/current-user'
import {
  formatBucket,
  presetStart,
  RANGE_LABELS,
  RANGE_PRESETS,
  type Dashboard,
  type RangePreset,
} from '../lib/dashboard'
import { formatTokens, formatUsd } from '../lib/scans'

type Scope = 'all' | 'me'

const preset = ref<RangePreset>('30d')
const scope = ref<Scope>('all')
const dashboard = ref<Dashboard | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const isAdmin = computed(() => currentUser.value?.role === 'admin')
let latest = 0

async function load() {
  const id = ++latest
  loading.value = true
  const query: { start?: string; scope?: Scope } = {}
  const start = presetStart(preset.value)
  if (start) query.start = start
  if (isAdmin.value) query.scope = scope.value
  const { data, error: err } = await api.v1.dashboard.get({ query })
  // A newer request (range or scope changed) wins.
  if (id !== latest) return
  loading.value = false
  if (err || !data) {
    error.value = 'Could not load the dashboard.'
    // Don't leave the previous range's numbers under the newly selected one.
    dashboard.value = null
    return
  }
  error.value = null
  dashboard.value = data
}

watch([preset, scope, isAdmin], load, { immediate: true })

const kpis = computed(() => dashboard.value?.kpis)
const totalFindings = computed(() =>
  kpis.value ? Object.values(kpis.value.findings).reduce((sum, n) => sum + n, 0) : 0,
)
const series = computed(() => {
  const s = dashboard.value?.series
  return {
    labels: s ? s.points.map((p) => formatBucket(p.bucket, s.granularity)) : [],
    cost: s?.points.map((p) => p.costUsd) ?? [],
    tokens: s?.points.map((p) => p.tokens) ?? [],
  }
})
const admin = computed(() => (isAdmin.value ? dashboard.value?.admin : undefined))
const failureRate = computed(() => {
  const rate = admin.value?.health.failureRate
  return rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`
})

const segment = (active: boolean) =>
  active ? 'bg-surface-raised text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-8">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div v-if="currentUser" class="flex items-center gap-4">
        <UserAvatar :name="currentUser.name" :image="currentUser.image" size="lg" />
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Hi, {{ currentUser.name }}</h1>
          <p class="text-sm text-fg-muted">
            {{ isAdmin && scope === 'all' ? 'Usage across everyone' : 'Your usage' }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div
          v-if="isAdmin"
          data-testid="scope-toggle"
          class="inline-flex rounded-md border border-line bg-surface-sunken p-0.5 text-sm"
          role="group"
          aria-label="Whose scans"
        >
          <button
            v-for="option in [
              { value: 'all', label: 'Everyone' },
              { value: 'me', label: 'Mine' },
            ] as const"
            :key="option.value"
            type="button"
            class="rounded px-3 py-1 font-medium"
            :class="segment(scope === option.value)"
            :aria-pressed="scope === option.value"
            @click="scope = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <div
          class="inline-flex rounded-md border border-line bg-surface-sunken p-0.5 text-sm"
          role="group"
          aria-label="Date range"
        >
          <button
            v-for="option in RANGE_PRESETS"
            :key="option"
            type="button"
            class="rounded px-3 py-1 font-medium"
            :class="segment(preset === option)"
            :aria-pressed="preset === option"
            @click="preset = option"
          >
            {{ RANGE_LABELS[option] }}
          </button>
        </div>
      </div>
    </div>

    <p
      v-if="error"
      class="mt-8 rounded-md bg-danger-surface px-4 py-3 text-sm text-danger"
      role="alert"
    >
      {{ error }}
    </p>
    <p v-else-if="loading && !dashboard" class="mt-8 text-sm text-fg-muted">Loading…</p>

    <template v-if="dashboard && kpis">
      <div class="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4" :class="{ 'opacity-60': loading }">
        <KpiCard
          label="Scans"
          icon="icon-[lucide--radar]"
          :value="String(kpis.runs.total)"
          :hint="`${kpis.runs.completed} completed · ${kpis.runs.failed} failed`"
        />
        <KpiCard
          label="Cost"
          icon="icon-[lucide--circle-dollar-sign]"
          :value="formatUsd(kpis.costUsd)"
        />
        <KpiCard
          label="Tokens"
          icon="icon-[lucide--coins]"
          :value="formatTokens(kpis.tokens.input + kpis.tokens.output)"
          :hint="`${formatTokens(kpis.tokens.input)} in · ${formatTokens(kpis.tokens.output)} out · ${formatTokens(kpis.tokens.cached)} cached`"
        />
        <KpiCard
          label="Findings"
          icon="icon-[lucide--bug]"
          :value="String(totalFindings)"
          :hint="`${kpis.findings.critical} critical · ${kpis.findings.high} high`"
        />
      </div>

      <section
        v-if="kpis.runs.total === 0"
        data-testid="dashboard-empty"
        class="mt-6 rounded-lg border border-dashed border-line px-6 py-12 text-center"
      >
        <span class="icon-[lucide--radar] size-8 text-fg-muted" aria-hidden="true" />
        <h2 class="mt-3 font-semibold">No scans in this range</h2>
        <p class="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
          Start a scan to see cost, tokens and findings here.
        </p>
        <RouterLink
          :to="{ name: 'scans' }"
          class="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          <span class="icon-[lucide--radar] size-4" aria-hidden="true" />
          Go to scans
        </RouterLink>
      </section>

      <div v-else class="mt-6 grid gap-4 lg:grid-cols-2">
        <TrendChart
          label="Cost"
          :labels="series.labels"
          :values="series.cost"
          :format="formatUsd"
        />
        <TrendChart
          label="Tokens"
          :labels="series.labels"
          :values="series.tokens"
          :format="formatTokens"
        />
        <SeverityChart :findings="kpis.findings" />
        <StatusChart :counts="dashboard.statusCounts" />
      </div>

      <section
        v-if="admin"
        data-testid="admin-section"
        class="mt-10"
        aria-labelledby="admin-heading"
      >
        <h2 id="admin-heading" class="text-lg font-semibold">Everyone</h2>
        <p class="text-sm text-fg-muted">Across all users, in the selected range.</p>
        <div class="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Users"
            icon="icon-[lucide--users]"
            :value="String(admin.users.total)"
            :hint="`${admin.users.active} ran a scan`"
          />
          <KpiCard
            label="Queued now"
            icon="icon-[lucide--list-ordered]"
            :value="String(admin.health.queued)"
          />
          <KpiCard
            label="Running now"
            icon="icon-[lucide--loader-circle]"
            :value="String(admin.health.running)"
          />
          <KpiCard
            label="Failure rate"
            icon="icon-[lucide--triangle-alert]"
            :value="failureRate"
            hint="Failed out of finished scans"
          />
        </div>
        <UserUsageTable class="mt-4" :rows="admin.perUser" />
      </section>
    </template>
  </div>
</template>
