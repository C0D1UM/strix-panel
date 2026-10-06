import { t } from 'elysia'

export const PublicConfigResponse = t.Object({
  auth: t.Object({
    providers: t.Array(t.Union([t.Literal('google'), t.Literal('email')])),
    registrationEnabled: t.Boolean(),
  }),
  branding: t.Object({
    // Show the "Powered by CODIUM" credit (SHOW_POWERED_BY_CODIUM).
    showPoweredBy: t.Boolean(),
  }),
  budget: t.Object({
    // What a user with a budget must have left to start a scan (Admin → Settings).
    minToStartUsd: t.Number(),
  }),
  scans: t.Object({
    // Targets a new scan may have (Admin → Settings).
    maxTargets: t.Integer(),
  }),
})
