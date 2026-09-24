// Turns two consecutive snapshots of a run into the scan row patch, the findings to upsert and the feed events.
// Pure: no I/O, so the processor stays thin and this is easy to test with fixtures.
import type { ScanAgent, scan, scanEvent, scanFinding } from '@strix-panel/db/schema'
import { FINDING_SEVERITIES, type FindingSeverity, type ScanEventType } from '@strix-panel/shared'
import type { RunState, StrixFinding } from './run-dir'

export type ScanPatch = Partial<typeof scan.$inferInsert>
export type FindingInsert = Omit<typeof scanFinding.$inferInsert, 'scanId'>
export type EventInsert = Omit<typeof scanEvent.$inferInsert, 'scanId'>

export interface RunDiff {
  patch: ScanPatch
  findings: FindingInsert[]
  events: EventInsert[]
}

// Strix agent statuses: running, waiting, budget_paused (live); completed, stopped (done); failed, crashed (broken).
const AGENT_DONE = new Set(['completed', 'stopped'])
const AGENT_BROKEN = new Set(['failed', 'crashed'])

const event = (
  type: ScanEventType,
  message: string,
  data: Record<string, unknown>,
): EventInsert => ({
  type,
  message,
  data,
})

function toSeverity(value: string): FindingSeverity {
  const lower = value.toLowerCase()
  return (FINDING_SEVERITIES as readonly string[]).includes(lower)
    ? (lower as FindingSeverity)
    : 'info'
}

const optional = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null

function toCvss(value: unknown): number | null {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : null
}

export function toFindingInsert(finding: StrixFinding): FindingInsert {
  const foundAt = new Date(finding.timestamp)
  return {
    strixId: finding.id,
    title: finding.title || 'Untitled finding',
    severity: toSeverity(finding.severity ?? ''),
    target: optional(finding.target),
    endpoint: optional(finding.endpoint),
    method: optional(finding.method),
    cve: optional(finding.cve),
    cwe: optional(finding.cwe),
    confidence: optional(finding.confidence),
    cvss: toCvss(finding.cvss),
    foundAt: Number.isNaN(foundAt.getTime()) ? new Date() : foundAt,
    report: finding,
  }
}

function severityCounts(findings: StrixFinding[]) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const finding of findings) counts[toSeverity(finding.severity ?? '')] += 1
  return counts
}

function agentEvents(prev: ScanAgent[], next: ScanAgent[]): EventInsert[] {
  const before = new Map(prev.map((agent) => [agent.id, agent]))
  const events: EventInsert[] = []
  for (const agent of next) {
    const old = before.get(agent.id)
    if (!old)
      events.push(event('agent_started', `Agent ${agent.name} started`, { agentId: agent.id }))
    if (old?.status === agent.status) continue
    if (AGENT_DONE.has(agent.status)) {
      events.push(event('agent_finished', `Agent ${agent.name} finished`, { agentId: agent.id }))
    } else if (AGENT_BROKEN.has(agent.status)) {
      const reason = agent.error ? `: ${agent.error}` : ''
      events.push(
        event('agent_failed', `Agent ${agent.name} failed${reason}`, { agentId: agent.id }),
      )
    }
  }
  return events
}

export function diffRunState(prev: RunState | null, next: RunState): RunDiff {
  const counts = severityCounts(next.findings)
  const patch: ScanPatch = {
    runName: next.runName,
    requests: next.run.usage.requests,
    inputTokens: next.run.usage.inputTokens,
    outputTokens: next.run.usage.outputTokens,
    cachedTokens: next.run.usage.cachedTokens,
    costUsd: next.run.usage.cost,
    findingsCritical: counts.critical,
    findingsHigh: counts.high,
    findingsMedium: counts.medium,
    findingsLow: counts.low,
    findingsInfo: counts.info,
    agents: next.agents,
  }

  const previousFindings = new Map(
    (prev?.findings ?? []).map((finding) => [finding.id, JSON.stringify(finding)]),
  )
  const findings: FindingInsert[] = []
  const events = agentEvents(prev?.agents ?? [], next.agents)
  for (const finding of next.findings) {
    const before = previousFindings.get(finding.id)
    if (before === JSON.stringify(finding)) continue
    const insert = toFindingInsert(finding)
    findings.push(insert)
    if (before === undefined) {
      events.push(
        event('finding', `${insert.severity.toUpperCase()}: ${insert.title}`, {
          findingId: finding.id,
          severity: insert.severity,
        }),
      )
    }
  }

  return { patch, findings, events }
}
