// Runs one scan: spawns `strix -n` in a directory of its own, polls the run files it writes, mirrors them into
// Postgres, and forwards a stop request as a signal. A scan that already has a run continues it with
// `strix --resume`. The only place in the panel that starts Strix.
import type { ScanJob } from '@strix-panel/db/queue'
import { isFinishedScanStatus } from '@strix-panel/shared'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createDockerSandboxes, removeSandboxes, SANDBOX_RUN_TYPE, type Sandboxes } from './sandbox'
import type { ScanRow, ScanStore } from './scan-store'
import { buildStrixArgs } from './strix/args'
import { diffRunState } from './strix/diff'
import { findRunDir, readReport, readRunState, type RunState } from './strix/run-dir'

export interface ProcessorOptions {
  store: ScanStore
  strixBin: string
  workDir: string
  pollIntervalMs: number
  // Environment for the Strix process. Defaults to ours minus DATABASE_URL: the agent must not see DB credentials.
  env?: Record<string, string | undefined>
  // Strix's Docker containers, removed once a scan ends. Defaults to the docker CLI.
  sandboxes?: Sandboxes
  // How long to wait after SIGINT before escalating (shortened in tests).
  sigtermAfterMs?: number
  sigkillAfterMs?: number
}

const LOG_TAIL_LINES = 40
const OUTPUT_DRAIN_TIMEOUT_MS = 5000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function strixEnv(source: Record<string, string | undefined> = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'DATABASE_URL'))
}

export function createScanProcessor(options: ProcessorOptions) {
  const { store, sigtermAfterMs = 30_000, sigkillAfterMs = 60_000 } = options
  const env = options.env ?? strixEnv()
  const sandboxes = options.sandboxes ?? createDockerSandboxes()

  async function run(scan: ScanRow): Promise<void> {
    const cwd = join(options.workDir, scan.id)
    await mkdir(cwd, { recursive: true })

    // Mutated from `tick`, so kept in an object: TS can't follow narrowing through the closure otherwise.
    const state: { previous: RunState | null; runDir: string | null } = {
      previous: null,
      runDir: null,
    }
    if (scan.runName !== null) {
      const runDir = join(cwd, 'strix_runs', scan.runName)
      const previous = await readRunState(runDir)
      if (!previous || !(await Bun.file(join(runDir, '.state', 'agents.json')).exists())) {
        await store.setStatus(scan.id, 'failed', 'Scan failed', {
          error: "The scan's run files are gone, so it can't be resumed",
          finishedAt: new Date(),
        })
        return
      }
      // Catch up on whatever the last poll before the interruption missed, without replaying the feed.
      await store.applyDiff(scan.id, { ...diffRunState(null, previous), events: [] })
      state.previous = previous
      state.runDir = runDir
    }

    // Appended, so a resumed scan keeps the output of its earlier attempts.
    const log = createWriteStream(join(cwd, 'strix.log'), { flags: 'a' })
    if (scan.runName !== null) log.write(`\n--- resumed ${new Date().toISOString()} ---\n`)
    const tail: string[] = []

    const proc = Bun.spawn(buildStrixArgs(options.strixBin, scan), {
      cwd,
      // Strix labels its sandbox containers with these, so they can be found and removed afterwards.
      env: { ...env, STRIX_RUN_ID: scan.id, STRIX_RUN_TYPE: SANDBOX_RUN_TYPE },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const capture = async (stream: ReadableStream<Uint8Array>) => {
      const decoder = new TextDecoder()
      let rest = ''
      for await (const chunk of stream) {
        log.write(chunk)
        rest += decoder.decode(chunk, { stream: true })
        const lines = rest.split('\n')
        rest = lines.pop() ?? ''
        for (const line of lines) {
          const clean = Bun.stripANSI(line).trim()
          if (clean) tail.push(clean)
          if (tail.length > LOG_TAIL_LINES) tail.shift()
        }
      }
    }
    const output = Promise.all([capture(proc.stdout), capture(proc.stderr)])

    let stopRequested = false
    let signalledAt: number | null = null
    let exited = false
    void proc.exited.then(() => (exited = true))

    const tick = async () => {
      state.runDir ??= await findRunDir(cwd)
      if (!state.runDir) return
      const next = await readRunState(state.runDir)
      if (!next) return
      await store.applyDiff(scan.id, diffRunState(state.previous, next))
      state.previous = next
    }

    const escalate = () => {
      if (signalledAt === null) {
        signalledAt = Date.now()
        proc.kill('SIGINT')
        return
      }
      const elapsed = Date.now() - signalledAt
      if (elapsed >= sigkillAfterMs) proc.kill('SIGKILL')
      else if (elapsed >= sigtermAfterMs) proc.kill('SIGTERM')
    }

    while (!exited) {
      await sleep(options.pollIntervalMs)
      try {
        await tick()
      } catch (error) {
        console.error(`[worker] scan ${scan.id}: poll failed: ${(error as Error).message}`)
      }
      if (exited) break
      if (!stopRequested && (await store.status(scan.id)) === 'stopping') stopRequested = true
      if (stopRequested) escalate()
    }

    const exitCode = await proc.exited
    // A grandchild holding the pipes open must not keep the scan in `running`.
    await Promise.race([output, sleep(OUTPUT_DRAIN_TIMEOUT_MS)])
    await new Promise<void>((resolve) => log.end(resolve))
    try {
      await tick()
    } catch (error) {
      console.error(`[worker] scan ${scan.id}: final poll failed: ${(error as Error).message}`)
    }

    const reportMd = state.runDir ? await readReport(state.runDir) : null
    const finishedAt = new Date()
    if (stopRequested) {
      await store.setStatus(scan.id, 'stopped', 'Scan stopped', { finishedAt, reportMd })
    } else if (state.previous?.run.status === 'completed') {
      await store.setStatus(scan.id, 'completed', 'Scan completed', { finishedAt, reportMd })
    } else {
      const detail = tail.slice(-5).join(' | ') || `exit code ${exitCode}`
      const error = `Strix exited with code ${exitCode}: ${detail}`.slice(0, 2000)
      await store.setStatus(scan.id, 'failed', 'Scan failed', { finishedAt, reportMd, error })
    }
  }

  return async function processScan(job: ScanJob): Promise<void> {
    const { scanId } = job.data
    const scan = await store.get(scanId)
    if (!scan) {
      console.warn(`[worker] scan ${scanId} not found, dropping job ${job.id}`)
      return
    }
    if (scan.status === 'running' || scan.status === 'stopping') {
      // A redelivery: the worker that started this scan died with it, and the Strix process is gone.
      await store.setStatus(scan.id, 'failed', 'Scan failed', {
        error: 'Worker restarted during the scan. Resume it to continue.',
        finishedAt: new Date(),
      })
      await removeSandboxes(sandboxes, scan.id)
      return
    }
    if (scan.status !== 'queued' || !(await store.start(scan.id))) return
    try {
      await run(scan)
    } catch (error) {
      await markFailed(store, scan.id, (error as Error).message)
      throw error
    } finally {
      // Whatever the outcome: completed, failed, stopped or a crash in our own code.
      await removeSandboxes(sandboxes, scan.id)
    }
  }
}

// Backstop for crashes in our own code: leave no scan stuck in a live status.
export async function markFailed(store: ScanStore, scanId: string, error: string) {
  const status = await store.status(scanId)
  if (!status || isFinishedScanStatus(status)) return
  await store.setStatus(scanId, 'failed', 'Scan failed', {
    error: error.slice(0, 2000),
    finishedAt: new Date(),
  })
}
