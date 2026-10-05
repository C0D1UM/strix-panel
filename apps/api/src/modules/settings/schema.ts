import { t } from 'elysia'

export const SettingsResponse = t.Object({
  auth: t.Object({
    registrationEnabled: t.Boolean(),
    autoApproveUsers: t.Boolean(),
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
  },
  { additionalProperties: false },
)
