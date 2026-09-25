import {
  FINDING_SEVERITIES,
  MAX_SCAN_INSTRUCTION_LENGTH,
  MAX_SCAN_NAME_LENGTH,
  MAX_SCAN_TARGETS,
  SCAN_EVENT_TYPES,
  SCAN_MODES,
  SCAN_STATUSES,
  SCAN_TABS,
} from '@strix-panel/shared'
import { t } from 'elysia'

const Timestamp = t.String({ format: 'date-time' })

export const ScanAgentSchema = t.Object({
  id: t.String(),
  name: t.String(),
  parentId: t.Nullable(t.String()),
  status: t.String(),
  error: t.Nullable(t.String()),
})

export const ScanOwner = t.Object({
  id: t.String(),
  name: t.String(),
  email: t.String(),
  removed: t.Boolean(),
})

export const ScanResponse = t.Object({
  id: t.String(),
  name: t.Nullable(t.String()),
  targets: t.Array(t.String()),
  scanMode: t.UnionEnum(SCAN_MODES),
  instruction: t.Nullable(t.String()),
  maxBudgetUsd: t.Nullable(t.Number()),
  status: t.UnionEnum(SCAN_STATUSES),
  runName: t.Nullable(t.String()),
  error: t.Nullable(t.String()),
  requests: t.Number(),
  inputTokens: t.Number(),
  outputTokens: t.Number(),
  cachedTokens: t.Number(),
  costUsd: t.Number(),
  findings: t.Object({
    critical: t.Number(),
    high: t.Number(),
    medium: t.Number(),
    low: t.Number(),
    info: t.Number(),
  }),
  hasReport: t.Boolean(),
  agents: t.Array(ScanAgentSchema),
  owner: ScanOwner,
  startedAt: t.Nullable(Timestamp),
  finishedAt: t.Nullable(Timestamp),
  createdAt: Timestamp,
  updatedAt: Timestamp,
})

export const CreateScanBody = t.Object({
  name: t.Optional(t.String({ maxLength: MAX_SCAN_NAME_LENGTH })),
  targets: t.Array(t.String({ minLength: 1, maxLength: 2048 }), {
    minItems: 1,
    maxItems: MAX_SCAN_TARGETS,
  }),
  scanMode: t.UnionEnum(SCAN_MODES),
  instruction: t.Optional(t.String({ maxLength: MAX_SCAN_INSTRUCTION_LENGTH })),
  maxBudgetUsd: t.Optional(t.Number({ exclusiveMinimum: 0, maximum: 100_000 })),
})

export const ScanIdParams = t.Object({ id: t.String({ format: 'uuid' }) })

export const ListScansQuery = t.Object({
  page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
  pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
  q: t.Optional(
    t.String({ maxLength: 200, description: 'Matches the scan name or any target, any case' }),
  ),
  // A Union of Literals, not UnionEnum: an optional UnionEnum query param defaults to its first value.
  tab: t.Optional(t.Union(SCAN_TABS.map((tab) => t.Literal(tab)))),
  ownerId: t.Optional(
    t.String({ format: 'uuid', description: 'Admins only; ignored for other users' }),
  ),
})

export const ScanListResponse = t.Object({
  items: t.Array(ScanResponse),
  page: t.Integer(),
  pageSize: t.Integer(),
  total: t.Integer({ description: 'Scans in the selected tab' }),
  counts: t.Object(
    {
      all: t.Integer(),
      active: t.Integer(),
      completed: t.Integer(),
      failed: t.Integer(),
      stopped: t.Integer(),
    },
    { description: 'Scans per tab, with the search and owner filters applied' },
  ),
})

export const ListEventsQuery = t.Object({ after: t.Optional(t.String({ format: 'uuid' })) })

export const ScanEventResponse = t.Object({
  id: t.String(),
  type: t.UnionEnum(SCAN_EVENT_TYPES),
  message: t.String(),
  data: t.Nullable(t.Record(t.String(), t.Unknown())),
  createdAt: Timestamp,
})

export const ScanFindingResponse = t.Object({
  id: t.String(),
  strixId: t.String(),
  title: t.String(),
  severity: t.UnionEnum(FINDING_SEVERITIES),
  target: t.Nullable(t.String()),
  endpoint: t.Nullable(t.String()),
  method: t.Nullable(t.String()),
  cve: t.Nullable(t.String()),
  cwe: t.Nullable(t.String()),
  confidence: t.Nullable(t.String()),
  cvss: t.Nullable(t.Number()),
  foundAt: Timestamp,
  report: t.Record(t.String(), t.Unknown()),
})

export const ErrorResponse = t.Object({
  error: t.Object({ code: t.String(), message: t.String() }),
})

export const ReportPdfResponse = t.Object({
  state: t.Union(
    [t.Literal('none'), t.Literal('pending'), t.Literal('ready'), t.Literal('failed')],
    { description: 'none: never requested, or the cached PDF expired. Request it again.' },
  ),
  error: t.Nullable(t.String()),
})
