import type { ScanJob } from '@strix-panel/db/queue'

// Placeholder: will spawn `strix -n` and poll strix_runs/<run>/ once runs are designed.
export async function processScan(job: ScanJob): Promise<void> {
  console.log(
    `[worker] received scan job ${job.id} for run ${job.data.runId} (runner not implemented)`,
  )
}
