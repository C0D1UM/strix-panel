<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed } from 'vue'
import { ACTION_LABELS, availableActions, type AdminUser, type UserAction } from '../lib/users'

// `self`: the signed-in admin's own row, where only the budget can be changed.
const props = defineProps<{ user: AdminUser; busy?: boolean; self?: boolean }>()
const emit = defineEmits<{ select: [action: UserAction]; budget: [] }>()

const actions = computed(() => (props.self ? [] : availableActions(props.user)))
const danger = new Set<UserAction>(['disable', 'remove'])

const itemClass =
  'flex cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-surface-sunken'
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger
      data-testid="user-menu"
      :disabled="busy"
      :aria-label="`Actions for ${user.name}`"
      class="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-sunken hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        :class="busy ? 'icon-[lucide--loader-circle] animate-spin' : 'icon-[lucide--ellipsis]'"
        class="size-4"
        aria-hidden="true"
      />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="4"
        class="z-50 min-w-40 rounded-md border border-line bg-surface-raised p-1 shadow-lg"
      >
        <DropdownMenuItem
          v-for="action in actions"
          :key="action"
          :class="[itemClass, danger.has(action) ? 'text-danger' : '']"
          @select="emit('select', action)"
        >
          {{ ACTION_LABELS[action] }}
        </DropdownMenuItem>
        <DropdownMenuSeparator v-if="actions.length > 0" class="my-1 h-px bg-line" />
        <DropdownMenuItem data-testid="set-budget" :class="itemClass" @select="emit('budget')">
          Set budget
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
