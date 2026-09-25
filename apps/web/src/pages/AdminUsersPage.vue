<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import UserActionsMenu from '../components/UserActionsMenu.vue'
import UserAvatar from '../components/UserAvatar.vue'
import UserStatusBadge from '../components/UserStatusBadge.vue'
import AppButton from '../components/ui/AppButton.vue'
import AppDialog from '../components/ui/AppDialog.vue'
import { api } from '../lib/api'
import { currentUser, loadCurrentUser } from '../lib/current-user'
import { useToast } from '../composables/useToast'
import { formatDay, formatUsd } from '../lib/scans'
import {
  ACTION_DONE,
  actionFailed,
  CONFIRMATIONS,
  filterUsers,
  runUserAction,
  TAB_LABELS,
  USER_TABS,
  type AdminUser,
  type UserAction,
  type UserTab,
} from '../lib/users'

const users = ref<AdminUser[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const { toast } = useToast()
const tab = ref<UserTab>('all')
const search = ref('')
const busyId = ref<string | null>(null)
const confirming = ref<{ user: AdminUser; action: UserAction } | null>(null)

const visible = computed(() => filterUsers(users.value, tab.value, search.value))
const counts = computed(() =>
  Object.fromEntries(USER_TABS.map((t) => [t, filterUsers(users.value, t, '').length])),
)
const confirmation = computed(() =>
  confirming.value ? CONFIRMATIONS[confirming.value.action] : undefined,
)
const dialogOpen = computed({
  get: () => confirming.value !== null,
  set: (open) => {
    if (!open) confirming.value = null
  },
})

async function load() {
  const { data, error } = await api.v1.admin.users.get()
  loading.value = false
  if (error || !data) {
    loadError.value = 'Could not load users.'
    return
  }
  users.value = data
}

function select(user: AdminUser, action: UserAction) {
  if (CONFIRMATIONS[action]) confirming.value = { user, action }
  else void run(user, action)
}

async function run(user: AdminUser, action: UserAction) {
  confirming.value = null
  busyId.value = user.id
  const result = await runUserAction(user.id, action)
  busyId.value = null
  if (result.error) {
    toast(actionFailed(action, user.name, result.error), 'error')
    return
  }
  users.value = users.value.map((u) => (u.id === user.id ? result.data! : u))
  toast(ACTION_DONE[action](user.name))
  // Refreshes the sidebar's pending badge.
  await loadCurrentUser()
}

const emptyText = computed(() => {
  if (search.value.trim()) return 'No users match your search.'
  return tab.value === 'all' ? 'No users yet.' : `No ${tab.value} users.`
})

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Users</h1>
        <p class="mt-1 text-sm text-fg-muted">Everyone who has signed in to this panel.</p>
      </div>
      <label class="relative block w-full sm:w-64">
        <span class="sr-only">Search users</span>
        <span
          class="absolute top-1/2 left-3 icon-[lucide--search] size-4 -translate-y-1/2 text-fg-muted"
          aria-hidden="true"
        />
        <input
          v-model="search"
          type="search"
          placeholder="Search name or email"
          class="h-10 w-full rounded-md border border-line bg-surface-raised pr-3 pl-9 text-sm placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
      </label>
    </div>

    <div
      role="tablist"
      aria-label="Filter by status"
      class="mt-6 flex flex-wrap gap-1 border-b border-line"
    >
      <button
        v-for="t in USER_TABS"
        :key="t"
        type="button"
        role="tab"
        :data-testid="`tab-${t}`"
        :aria-selected="tab === t"
        class="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors"
        :class="
          tab === t ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
        "
        @click="tab = t"
      >
        {{ TAB_LABELS[t] }}
        <span class="ml-1 text-xs text-fg-muted tabular-nums">{{ counts[t] }}</span>
      </button>
    </div>

    <p v-if="loadError" role="alert" class="mt-6 text-sm text-danger">{{ loadError }}</p>

    <p
      v-if="!loading && !loadError && visible.length === 0"
      class="mt-6 rounded-lg border border-dashed border-line px-6 py-12 text-center text-sm text-fg-muted"
    >
      {{ emptyText }}
    </p>

    <div
      v-else-if="!loading && !loadError"
      class="mt-6 overflow-x-auto rounded-lg border border-line bg-surface-raised"
    >
      <table class="w-full text-sm">
        <thead class="border-b border-line text-left text-xs text-fg-muted uppercase">
          <tr>
            <th class="px-4 py-3 font-medium">User</th>
            <th class="px-4 py-3 font-medium">Role</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 text-right font-medium">Runs</th>
            <th class="px-4 py-3 text-right font-medium">This month</th>
            <th class="px-4 py-3 text-right font-medium">Total cost</th>
            <th class="px-4 py-3 font-medium">Last run</th>
            <th class="px-4 py-3"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in visible"
            :key="user.id"
            data-testid="user-row"
            class="border-b border-line last:border-0"
          >
            <td class="px-4 py-3">
              <div class="flex items-center gap-3">
                <UserAvatar :name="user.name" :image="user.image" />
                <div class="min-w-0">
                  <p class="flex items-center gap-2 font-medium">
                    <span data-testid="user-name" class="max-w-[14rem] truncate">{{
                      user.name
                    }}</span>
                    <span
                      v-if="user.id === currentUser?.id"
                      class="rounded bg-surface-sunken px-1.5 text-xs text-fg-muted"
                      >You</span
                    >
                  </p>
                  <p class="max-w-[16rem] truncate text-xs text-fg-muted">{{ user.email }}</p>
                </div>
              </div>
            </td>
            <td class="px-4 py-3">{{ user.role === 'admin' ? 'Admin' : 'Member' }}</td>
            <td class="px-4 py-3"><UserStatusBadge :status="user.status" /></td>
            <td class="px-4 py-3 text-right tabular-nums">{{ user.runs }}</td>
            <td class="px-4 py-3 text-right tabular-nums">
              {{ formatUsd(user.costThisMonthUsd) }}
            </td>
            <td class="px-4 py-3 text-right tabular-nums">{{ formatUsd(user.costUsd) }}</td>
            <td data-testid="last-run" class="px-4 py-3 whitespace-nowrap text-fg-muted">
              {{ user.lastRunAt ? formatDay(user.lastRunAt) : '—' }}
            </td>
            <td class="px-4 py-3 text-right">
              <UserActionsMenu
                v-if="user.id !== currentUser?.id"
                :user="user"
                :busy="busyId === user.id"
                @select="(action) => select(user, action)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppDialog
      v-if="confirming && confirmation"
      v-model:open="dialogOpen"
      :title="confirmation.title(confirming.user.name)"
      :description="confirmation.description"
    >
      <div class="flex justify-end gap-2">
        <AppButton variant="secondary" @click="confirming = null">Cancel</AppButton>
        <AppButton @click="run(confirming.user, confirming.action)">
          {{ confirmation.button }}
        </AppButton>
      </div>
    </AppDialog>
  </div>
</template>
