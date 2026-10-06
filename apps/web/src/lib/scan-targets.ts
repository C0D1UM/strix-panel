import {
  checkScanTargetFileName,
  MAX_SCAN_TARGET_FILE_BYTES,
  normalizeScanTarget,
} from '@strix-panel/shared'

// One row of the new scan form's target list: a URL being typed, or a picked spec file.
export type TargetRow =
  { id: number; kind: 'url'; text: string } | { id: number; kind: 'file'; file: File }

let lastRowId = 0
export const newTargetRow = (): TargetRow => ({ id: ++lastRowId, kind: 'url', text: '' })

const MAX_FILE_MB = MAX_SCAN_TARGET_FILE_BYTES / (1024 * 1024)

// Mirrors the API's rules so the form can validate as you type. Targets keep the rows' order; the API also checks
// file contents, which the form does not. `maxTargets` is the scans.maxTargets setting.
export function validateTargetRows(
  rows: TargetRow[],
  maxTargets: number,
): {
  targets: (string | File)[]
  errors: string[]
} {
  const targets: (string | File)[] = []
  const errors: string[] = []
  const names = new Set<string>()
  for (const row of rows) {
    if (row.kind === 'url') {
      const text = row.text.trim()
      if (!text) continue
      const url = normalizeScanTarget(text)
      if (!url) errors.push(`Not an http(s) URL: ${text}`)
      else if (!targets.includes(url)) targets.push(url)
      continue
    }
    const { file } = row
    const key = file.name.toLowerCase()
    const problem =
      checkScanTargetFileName(file.name) ??
      (file.size > MAX_SCAN_TARGET_FILE_BYTES
        ? `${file.name}: larger than ${MAX_FILE_MB} MB`
        : null) ??
      (names.has(key) ? `${file.name}: added more than once` : null)
    if (problem) {
      errors.push(problem)
      continue
    }
    names.add(key)
    targets.push(file)
  }
  if (targets.length === 0 && errors.length === 0) errors.push('Add at least one target')
  if (targets.length > maxTargets) errors.push(`At most ${maxTargets} targets per scan`)
  return { targets, errors }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
