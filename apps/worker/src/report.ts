// Renders a completed scan's PDF report on demand with Strix's own renderer (`generate_report_pdf`, the one behind
// the "email report" button of `strix view`), so the layout matches Strix. The module is internal to Strix, not a
// public API: a Strix upgrade can break it, which fails the render job without touching the scan.
import type { ReportJob } from '@strix-panel/db/queue'
import { reportPdfPath } from '@strix-panel/shared/env'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { strixEnv } from './processor'
import type { ScanStore } from './scan-store'

export interface ReportProcessorOptions {
  store: ScanStore
  workDir: string
  reportDir: string
  // Python of the Strix install. Empty: PDF reports are off.
  python: string
  env?: Record<string, string | undefined>
  timeoutMs?: number
  // Rendered PDFs older than this are deleted on the next render, so the in-memory volume doesn't fill up.
  maxAgeMs?: number
}

const RENDER_SCRIPT = `
import sys
from pathlib import Path
from strix.interface.viewer.report_pdf import generate_report_pdf
Path(sys.argv[2]).write_bytes(generate_report_pdf(Path(sys.argv[1])))
`

async function pruneReports(reportDir: string, maxAgeMs: number) {
  const cutoff = Date.now() - maxAgeMs
  for (const name of await readdir(reportDir)) {
    const path = join(reportDir, name)
    const info = await stat(path).catch(() => null)
    if (info && info.mtimeMs < cutoff) await rm(path, { force: true })
  }
}

export function createReportProcessor(options: ReportProcessorOptions) {
  const { store, timeoutMs = 120_000, maxAgeMs = 60 * 60 * 1000 } = options
  const env = options.env ?? strixEnv()

  return async (job: ReportJob): Promise<void> => {
    const { scanId } = job.data
    if (!options.python) {
      throw new Error('PDF reports are not set up on this worker (STRIX_PYTHON is empty)')
    }
    const scan = await store.get(scanId)
    if (scan?.status !== 'completed' || !scan.runName) {
      throw new Error('The scan has no completed Strix run')
    }
    const runDir = join(options.workDir, scan.id, 'strix_runs', scan.runName)
    if (!(await Bun.file(join(runDir, 'run.json')).exists())) {
      throw new Error('The Strix run files of this scan are gone')
    }

    await mkdir(options.reportDir, { recursive: true })
    await pruneReports(options.reportDir, maxAgeMs)
    const target = reportPdfPath(options.reportDir, scanId)
    const partial = `${target}.partial`
    // argv only: the run dir comes from our DB, but never goes through a shell.
    const proc = Bun.spawn([options.python, '-c', RENDER_SCRIPT, runDir, partial], {
      env,
      stdout: 'ignore',
      stderr: 'pipe',
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    })
    const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
    if (exitCode !== 0) {
      await rm(partial, { force: true })
      const lastLine = stderr.trim().split('\n').at(-1) || `exit code ${exitCode}`
      console.error(`[report] render of ${scanId} failed (exit ${exitCode}):\n${stderr}`)
      throw new Error(
        proc.signalCode ? 'Rendering the PDF timed out' : `Rendering the PDF failed: ${lastLine}`,
      )
    }
    // The API treats an existing file as ready, so it appears only once complete.
    await rename(partial, target)
  }
}
