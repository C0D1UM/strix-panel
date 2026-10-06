import { MAX_SCAN_TARGET_FILE_BYTES, SCAN_TARGETS_HARD_LIMIT } from '@strix-panel/shared'
import { app } from './app'
import { env } from './lib/env'

// The largest legitimate request is a scan with as many spec files as the max target setting can allow, plus room
// for the other fields.
const MAX_REQUEST_BODY_BYTES = SCAN_TARGETS_HARD_LIMIT * MAX_SCAN_TARGET_FILE_BYTES + 1024 * 1024

app.listen({ port: env.API_PORT, maxRequestBodySize: MAX_REQUEST_BODY_BYTES })
console.log(`API listening on http://localhost:${env.API_PORT} (docs at /api/docs)`)
