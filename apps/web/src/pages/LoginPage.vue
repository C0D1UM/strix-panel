<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandMark from '../components/BrandMark.vue'
import RadarSweep from '../components/RadarSweep.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import AppButton from '../components/ui/AppButton.vue'
import { api } from '../lib/api'
import { authClient } from '../lib/auth-client'
import { loadSession } from '../lib/session'

type Provider = 'google' | 'email'

const route = useRoute()
const router = useRouter()

const providers = ref<Provider[]>([])
const registrationEnabled = ref(false)
const configError = ref(false)
const mode = ref<'sign-in' | 'sign-up'>('sign-in')
const name = ref('')
const email = ref('')
const password = ref('')
const pending = ref<Provider | null>(null)
const error = ref<string | null>(null)

const redirectTo = computed(() =>
  typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
    ? route.query.redirect
    : '/dashboard',
)

// Better Auth redirects back here with ?error=<code> when OAuth sign-in fails.
const oauthErrors: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  signup_disabled: 'New accounts are disabled on this panel. Ask an admin for access.',
  BANNED_USER: 'Your account is disabled. Contact an admin.',
  ACCOUNT_REMOVED: 'Your account has been removed. Contact an admin.',
}
if (typeof route.query.error === 'string') {
  error.value =
    oauthErrors[route.query.error] ??
    'Sign-in failed. Your email domain may not be allowed on this panel — ask an admin.'
}

onMounted(async () => {
  const { data } = await api.v1.config.get()
  if (data) {
    providers.value = data.auth.providers
    registrationEnabled.value = data.auth.registrationEnabled
  } else configError.value = true
})

async function signInWithGoogle() {
  pending.value = 'google'
  error.value = null
  const { error: err } = await authClient.signIn.social({
    provider: 'google',
    callbackURL: redirectTo.value,
    errorCallbackURL: '/login',
  })
  if (err) {
    error.value = err.message ?? 'Could not start Google sign-in.'
    pending.value = null
  }
}

async function submitEmail() {
  pending.value = 'email'
  error.value = null
  const { error: err } =
    mode.value === 'sign-in'
      ? await authClient.signIn.email({ email: email.value, password: password.value })
      : await authClient.signUp.email({
          name: name.value,
          email: email.value,
          password: password.value,
        })
  pending.value = null
  if (err) {
    error.value = err.message ?? 'Sign-in failed.'
    return
  }
  await loadSession(true)
  await router.replace(redirectTo.value)
}
</script>

<template>
  <div class="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,34rem)]">
    <aside
      class="relative hidden overflow-hidden border-r border-line bg-surface-sunken lg:flex lg:flex-col lg:justify-between lg:p-12"
    >
      <BrandMark />
      <div class="flex justify-center">
        <RadarSweep />
      </div>
      <p class="max-w-md text-sm text-fg-muted">
        Run Strix security scans from one place, follow their progress, and review findings with
        your team.
      </p>
    </aside>

    <main class="flex flex-col px-6 py-8 sm:px-12">
      <div class="flex items-center justify-between">
        <BrandMark class="lg:invisible" />
        <ThemeToggle />
      </div>

      <div class="my-auto w-full max-w-sm py-12">
        <h1 class="text-3xl font-semibold tracking-tight">
          {{ mode === 'sign-in' ? 'Sign in' : 'Create an account' }}
        </h1>
        <p class="mt-2 text-sm text-fg-muted">Use your work account to continue.</p>

        <div
          v-if="error"
          role="alert"
          class="mt-6 flex gap-2 rounded-md bg-danger-surface px-3 py-2.5 text-sm text-danger"
        >
          <span class="icon-[lucide--circle-alert] mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {{ error }}
        </div>

        <p v-if="configError" role="alert" class="mt-6 text-sm text-danger">
          Could not reach the panel API. Check that the API is running, then reload.
        </p>

        <div class="mt-8 space-y-6">
          <AppButton
            v-if="providers.includes('google')"
            variant="secondary"
            class="w-full"
            :loading="pending === 'google'"
            :disabled="pending !== null"
            @click="signInWithGoogle"
          >
            <span
              v-if="pending !== 'google'"
              class="icon-[logos--google-icon] size-4"
              aria-hidden="true"
            />
            Continue with Google
          </AppButton>

          <div
            v-if="providers.includes('google') && providers.includes('email')"
            class="flex items-center gap-3 text-xs text-fg-muted"
          >
            <span class="h-px flex-1 bg-line" />
            or
            <span class="h-px flex-1 bg-line" />
          </div>

          <form v-if="providers.includes('email')" class="space-y-4" @submit.prevent="submitEmail">
            <label v-if="mode === 'sign-up'" class="block text-sm font-medium">
              Name
              <input
                v-model="name"
                required
                autocomplete="name"
                class="mt-1.5 block h-10 w-full rounded-md border border-line bg-surface-raised px-3 text-sm focus:border-accent focus:outline-none"
              />
            </label>
            <label class="block text-sm font-medium">
              Email
              <input
                v-model="email"
                type="email"
                required
                autocomplete="email"
                class="mt-1.5 block h-10 w-full rounded-md border border-line bg-surface-raised px-3 text-sm focus:border-accent focus:outline-none"
              />
            </label>
            <label class="block text-sm font-medium">
              Password
              <input
                v-model="password"
                type="password"
                required
                minlength="8"
                :autocomplete="mode === 'sign-in' ? 'current-password' : 'new-password'"
                class="mt-1.5 block h-10 w-full rounded-md border border-line bg-surface-raised px-3 text-sm focus:border-accent focus:outline-none"
              />
            </label>
            <AppButton
              type="submit"
              class="w-full"
              :loading="pending === 'email'"
              :disabled="pending !== null"
            >
              {{ mode === 'sign-in' ? 'Sign in' : 'Create account' }}
            </AppButton>
            <p v-if="registrationEnabled" class="text-center text-sm text-fg-muted">
              {{ mode === 'sign-in' ? 'New here?' : 'Already have an account?' }}
              <button
                type="button"
                class="font-medium text-accent hover:underline"
                @click="mode = mode === 'sign-in' ? 'sign-up' : 'sign-in'"
              >
                {{ mode === 'sign-in' ? 'Create an account' : 'Sign in' }}
              </button>
            </p>
          </form>
        </div>
      </div>
    </main>
  </div>
</template>
