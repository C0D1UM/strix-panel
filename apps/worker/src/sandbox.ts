// Strix's Docker sandbox containers. Strix only removes them on a clean exit, so the worker removes them itself
// once a scan ends. Strix labels each container with STRIX_RUN_ID / STRIX_RUN_TYPE from its environment; the
// processor sets them to the scan id and SANDBOX_RUN_TYPE, which is how containers are found here.
import { isFinishedScanStatus, type ScanStatus } from '@strix-panel/shared'

export const SANDBOX_RUN_TYPE = 'strix-panel'

export interface Sandboxes {
  // Force-removes (stop + remove, with anonymous volumes) every container of this scan.
  remove(scanId: string): Promise<void>
  // Scan ids that still have containers.
  scanIds(): Promise<string[]>
}

export interface DockerOptions {
  bin?: string
  // Environment for the docker CLI (DOCKER_HOST and friends). Defaults to ours.
  env?: Record<string, string | undefined>
}

export function createDockerSandboxes({ bin = 'docker', env }: DockerOptions = {}): Sandboxes {
  async function docker(args: string[]): Promise<string> {
    const proc = Bun.spawn([bin, ...args], {
      env,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (code !== 0) throw new Error(`docker ${args[0]} exited with code ${code}: ${stderr.trim()}`)
    return stdout
  }
  const lines = (text: string) => [
    ...new Set(
      text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ]

  return {
    async remove(scanId) {
      const ids = lines(await docker(['ps', '-aq', '--filter', `label=strix-run-id=${scanId}`]))
      if (ids.length > 0) await docker(['rm', '-f', '-v', ...ids])
    },
    async scanIds() {
      return lines(
        await docker([
          'ps',
          '-a',
          '--filter',
          `label=strix-run-type=${SANDBOX_RUN_TYPE}`,
          '--format',
          '{{.Label "strix-run-id"}}',
        ]),
      )
    },
  }
}

// Best effort: a cleanup failure is logged and never changes the scan's outcome.
export async function removeSandboxes(sandboxes: Sandboxes, scanId: string): Promise<void> {
  try {
    await sandboxes.remove(scanId)
  } catch (error) {
    console.error(
      `[worker] scan ${scanId}: removing sandbox containers failed: ${(error as Error).message}`,
    )
  }
}

// On startup: removes containers left behind by a worker that died mid-scan. Only scans that are finished (or
// gone) are touched, so live scans on another worker keep their sandbox.
export async function sweepSandboxes(
  sandboxes: Sandboxes,
  status: (scanId: string) => Promise<ScanStatus | null>,
): Promise<string[]> {
  const removed: string[] = []
  for (const scanId of await sandboxes.scanIds()) {
    let current: ScanStatus | null
    try {
      current = await status(scanId)
    } catch (error) {
      console.error(`[worker] sweep: reading scan ${scanId} failed: ${(error as Error).message}`)
      continue
    }
    if (current && !isFinishedScanStatus(current)) continue
    await removeSandboxes(sandboxes, scanId)
    removed.push(scanId)
  }
  return removed
}
