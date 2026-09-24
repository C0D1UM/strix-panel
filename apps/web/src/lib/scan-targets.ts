import { MAX_SCAN_TARGETS, normalizeScanTarget } from '@strix-panel/shared'

export interface ParsedTargets {
  targets: string[]
  errors: string[]
}

// One URL per line. Mirrors the API's rules so the form can validate as you type.
export function parseTargetsInput(text: string): ParsedTargets {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const errors: string[] = []
  const targets: string[] = []
  for (const line of lines) {
    const url = normalizeScanTarget(line)
    if (!url) errors.push(`Not an http(s) URL: ${line}`)
    else if (!targets.includes(url)) targets.push(url)
  }
  if (lines.length === 0) errors.push('Enter at least one target URL')
  if (targets.length > MAX_SCAN_TARGETS) errors.push(`At most ${MAX_SCAN_TARGETS} targets per scan`)
  return { targets, errors }
}
