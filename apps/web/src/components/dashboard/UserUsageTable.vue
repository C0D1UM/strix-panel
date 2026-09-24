<script setup lang="ts">
import type { Dashboard } from '../../lib/dashboard'
import { formatTokens, formatUsd } from '../../lib/scans'

defineProps<{ rows: NonNullable<Dashboard['admin']>['perUser'] }>()
</script>

<template>
  <section class="rounded-lg border border-line bg-surface-raised">
    <h2 class="px-4 pt-4 text-sm font-semibold">Usage by user</h2>
    <p v-if="rows.length === 0" class="px-4 py-6 text-sm text-fg-muted">
      No one ran a scan in this range.
    </p>
    <div v-else class="mt-2 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-xs text-fg-muted">
          <tr class="border-b border-line">
            <th class="px-4 py-2 font-medium">User</th>
            <th class="px-4 py-2 text-right font-medium">Scans</th>
            <th class="px-4 py-2 text-right font-medium">Tokens</th>
            <th class="px-4 py-2 text-right font-medium">Cost</th>
            <th class="px-4 py-2 text-right font-medium">Findings</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.userId"
            data-testid="user-usage-row"
            class="border-b border-line last:border-0"
          >
            <td class="px-4 py-2">
              <div class="font-medium">{{ row.name }}</div>
              <div class="text-xs text-fg-muted">{{ row.email }}</div>
            </td>
            <td class="px-4 py-2 text-right tabular-nums">{{ row.runs }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ formatTokens(row.tokens) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ formatUsd(row.costUsd) }}</td>
            <td class="px-4 py-2 text-right tabular-nums">{{ row.findings }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
