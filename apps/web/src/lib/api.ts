import { treaty } from '@elysiajs/eden'
import type { App } from '@strix-panel/api'

// Typed client for our API: `api.v1.me.get()` → GET /api/v1/me.
export const api = treaty<App>(window.location.origin).api
