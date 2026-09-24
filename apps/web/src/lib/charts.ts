import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'

let registered = false

// Chart.js is tree-shaken: register only what our charts use. Safe to call more than once.
export function registerCharts() {
  if (registered) return
  registered = true
  Chart.register(
    ArcElement,
    BarController,
    BarElement,
    CategoryScale,
    DoughnutController,
    Legend,
    LinearScale,
    Tooltip,
  )
}
