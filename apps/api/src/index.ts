import { MAX_SCAN_TARGET_FILE_BYTES, MAX_SCAN_TARGETS } from '@strix-panel/shared'
import { app } from './app'
import { env } from './lib/env'

// The largest legitimate request is a scan with three spec files, plus room for the other fields.
const MAX_REQUEST_BODY_BYTES = MAX_SCAN_TARGETS * MAX_SCAN_TARGET_FILE_BYTES + 1024 * 1024

app.listen({ port: env.API_PORT, maxRequestBodySize: MAX_REQUEST_BODY_BYTES })
console.log(`API listening on http://localhost:${env.API_PORT} (docs at /api/docs)`)
