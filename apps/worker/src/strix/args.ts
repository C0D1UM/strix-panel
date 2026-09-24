import type { ScanMode } from '@strix-panel/shared'

export interface StrixScanOptions {
  targets: string[]
  scanMode: ScanMode
  instruction: string | null
  maxBudgetUsd: number | null
}

// The argv for one non-interactive Strix run. Targets and instructions are user input: they are passed as
// separate argv entries and never through a shell.
export function buildStrixArgs(bin: string, scan: StrixScanOptions): string[] {
  return [
    bin,
    '-n',
    ...scan.targets.flatMap((target) => ['-t', target]),
    '-m',
    scan.scanMode,
    ...(scan.instruction ? ['--instruction', scan.instruction] : []),
    ...(scan.maxBudgetUsd !== null ? ['--max-budget', String(scan.maxBudgetUsd)] : []),
  ]
}
