import type { FindingSeverity, ScanEventType, ScanMode, ScanStatus } from '@strix-panel/shared'
import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { createdAt, id, updatedAt } from './columns'

// Snapshot of one Strix agent, taken from `.state/agents.json`.
export interface ScanAgent {
  id: string
  name: string
  parentId: string | null
  status: string
  error: string | null
}

const tokens = (name: string) => bigint(name, { mode: 'number' }).notNull().default(0)
const count = (name: string) => integer(name).notNull().default(0)

export const scan = pgTable(
  'scan',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name'),
    targets: text('targets').array().notNull(),
    scanMode: text('scan_mode').$type<ScanMode>().notNull(),
    instruction: text('instruction'),
    maxBudgetUsd: numeric('max_budget_usd', { precision: 10, scale: 2, mode: 'number' }),
    status: text('status').$type<ScanStatus>().notNull().default('queued'),
    runName: text('run_name'),
    error: text('error'),
    requests: tokens('requests'),
    inputTokens: tokens('input_tokens'),
    outputTokens: tokens('output_tokens'),
    cachedTokens: tokens('cached_tokens'),
    costUsd: numeric('cost_usd', { precision: 12, scale: 4, mode: 'number' }).notNull().default(0),
    findingsCritical: count('findings_critical'),
    findingsHigh: count('findings_high'),
    findingsMedium: count('findings_medium'),
    findingsLow: count('findings_low'),
    findingsInfo: count('findings_info'),
    reportMd: text('report_md'),
    agents: jsonb('agents').$type<ScanAgent[]>().notNull().default([]),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('scan_user_id_created_at_idx').on(t.userId, t.createdAt.desc())],
)

export const scanFinding = pgTable(
  'scan_finding',
  {
    id: id(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scan.id, { onDelete: 'cascade' }),
    strixId: text('strix_id').notNull(),
    title: text('title').notNull(),
    severity: text('severity').$type<FindingSeverity>().notNull(),
    target: text('target'),
    endpoint: text('endpoint'),
    method: text('method'),
    cve: text('cve'),
    cwe: text('cwe'),
    confidence: text('confidence'),
    cvss: numeric('cvss', { precision: 3, scale: 1, mode: 'number' }),
    foundAt: timestamp('found_at', { withTimezone: true }).notNull(),
    // The whole report object as Strix wrote it to vulnerabilities.json.
    report: jsonb('report').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('scan_finding_scan_id_strix_id_idx').on(t.scanId, t.strixId)],
)

export const scanEvent = pgTable(
  'scan_event',
  {
    id: id(),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scan.id, { onDelete: 'cascade' }),
    type: text('type').$type<ScanEventType>().notNull(),
    message: text('message').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('scan_event_scan_id_id_idx').on(t.scanId, t.id)],
)
