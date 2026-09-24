<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js'
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import { useChartColors } from '../../composables/useChartColors'
import { registerCharts } from '../../lib/charts'

registerCharts()

const props = defineProps<{
  label: string
  labels: string[]
  values: number[]
  format: (n: number) => string
}>()

const colors = useChartColors()

const data = computed<ChartData<'bar'>>(() => ({
  labels: props.labels,
  datasets: [
    {
      label: props.label,
      data: props.values,
      backgroundColor: colors.value.accent,
      borderRadius: 3,
      maxBarThickness: 32,
    },
  ],
}))

const options = computed<ChartOptions<'bar'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { label: (item) => props.format(item.parsed.y ?? 0) } },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: colors.value['fg-muted'], maxRotation: 0, autoSkip: true },
    },
    y: {
      beginAtZero: true,
      grid: { color: colors.value.line },
      border: { display: false },
      ticks: { color: colors.value['fg-muted'], callback: (value) => props.format(Number(value)) },
    },
  },
}))
</script>

<template>
  <section class="rounded-lg border border-line bg-surface-raised p-4">
    <h2 class="text-sm font-semibold">{{ label }}</h2>
    <div class="mt-3 h-56">
      <Bar :data="data" :options="options" :aria-label="`${label} over time`" role="img" />
    </div>
  </section>
</template>
