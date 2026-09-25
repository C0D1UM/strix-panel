import type { ScanMode } from '@strix-panel/shared'

export interface StrixScanOptions {
  targets: string[]
  scanMode: ScanMode
  instruction: string | null
  maxBudgetUsd: number | null
  // Set once Strix has created the run: the argv then continues that run instead of starting a new one.
  runName: string | null
}

// The argv for one non-interactive Strix run. Targets and instructions are user input: they are passed as
// separate argv entries and never through a shell.
export function buildStrixArgs(bin: string, scan: StrixScanOptions): string[] {
  const budget = scan.maxBudgetUsd !== null ? ['--max-budget', String(scan.maxBudgetUsd)] : []
  // A resumed run reads its targets, mode and instruction from run.json. Strix rejects `-t` with `--resume`, and
  // treats `--instruction` as a new message to the agents. The budget is not persisted, so it is passed again.
  if (scan.runName !== null) return [bin, '-n', '--resume', scan.runName, ...budget]
  return [
    bin,
    '-n',
    ...scan.targets.flatMap((target) => ['-t', target]),
    '-m',
    scan.scanMode,
    ...(scan.instruction ? ['--instruction', scan.instruction] : []),
    ...budget,
  ]
}
