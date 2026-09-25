<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { currentUser } from '../lib/current-user'
import BrandMark from './BrandMark.vue'
import ThemeToggle from './ThemeToggle.vue'
import UserAvatar from './UserAvatar.vue'

interface NavItem {
  to: RouteLocationRaw
  label: string
  // Full Iconify class, written literally so Tailwind can find it.
  icon: string
  adminOnly?: boolean
  // Count shown next to the label (a dot when collapsed). Hidden when 0.
  badge?: () => number
}

interface NavSection {
  // Heading; sections without one render first, with no heading.
  label?: string
  items: NavItem[]
}

// Add pages here as they ship. `adminOnly` items are hidden from regular users; empty sections are hidden.
const sections: NavSection[] = [
  {
    items: [
      { to: { name: 'dashboard' }, label: 'Dashboard', icon: 'icon-[lucide--layout-dashboard]' },
      { to: { name: 'scans' }, label: 'Scans', icon: 'icon-[lucide--radar]' },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        to: { name: 'admin-users' },
        label: 'Users',
        icon: 'icon-[lucide--users]',
        adminOnly: true,
        badge: () => currentUser.value?.pendingUsers ?? 0,
      },
    ],
  },
]

const props = defineProps<{
  // `desktop` sits in the page and can collapse; `drawer` is the mobile overlay and is always expanded.
  variant: 'desktop' | 'drawer'
  collapsed?: boolean
}>()

const emit = defineEmits<{
  toggleCollapsed: []
  close: []
  navigate: []
  signOut: []
}>()

const isCollapsed = computed(() => props.variant === 'desktop' && props.collapsed)
const visibleSections = computed(() =>
  sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.adminOnly || currentUser.value?.role === 'admin'),
    }))
    .filter((section) => section.items.length > 0),
)
</script>

<template>
  <div class="flex h-full flex-col">
    <div
      class="flex gap-2 px-3 py-4"
      :class="isCollapsed ? 'flex-col items-center' : 'items-center justify-between'"
    >
      <RouterLink
        :to="{ name: 'dashboard' }"
        class="rounded-md px-1 py-1"
        :title="isCollapsed ? 'Strix Panel' : undefined"
        @click="emit('navigate')"
      >
        <BrandMark :icon-only="isCollapsed" />
      </RouterLink>
      <button
        v-if="variant === 'desktop'"
        type="button"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        :aria-expanded="!collapsed"
        class="grid size-8 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
        @click="emit('toggleCollapsed')"
      >
        <span
          :class="collapsed ? 'icon-[lucide--panel-left-open]' : 'icon-[lucide--panel-left-close]'"
          class="size-4"
          aria-hidden="true"
        />
      </button>
      <button
        v-else
        type="button"
        aria-label="Close menu"
        class="grid size-8 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
        @click="emit('close')"
      >
        <span class="icon-[lucide--x] size-4" aria-hidden="true" />
      </button>
    </div>

    <nav aria-label="Main" class="flex-1 overflow-y-auto px-3">
      <div v-for="section in visibleSections" :key="section.label ?? 'main'">
        <template v-if="section.label">
          <hr v-if="isCollapsed" class="my-3 border-line" />
          <p v-else class="px-3 pt-5 pb-1.5 text-xs font-medium text-fg-muted uppercase">
            {{ section.label }}
          </p>
        </template>
        <ul class="space-y-1" :aria-label="section.label">
          <li v-for="item in section.items" :key="item.label">
            <RouterLink v-slot="{ href, navigate, isActive }" :to="item.to" custom>
              <a
                :href="href"
                :aria-current="isActive ? 'page' : undefined"
                :title="isCollapsed ? item.label : undefined"
                class="relative flex h-9 items-center gap-3 rounded-md text-sm font-medium transition-colors"
                :class="[
                  isCollapsed ? 'justify-center' : 'px-3',
                  isActive
                    ? 'bg-surface-sunken text-fg'
                    : 'text-fg-muted hover:bg-surface-sunken hover:text-fg',
                ]"
                @click="
                  (event) => {
                    navigate(event)
                    emit('navigate')
                  }
                "
              >
                <span
                  :class="[item.icon, isActive ? 'text-accent' : '']"
                  class="size-4 shrink-0"
                  aria-hidden="true"
                />
                <span :class="{ 'sr-only': isCollapsed }">{{ item.label }}</span>
                <template v-if="(item.badge?.() ?? 0) > 0">
                  <span
                    v-if="isCollapsed"
                    data-testid="nav-badge-dot"
                    class="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                  <span
                    v-else
                    data-testid="nav-badge"
                    class="ml-auto rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-fg tabular-nums"
                    aria-hidden="true"
                    >{{ item.badge?.() }}</span
                  >
                  <span class="sr-only">({{ item.badge?.() }} waiting for approval)</span>
                </template>
              </a>
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>

    <div class="space-y-3 border-t border-line p-3">
      <div :class="{ 'flex justify-center': isCollapsed }">
        <ThemeToggle :compact="isCollapsed" />
      </div>
      <div v-if="currentUser" class="flex items-center gap-3" :class="{ 'flex-col': isCollapsed }">
        <UserAvatar
          :name="currentUser.name"
          :image="currentUser.image"
          :title="isCollapsed ? `${currentUser.name} (${currentUser.email})` : undefined"
        />
        <div v-if="!isCollapsed" class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ currentUser.name }}</p>
          <p class="truncate text-xs text-fg-muted">
            {{ currentUser.role === 'admin' ? 'Admin' : 'Member' }}
          </p>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          title="Sign out"
          class="grid size-8 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
          @click="emit('signOut')"
        >
          <span class="icon-[lucide--log-out] size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
