import { SCAN_TARGETS_HARD_LIMIT } from '@strix-panel/shared'
import { t } from 'elysia'

const BudgetWindow = t.Union([
  t.Literal('week'),
  t.Literal('month'),
  t.Literal('year'),
  t.Literal('forever'),
])
// Same bounds as a user's budget (PATCH /admin/users/:id/budget).
const Usd = t.Number({ minimum: 0, maximum: 100_000 })

export const SettingsResponse = t.Object({
  auth: t.Object({
    registrationEnabled: t.Boolean(),
    autoApproveUsers: t.Boolean(),
  }),
  budget: t.Object({
    minToStartUsd: t.Number(),
    newUserLimitEnabled: t.Boolean(),
    newUserLimitUsd: t.Number(),
    newUserWindow: BudgetWindow,
  }),
  scans: t.Object({
    maxTargets: t.Integer(),
  }),
})

// Every field is optional: send only what changed.
export const SettingsPatchBody = t.Object(
  {
    auth: t.Optional(
      t.Object(
        {
          registrationEnabled: t.Optional(t.Boolean()),
          autoApproveUsers: t.Optional(t.Boolean()),
        },
        { additionalProperties: false },
      ),
    ),
    budget: t.Optional(
      t.Object(
        {
          minToStartUsd: t.Optional(Usd),
          newUserLimitEnabled: t.Optional(t.Boolean()),
          newUserLimitUsd: t.Optional(Usd),
          newUserWindow: t.Optional(BudgetWindow),
        },
        { additionalProperties: false },
      ),
    ),
    scans: t.Optional(
      t.Object(
        {
          maxTargets: t.Optional(t.Integer({ minimum: 1, maximum: SCAN_TARGETS_HARD_LIMIT })),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
)
