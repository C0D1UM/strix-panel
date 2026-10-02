import { treaty } from '@elysiajs/eden'
import type { App } from '@strix-panel/api'

// Typed client for our API: `api.v1.me.get()` → GET /api/v1/me.
// `parseDate: false`: Eden otherwise turns date-like strings (e.g. a `2026-09-18` chart bucket) into
// `Date` objects at runtime, while the types still say `string`.
export const api = treaty<App>(window.location.origin, { parseDate: false }).api
