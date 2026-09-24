<script setup lang="ts">
import { FINDING_SEVERITIES } from '@strix-panel/shared'
import type { ChartData, ChartOptions } from 'chart.js'
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import { useChartColors } from '../../composables/useChartColors'
import { registerCharts } from '../../lib/charts'
import type { Dashboard } from '../../lib/dashboard'
import { SEVERITY_LABELS } from '../../lib/scans'

registerCharts()

const props = defineProps<{ findings: Dashboard['kpis']['findings'] }>()
const colors = useChartColors()

const data = computed<ChartData<'bar'>>(() => ({
  labels: FINDING_SEVERITIES.map((severity) => SEVERITY_LABELS[severity]),
  datasets: [
    {
      label: 'Findings',
      data: FINDING_SEVERITIES.map((severity) => props.findings[severity]),
      backgroundColor: FINDING_SEVERITIES.map((severity) => colors.value[`sev-${severity}`]),
      borderRadius: 3,
      maxBarThickness: 24,
    },
  ],
}))

const options = computed<ChartOptions<'bar'>>(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: {
      beginAtZero: true,
      grid: { color: colors.value.line },
      border: { display: false },
      ticks: { color: colors.value['fg-muted'], precision: 0 },
    },
    y: { grid: { display: false }, ticks: { color: colors.value.fg } },
  },
}))
</script>

<template>
  <section class="rounded-lg border border-line bg-surface-raised p-4">
    <h2 class="text-sm font-semibold">Findings by severity</h2>
    <div class="mt-3 h-56">
      <Bar :data="data" :options="options" aria-label="Findings by severity" role="img" />
    </div>
  </section>
</template>
