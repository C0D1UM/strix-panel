import { t } from 'elysia'

export const DASHBOARD_SCOPES = ['all', 'me'] as const
export type DashboardScope = (typeof DASHBOARD_SCOPES)[number]

// Bounds are validated in the service so a bad value is a 400 INVALID_RANGE, not a 422.
export const DashboardQuery = t.Object({
  start: t.Optional(t.String({ description: 'ISO 8601 timestamp with UTC offset, inclusive' })),
  end: t.Optional(t.String({ description: 'ISO 8601 timestamp with UTC offset, inclusive' })),
  // Not t.UnionEnum: as an optional query param Elysia fills it with the first value.
  scope: t.Optional(t.Union(DASHBOARD_SCOPES.map((scope) => t.Literal(scope)))),
})

const Findings = t.Object({
  critical: t.Number(),
  high: t.Number(),
  medium: t.Number(),
  low: t.Number(),
  info: t.Number(),
})

export const DashboardResponse = t.Object({
  kpis: t.Object({
    runs: t.Object({
      total: t.Number(),
      completed: t.Number(),
      failed: t.Number(),
      stopped: t.Number(),
      running: t.Number(),
    }),
    tokens: t.Object({ input: t.Number(), output: t.Number(), cached: t.Number() }),
    costUsd: t.Number(),
    findings: Findings,
  }),
  series: t.Object({
    granularity: t.UnionEnum(['day', 'month']),
    points: t.Array(
      t.Object({ bucket: t.String(), runs: t.Number(), tokens: t.Number(), costUsd: t.Number() }),
    ),
  }),
  statusCounts: t.Object({
    queued: t.Number(),
    running: t.Number(),
    stopping: t.Number(),
    completed: t.Number(),
    failed: t.Number(),
    stopped: t.Number(),
  }),
  admin: t.Optional(
    t.Object({
      users: t.Object({ total: t.Number(), active: t.Number() }),
      health: t.Object({
        queued: t.Number(),
        running: t.Number(),
        failureRate: t.Nullable(t.Number()),
      }),
      perUser: t.Array(
        t.Object({
          userId: t.String(),
          name: t.String(),
          email: t.String(),
          runs: t.Number(),
          tokens: t.Number(),
          costUsd: t.Number(),
          findings: t.Number(),
        }),
      ),
    }),
  ),
})
