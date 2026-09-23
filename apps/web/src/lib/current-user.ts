import { ref } from 'vue'
import { api } from './api'

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof api.v1.me.get>>['data']>

// The signed-in user's profile, shared by the app shell and pages. Loaded once by AppLayout.
export const currentUser = ref<CurrentUser | null>(null)

export async function loadCurrentUser() {
  const { data } = await api.v1.me.get()
  currentUser.value = data ?? null
  return currentUser.value
}
