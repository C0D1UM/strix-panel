import type { Static, TObject } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Validates env vars against a TypeBox schema: applies defaults, coerces strings to numbers/booleans,
// and throws one readable error listing every invalid variable. `defaults` fill in variables that are
// missing or empty, for defaults that depend on something else (e.g. NODE_ENV).
export function parseEnv<T extends TObject>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
  defaults: Record<string, string> = {},
): Static<T> {
  const raw = {
    ...defaults,
    ...Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== '')),
  }
  const value = Value.Default(schema, Value.Convert(schema, raw))
  if (Value.Check(schema, value)) return value as Static<T>
  const problems = [...Value.Errors(schema, value)].map((e) => `  ${e.path.slice(1)}: ${e.message}`)
  throw new Error(`Invalid environment:\n${[...new Set(problems)].join('\n')}`)
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

// Where the worker writes rendered PDF reports and the API reads them. Shared by both apps, so they agree on it in
// development; production mounts an in-memory volume there. The files are a cache: they may vanish at any time.
export const DEFAULT_REPORT_DIR = join(tmpdir(), 'strix-panel-reports')

export const reportPdfPath = (reportDir: string, scanId: string) => join(reportDir, `${scanId}.pdf`)
