import { ref } from 'vue'
import { authClient } from './auth-client'
import { currentUser } from './current-user'

type Session = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>['data']>

export const session = ref<Session | null>(null)
let loaded = false

export async function loadSession(force = false) {
  if (loaded && !force) return session.value
  const { data } = await authClient.getSession()
  session.value = data ?? null
  loaded = true
  return session.value
}

export async function signOut() {
  await authClient.signOut()
  session.value = null
  currentUser.value = null
}
