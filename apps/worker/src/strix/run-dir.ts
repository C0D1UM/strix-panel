// Reads the files Strix writes to strix_runs/<run_name>/. Every reader tolerates missing or half-written files:
// Strix rewrites them atomically, but a poll can still land between the run dir appearing and run.json existing.
import type { ScanAgent } from '@strix-panel/db/schema'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface StrixLlmUsage {
  requests: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  cost: number
}

export interface StrixRunRecord {
  status: string
  usage: StrixLlmUsage
}

// One entry of vulnerabilities.json, as Strix wrote it. Only the fields the panel reads are typed.
export interface StrixFinding {
  id: string
  title: string
  severity: string
  timestamp: string
  target?: string | null
  endpoint?: string | null
  method?: string | null
  cve?: string | null
  cwe?: string | null
  cvss?: number | string | null
  confidence?: string | null
  [key: string]: unknown
}

export interface RunState {
  runName: string
  run: StrixRunRecord
  agents: ScanAgent[]
  findings: StrixFinding[]
}

// The single run directory Strix created under <workDir>/strix_runs/, or null until it exists.
export async function findRunDir(workDir: string): Promise<string | null> {
  const base = join(workDir, 'strix_runs')
  let entries: string[]
  try {
    entries = await readdir(base)
  } catch {
    return null
  }
  const name = entries.filter((entry) => !entry.startsWith('.')).sort()[0]
  return name ? join(base, name) : null
}

async function readJson(path: string): Promise<unknown> {
  const file = Bun.file(path)
  if (!(await file.exists())) return undefined
  try {
    return await file.json()
  } catch {
    return undefined
  }
}

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

function parseRunRecord(raw: unknown): StrixRunRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const usage = (record.llm_usage ?? {}) as Record<string, unknown>
  const inputDetails = (usage.input_tokens_details ?? {}) as Record<string, unknown>
  return {
    status: str(record.status) ?? 'running',
    usage: {
      requests: num(usage.requests),
      inputTokens: num(usage.input_tokens),
      outputTokens: num(usage.output_tokens),
      cachedTokens: num(inputDetails.cached_tokens ?? usage.cached_tokens),
      cost: num(usage.cost),
    },
  }
}

export function parseAgents(raw: unknown): ScanAgent[] {
  if (!raw || typeof raw !== 'object') return []
  const snapshot = raw as Record<string, Record<string, unknown> | undefined>
  const statuses = snapshot.statuses ?? {}
  const names = snapshot.names ?? {}
  const parents = snapshot.parent_of ?? {}
  const errors = snapshot.errors ?? {}
  return Object.entries(statuses).map(([id, status]) => ({
    id,
    name: str(names[id]) ?? id,
    parentId: str(parents[id]),
    status: str(status) ?? 'running',
    error: str(errors[id]),
  }))
}

export function parseFindings(raw: unknown): StrixFinding[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (entry): entry is StrixFinding =>
      !!entry && typeof entry === 'object' && typeof (entry as StrixFinding).id === 'string',
  )
}

// Null until run.json is readable. agents.json and vulnerabilities.json are optional.
export async function readRunState(runDir: string): Promise<RunState | null> {
  const run = parseRunRecord(await readJson(join(runDir, 'run.json')))
  if (!run) return null
  const [agents, findings] = await Promise.all([
    readJson(join(runDir, '.state', 'agents.json')),
    readJson(join(runDir, 'vulnerabilities.json')),
  ])
  return {
    runName: runDir.split('/').at(-1)!,
    run,
    agents: parseAgents(agents),
    findings: parseFindings(findings),
  }
}

// The whole-scan report, written by Strix when the scan finishes.
export async function readReport(runDir: string): Promise<string | null> {
  const file = Bun.file(join(runDir, 'penetration_test_report.md'))
  return (await file.exists()) ? file.text() : null
}
