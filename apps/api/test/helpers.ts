import { app } from '../src/app'

export const ORIGIN = 'http://localhost:5173'

export function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('origin', ORIGIN)
  if (init.body) headers.set('content-type', 'application/json')
  return app.handle(new Request(`${ORIGIN}${path}`, { ...init, headers }))
}

export async function signUp(email: string) {
  const res = await request('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'correct-horse-battery', name: email.split('@')[0] }),
  })
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  return { res, cookie }
}
