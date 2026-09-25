<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import BrandMark from '../components/BrandMark.vue'
import AppToaster from '../components/ui/AppToaster.vue'
import { useSidebar } from '../composables/useSidebar'
import { currentUser, loadCurrentUser } from '../lib/current-user'
import { signOut } from '../lib/session'

const route = useRoute()
const router = useRouter()
const { collapsed, mobileOpen, toggleCollapsed, openMobile, closeMobile } = useSidebar()

const menuButton = ref<HTMLButtonElement | null>(null)
const drawer = ref<HTMLElement | null>(null)
const desktop = window.matchMedia('(min-width: 64rem)')

async function handleSignOut() {
  await signOut()
  await router.replace({ name: 'login' })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && mobileOpen.value) closeMobile()
}

function onBreakpointChange() {
  if (desktop.matches) closeMobile()
}

watch(mobileOpen, async (open) => {
  await nextTick()
  if (open) drawer.value?.focus()
  else menuButton.value?.focus()
})
watch(() => route.fullPath, closeMobile)

onMounted(async () => {
  window.addEventListener('keydown', onKeydown)
  desktop.addEventListener('change', onBreakpointChange)
  // A missing profile here means the session expired between the route guard and now.
  if (!currentUser.value && !(await loadCurrentUser())) await router.replace({ name: 'login' })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  desktop.removeEventListener('change', onBreakpointChange)
  closeMobile()
})
</script>

<template>
  <div class="min-h-dvh lg:flex">
    <aside
      class="sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-surface-raised motion-safe:transition-[width] lg:block"
      :class="collapsed ? 'w-16' : 'w-60'"
    >
      <AppSidebar
        variant="desktop"
        :collapsed="collapsed"
        @toggle-collapsed="toggleCollapsed"
        @sign-out="handleSignOut"
      />
    </aside>

    <header
      class="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface-raised px-3 lg:hidden"
    >
      <button
        ref="menuButton"
        type="button"
        aria-label="Open menu"
        aria-controls="mobile-sidebar"
        :aria-expanded="mobileOpen"
        class="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-sunken hover:text-fg"
        @click="openMobile"
      >
        <span class="icon-[lucide--menu] size-5" aria-hidden="true" />
      </button>
      <BrandMark />
    </header>

    <Transition
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="motion-safe:transition-opacity"
      leave-active-class="motion-safe:transition-opacity"
    >
      <div
        v-if="mobileOpen"
        class="fixed inset-0 z-40 bg-black/40 lg:hidden"
        aria-hidden="true"
        @click="closeMobile"
      />
    </Transition>
    <Transition
      enter-from-class="-translate-x-full"
      leave-to-class="-translate-x-full"
      enter-active-class="motion-safe:transition-transform"
      leave-active-class="motion-safe:transition-transform"
    >
      <aside
        v-if="mobileOpen"
        id="mobile-sidebar"
        ref="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabindex="-1"
        class="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-line bg-surface-raised outline-none lg:hidden"
      >
        <AppSidebar
          variant="drawer"
          @close="closeMobile"
          @navigate="closeMobile"
          @sign-out="handleSignOut"
        />
      </aside>
    </Transition>

    <main class="min-w-0 flex-1">
      <RouterView />
    </main>

    <AppToaster />
  </div>
</template>
