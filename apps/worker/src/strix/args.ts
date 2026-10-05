import type { ScanMode, ScanTarget } from '@strix-panel/shared'
import { scanTargetFilePath } from '@strix-panel/shared/env'
import { resolve } from 'node:path'

export interface StrixScanOptions {
  id: string
  targets: ScanTarget[]
  scanMode: ScanMode
  instruction: string | null
  maxBudgetUsd: number | null
  // Set once Strix has created the run: the argv then continues that run instead of starting a new one.
  runName: string | null
}

// An uploaded file reaches Strix as an absolute path (Strix runs with the scan's own folder as cwd); Strix treats a
// .json/.yaml OpenAPI, Swagger or Postman file as an API spec target.
const targetArg = (target: ScanTarget, scanId: string, uploadDir: string) =>
  target.type === 'url' ? target.value : resolve(scanTargetFilePath(uploadDir, scanId, target.name))

// The argv for one non-interactive Strix run. Targets and instructions are user input: they are passed as
// separate argv entries and never through a shell.
export function buildStrixArgs(bin: string, scan: StrixScanOptions, uploadDir: string): string[] {
  const budget = scan.maxBudgetUsd !== null ? ['--max-budget', String(scan.maxBudgetUsd)] : []
  // A resumed run reads its targets, mode and instruction from run.json. Strix rejects `-t` with `--resume`, and
  // treats `--instruction` as a new message to the agents. The budget is not persisted, so it is passed again.
  if (scan.runName !== null) {
    // Strix stages spec files only for a fresh run; a resume gets a new sandbox without them. Put each back where the
    // agent first saw it (/workspace/api-specs/<name>).
    const specs = scan.targets.flatMap((target) =>
      target.type === 'file'
        ? ['--workspace-file', `${targetArg(target, scan.id, uploadDir)}:api-specs/${target.name}`]
        : [],
    )
    return [bin, '-n', '--resume', scan.runName, ...specs, ...budget]
  }
  return [
    bin,
    '-n',
    ...scan.targets.flatMap((target) => ['-t', targetArg(target, scan.id, uploadDir)]),
    '-m',
    scan.scanMode,
    ...(scan.instruction ? ['--instruction', scan.instruction] : []),
    ...budget,
  ]
}
