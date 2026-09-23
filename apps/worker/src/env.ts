import { Type } from '@sinclair/typebox'
import { parseEnv } from '@strix-panel/shared/env'

const schema = Type.Object({
  DATABASE_URL: Type.String({ minLength: 1 }),
  WORKER_CONCURRENCY: Type.Integer({ minimum: 1, default: 1 }),
  WORKER_HEALTH_PORT: Type.Number({ default: 3001 }),
  // Passed through to the Strix CLI once scans are wired up.
  STRIX_LLM: Type.String({ default: '' }),
  LLM_API_KEY: Type.String({ default: '' }),
})

export const env = parseEnv(schema)
