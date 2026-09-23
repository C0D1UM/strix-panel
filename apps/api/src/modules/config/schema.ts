import { t } from 'elysia'

export const PublicConfigResponse = t.Object({
  auth: t.Object({
    providers: t.Array(t.Union([t.Literal('google'), t.Literal('email')])),
  }),
})
