<script setup lang="ts">
import { SCAN_STATUSES, type ScanStatus } from '@strix-panel/shared'
import type { ChartData, ChartOptions } from 'chart.js'
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'
import { useChartColors, type ChartColors } from '../../composables/useChartColors'
import { registerCharts } from '../../lib/charts'
import type { Dashboard } from '../../lib/dashboard'
import { STATUS_LABELS } from '../../lib/scans'

registerCharts()

const props = defineProps<{ counts: Dashboard['statusCounts'] }>()
const colors = useChartColors()

// Matches ScanStatusBadge where tokens allow; queued/stopped use neutral tokens.
const STATUS_TOKENS: Record<ScanStatus, keyof ChartColors> = {
  queued: 'line',
  running: 'accent',
  stopping: 'warning',
  completed: 'success',
  failed: 'danger',
  stopped: 'fg-muted',
}

const data = computed<ChartData<'doughnut'>>(() => ({
  labels: SCAN_STATUSES.map((status) => STATUS_LABELS[status]),
  datasets: [
    {
      data: SCAN_STATUSES.map((status) => props.counts[status]),
      backgroundColor: SCAN_STATUSES.map((status) => colors.value[STATUS_TOKENS[status]]),
      borderWidth: 0,
    },
  ],
}))

const options = computed<ChartOptions<'doughnut'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
  plugins: {
    legend: { position: 'right', labels: { color: colors.value.fg, boxWidth: 10, boxHeight: 10 } },
  },
}))
</script>

<template>
  <section class="rounded-lg border border-line bg-surface-raised p-4">
    <h2 class="text-sm font-semibold">Scans by status</h2>
    <div class="mt-3 h-56">
      <Doughnut :data="data" :options="options" aria-label="Scans by status" role="img" />
    </div>
  </section>
</template>
