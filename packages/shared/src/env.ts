import type { Static, TObject } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

// Validates env vars against a TypeBox schema: applies defaults, coerces strings to numbers/booleans,
// and throws one readable error listing every invalid variable.
export function parseEnv<T extends TObject>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): Static<T> {
  const raw = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ''),
  )
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
