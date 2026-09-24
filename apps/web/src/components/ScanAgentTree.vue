<script setup lang="ts">
import { computed } from 'vue'

interface Agent {
  id: string
  name: string
  parentId: string | null
  status: string
  error: string | null
}

const props = withDefaults(defineProps<{ agents: Agent[]; parentId?: string | null }>(), {
  parentId: null,
})

const children = computed(() =>
  props.agents.filter(
    (agent) =>
      agent.parentId === props.parentId ||
      // A child whose parent is unknown is shown at the top level rather than lost.
      (props.parentId === null &&
        agent.parentId !== null &&
        !props.agents.some((other) => other.id === agent.parentId)),
  ),
)

// Strix agent statuses: running, waiting, budget_paused, completed, stopped, failed, crashed.
const dot: Record<string, string> = {
  running: 'bg-accent',
  waiting: 'bg-warning',
  budget_paused: 'bg-warning',
  completed: 'bg-success',
  stopped: 'bg-fg-muted',
  failed: 'bg-danger',
  crashed: 'bg-danger',
}
const label = (status: string) => status.replaceAll('_', ' ')
</script>

<template>
  <ul class="space-y-1" :class="{ 'ml-4 border-l border-line pl-3': parentId !== null }">
    <li v-for="agent in children" :key="agent.id">
      <div class="flex items-start gap-2 py-1 text-sm">
        <span
          class="mt-1.5 size-2 shrink-0 rounded-full"
          :class="[
            dot[agent.status] ?? 'bg-fg-muted',
            agent.status === 'running' && 'animate-pulse',
          ]"
          aria-hidden="true"
        />
        <div class="min-w-0">
          <span class="font-medium">{{ agent.name }}</span>
          <span class="ml-2 text-xs text-fg-muted capitalize">{{ label(agent.status) }}</span>
          <p v-if="agent.error" class="mt-0.5 text-xs break-words text-danger">{{ agent.error }}</p>
        </div>
      </div>
      <ScanAgentTree :agents="agents" :parent-id="agent.id" />
    </li>
  </ul>
</template>
