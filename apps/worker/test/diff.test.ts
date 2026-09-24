import { describe, expect, test } from 'bun:test'
import { diffRunState } from '../src/strix/diff'
import { parseAgents, parseFindings, type RunState } from '../src/strix/run-dir'

const state = (over: Partial<RunState> = {}): RunState => ({
  runName: 'example_1234',
  run: {
    status: 'running',
    usage: { requests: 1, inputTokens: 10, outputTokens: 5, cachedTokens: 2, cost: 0.01 },
  },
  agents: [],
  findings: [],
  ...over,
})

const finding = (id: string, severity = 'high', extra: Record<string, unknown> = {}) => ({
  id,
  title: `Finding ${id}`,
  severity,
  timestamp: '2026-09-24T10:00:00+00:00',
  ...extra,
})

describe('diffRunState', () => {
  test('first tick copies usage and run name and announces every agent', () => {
    const next = state({
      agents: parseAgents({
        statuses: { root: 'running', child: 'waiting' },
        names: { root: 'StrixAgent', child: 'recon' },
        parent_of: { root: null, child: 'root' },
      }),
    })
    const { patch, events, findings } = diffRunState(null, next)
    expect(patch).toMatchObject({
      runName: 'example_1234',
      inputTokens: 10,
      cachedTokens: 2,
      costUsd: 0.01,
    })
    expect(patch.agents).toEqual([
      { id: 'root', name: 'StrixAgent', parentId: null, status: 'running', error: null },
      { id: 'child', name: 'recon', parentId: 'root', status: 'waiting', error: null },
    ])
    expect(events.map((e) => e.type)).toEqual(['agent_started', 'agent_started'])
    expect(findings).toEqual([])
  })

  test('agent status changes produce finished and failed events once', () => {
    const prev = state({
      agents: parseAgents({ statuses: { a: 'running', b: 'running' }, names: {} }),
    })
    const next = state({
      agents: parseAgents({
        statuses: { a: 'completed', b: 'crashed' },
        names: { a: 'A', b: 'B' },
        errors: { b: 'out of memory' },
      }),
    })
    const { events } = diffRunState(prev, next)
    expect(events).toEqual([
      { type: 'agent_finished', message: 'Agent A finished', data: { agentId: 'a' } },
      { type: 'agent_failed', message: 'Agent B failed: out of memory', data: { agentId: 'b' } },
    ])
    expect(diffRunState(next, next).events).toEqual([])
  })

  test('new findings are upserted with an event, updated ones without', () => {
    const prev = state({ findings: parseFindings([finding('vuln-0001')]) })
    const next = state({
      findings: parseFindings([
        finding('vuln-0001', 'critical', { cvss: '9.8' }),
        finding('vuln-0002', 'Low'),
        finding('vuln-0003', 'bogus'),
      ]),
    })
    const { patch, findings, events } = diffRunState(prev, next)
    expect(findings.map((f) => [f.strixId, f.severity, f.cvss])).toEqual([
      ['vuln-0001', 'critical', 9.8],
      ['vuln-0002', 'low', null],
      ['vuln-0003', 'info', null],
    ])
    expect(events).toEqual([
      {
        type: 'finding',
        message: 'LOW: Finding vuln-0002',
        data: { findingId: 'vuln-0002', severity: 'low' },
      },
      {
        type: 'finding',
        message: 'INFO: Finding vuln-0003',
        data: { findingId: 'vuln-0003', severity: 'info' },
      },
    ])
    expect(patch).toMatchObject({
      findingsCritical: 1,
      findingsHigh: 0,
      findingsLow: 1,
      findingsInfo: 1,
    })
    expect(diffRunState(next, next).findings).toEqual([])
  })
})
