import { describe, expect, test } from 'bun:test'
import {
  checkScanResume,
  isAllowedEmail,
  isFinishedScanStatus,
  normalizeScanTarget,
  type ResumableScan,
} from './index'

describe('isAllowedEmail', () => {
  test('allows everyone when no domains configured', () => {
    expect(isAllowedEmail('a@gmail.com', [])).toBe(true)
  })

  test('matches configured domains case-insensitively', () => {
    expect(isAllowedEmail('a@Example.com', ['example.com'])).toBe(true)
    expect(isAllowedEmail('a@other.com', ['example.com'])).toBe(false)
  })

  test('does not match subdomains or suffixes', () => {
    expect(isAllowedEmail('a@evil-example.com', ['example.com'])).toBe(false)
    expect(isAllowedEmail('a@sub.example.com', ['example.com'])).toBe(false)
  })
})

describe('normalizeScanTarget', () => {
  test('accepts http and https URLs and normalizes them', () => {
    expect(normalizeScanTarget(' https://Example.com ')).toBe('https://example.com/')
    expect(normalizeScanTarget('http://10.0.0.1:8080/app')).toBe('http://10.0.0.1:8080/app')
  })

  test('rejects other protocols and non-URLs', () => {
    expect(normalizeScanTarget('ftp://example.com')).toBeNull()
    expect(normalizeScanTarget('file:///etc/passwd')).toBeNull()
    expect(normalizeScanTarget('example.com')).toBeNull()
    expect(normalizeScanTarget('')).toBeNull()
  })
})

describe('isFinishedScanStatus', () => {
  test('only completed, failed and stopped are finished', () => {
    expect(['completed', 'failed', 'stopped'].every(isFinishedScanStatus)).toBe(true)
    expect(['queued', 'running', 'stopping'].some(isFinishedScanStatus)).toBe(false)
  })
})

describe('checkScanResume', () => {
  const scan = (over: Partial<ResumableScan> = {}): ResumableScan => ({
    status: 'failed',
    runName: 'example-com_ab12',
    agentCount: 2,
    costUsd: 1,
    maxBudgetUsd: 5,
    ...over,
  })

  test('continues a failed or stopped run that saved agents', () => {
    expect(checkScanResume(scan())).toEqual({ ok: true, mode: 'continue' })
    expect(checkScanResume(scan({ status: 'stopped', maxBudgetUsd: null }))).toEqual({
      ok: true,
      mode: 'continue',
    })
  })

  test('starts over when Strix never created a run', () => {
    expect(checkScanResume(scan({ runName: null, agentCount: 0 }))).toEqual({
      ok: true,
      mode: 'fresh',
    })
  })

  test('rejects live or completed scans, runs without agents and used-up budgets', () => {
    for (const status of ['queued', 'running', 'stopping', 'completed'] as const) {
      expect(checkScanResume(scan({ status }))).toMatchObject({ code: 'SCAN_NOT_RESUMABLE' })
    }
    expect(checkScanResume(scan({ agentCount: 0 }))).toMatchObject({ code: 'SCAN_NOT_RESUMABLE' })
    expect(checkScanResume(scan({ costUsd: 5 }))).toMatchObject({ code: 'SCAN_BUDGET_EXHAUSTED' })
  })
})
