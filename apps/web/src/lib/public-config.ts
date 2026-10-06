import { ref } from 'vue'
import { api } from './api'

export type PublicConfig = NonNullable<Awaited<ReturnType<typeof api.v1.config.get>>['data']>

// Unauthenticated panel settings (sign-in methods, credits). Fetched once and shared.
export const publicConfig = ref<PublicConfig | null>(null)

let pending: Promise<PublicConfig | null> | null = null

export function loadPublicConfig() {
  pending ??= api.v1.config.get().then(({ data }) => {
    publicConfig.value = data ?? null
    // Let a failed load be retried later (e.g. after the API comes back).
    if (!data) pending = null
    return publicConfig.value
  })
  return pending
}

// After an admin changes settings: fetch again, keeping the old value until the new one arrives.
export function reloadPublicConfig() {
  pending = null
  return loadPublicConfig()
}
