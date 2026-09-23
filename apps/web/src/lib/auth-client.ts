import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/auth',
})
