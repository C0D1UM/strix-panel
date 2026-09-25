<script setup lang="ts">
import { checkScanResume, FINDING_SEVERITIES, type ScanEventType } from '@strix-panel/shared'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ScanAgentTree from '../components/ScanAgentTree.vue'
import ScanStatusBadge from '../components/ScanStatusBadge.vue'
import SeverityBadge from '../components/SeverityBadge.vue'
import AppButton from '../components/ui/AppButton.vue'
import { useScanStream } from '../composables/useScanStream'
import { api } from '../lib/api'
import { renderMarkdown } from '../lib/markdown'
import {
  formatDuration,
  formatTime,
  formatTokens,
  formatUsd,
  scanTitle,
  type ScanFinding,
} from '../lib/scans'

const props = defineProps<{ id: string }>()

const { scan, events, findingsVersion, connected, error, reconnect } = useScanStream(props.id)

const findings = ref<ScanFinding[]>([])
const stopping = ref(false)
const resuming = ref(false)
const actionError = ref<string | null>(null)
const feed = ref<HTMLElement | null>(null)
const now = ref(new Date())
let clock: ReturnType<typeof setInterval> | undefined

const canStop = computed(() => scan.value?.status === 'queued' || scan.value?.status === 'running')
// Same rule as the API.
const canResume = computed(
  () => !!scan.value && checkScanResume({ ...scan.value, agentCount: scan.value.agents.length }).ok,
)
const totalFindings = computed(() =>
  scan.value ? Object.values(scan.value.findings).reduce((a, b) => a + b, 0) : 0,
)
const budgetUsed = computed(() =>
  scan.value?.maxBudgetUsd
    ? Math.min(100, (scan.value.costUsd / scan.value.maxBudgetUsd) * 100)
    : null,
)

async function loadFindings() {
  const { data } = await api.v1.scans({ id: props.id }).findings.get()
  if (data) findings.value = data
}

const errorMessage = (err: { value: unknown }, fallback: string) =>
  (err.value as { error?: { message?: string } } | undefined)?.error?.message ?? fallback

async function stop() {
  stopping.value = true
  actionError.value = null
  const { error: err } = await api.v1.scans({ id: props.id }).stop.post()
  stopping.value = false
  if (err) actionError.value = errorMessage(err, 'Could not stop the scan.')
}

async function resume() {
  resuming.value = true
  actionError.value = null
  const { error: err } = await api.v1.scans({ id: props.id }).resume.post()
  // The stream closed when the scan finished; keep loading until the new one sends its snapshot.
  if (err) actionError.value = errorMessage(err, 'Could not resume the scan.')
  else await reconnect()
  resuming.value = false
}

// Auto-scroll the feed only when the reader is already at the bottom.
watch(
  () => events.value.length,
  async () => {
    const el = feed.value
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    await nextTick()
    if (atBottom) el.scrollTop = el.scrollHeight
  },
)
watch(findingsVersion, loadFindings)
// The first snapshot may already have findings from before this page opened.
watch(
  () => scan.value?.id,
  (id) => {
    if (id && totalFindings.value > 0) void loadFindings()
  },
)

onMounted(() => {
  clock = setInterval(() => (now.value = new Date()), 1000)
})
onBeforeUnmount(() => clearInterval(clock))

const eventIcon: Record<ScanEventType, string> = {
  status: 'icon-[lucide--info]',
  agent_started: 'icon-[lucide--bot]',
  agent_finished: 'icon-[lucide--check]',
  agent_failed: 'icon-[lucide--triangle-alert]',
  finding: 'icon-[lucide--bug]',
}
const eventTone: Record<ScanEventType, string> = {
  status: 'text-fg-muted',
  agent_started: 'text-accent',
  agent_finished: 'text-success',
  agent_failed: 'text-danger',
  finding: 'text-warning',
}

// Long-form finding fields, in reading order. Rendered as markdown.
const sections: [string, string][] = [
  ['Description', 'description'],
  ['Impact', 'impact'],
  ['Evidence', 'evidence'],
  ['Technical analysis', 'technical_analysis'],
  ['Proof of concept', 'poc_description'],
  ['Remediation', 'remediation_steps'],
]
const text = (report: Record<string, unknown>, key: string): string | null => {
  const value = report[key]
  return typeof value === 'string' && value.trim() ? value : null
}
const codeLocations = (report: Record<string, unknown>): string[] => {
  const value = report.code_locations
  if (!Array.isArray(value)) return []
  return value.map((loc) => {
    if (typeof loc === 'string') return loc
    if (loc && typeof loc === 'object') {
      const { file, path, line, start_line } = loc as Record<string, unknown>
      const where = file ?? path
      const at = line ?? start_line
      if (typeof where === 'string') return at ? `${where}:${at}` : where
    }
    return JSON.stringify(loc)
  })
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-10 sm:px-8">
    <p v-if="error && !scan" role="alert" class="text-sm text-danger">{{ error }}</p>

    <template v-else-if="scan">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <RouterLink
            :to="{ name: 'scans' }"
            class="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
          >
            <span class="icon-[lucide--arrow-left] size-4" aria-hidden="true" />
            Scans
          </RouterLink>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <h1 class="text-2xl font-semibold tracking-tight">{{ scanTitle(scan) }}</h1>
            <ScanStatusBadge :status="scan.status" />
          </div>
          <ul class="mt-2 space-y-0.5 text-sm text-fg-muted">
            <li v-for="target in scan.targets" :key="target" class="truncate font-mono">
              {{ target }}
            </li>
          </ul>
          <p class="mt-2 text-xs text-fg-muted">
            <span class="capitalize">{{ scan.scanMode }}</span> scan · by {{ scan.owner.name }}
            <template v-if="scan.runName"> · run {{ scan.runName }}</template>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <a
            v-if="scan.hasReport"
            :href="`/api/v1/scans/${scan.id}/report.md`"
            download
            class="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface-raised px-4 text-sm font-semibold hover:bg-surface-sunken"
          >
            <span class="icon-[lucide--download] size-4" aria-hidden="true" />
            Download report
          </a>
          <AppButton v-if="canStop" variant="secondary" :loading="stopping" @click="stop">
            <span class="icon-[lucide--square] size-4" aria-hidden="true" />
            Stop scan
          </AppButton>
          <AppButton v-if="canResume" :loading="resuming" @click="resume">
            <span class="icon-[lucide--play] size-4" aria-hidden="true" />
            Resume scan
          </AppButton>
        </div>
      </header>

      <p v-if="actionError" role="alert" class="mt-3 text-sm text-danger">{{ actionError }}</p>
      <p
        v-if="scan.error"
        role="alert"
        class="mt-4 rounded-md bg-danger-surface px-3 py-2.5 text-sm break-words text-danger"
      >
        {{ scan.error }}
      </p>
      <p v-if="error" class="mt-3 text-sm text-warning">{{ error }}</p>

      <dl class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-line bg-surface-raised p-4">
          <dt class="text-xs text-fg-muted uppercase">Elapsed</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">
            {{ formatDuration(scan.startedAt, scan.finishedAt ?? now) }}
          </dd>
          <p class="mt-1 text-xs text-fg-muted">
            {{ scan.requests }} LLM requests
            <span v-if="connected" class="ml-1 text-success">· live</span>
          </p>
        </div>
        <div class="rounded-lg border border-line bg-surface-raised p-4">
          <dt class="text-xs text-fg-muted uppercase">Cost</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">
            {{ formatUsd(scan.costUsd) }}
            <span v-if="scan.maxBudgetUsd" class="text-sm font-normal text-fg-muted">
              / {{ formatUsd(scan.maxBudgetUsd) }}
            </span>
          </dd>
          <div
            v-if="budgetUsed !== null"
            class="mt-2 h-1 overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            :aria-valuenow="Math.round(budgetUsed)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="h-full rounded-full"
              :class="budgetUsed >= 90 ? 'bg-danger' : 'bg-accent'"
              :style="{ width: `${budgetUsed}%` }"
            />
          </div>
          <p v-else class="mt-1 text-xs text-fg-muted">No budget limit</p>
        </div>
        <div class="rounded-lg border border-line bg-surface-raised p-4">
          <dt class="text-xs text-fg-muted uppercase">Tokens</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">
            {{ formatTokens(scan.inputTokens + scan.outputTokens) }}
          </dd>
          <p class="mt-1 text-xs text-fg-muted tabular-nums">
            {{ formatTokens(scan.inputTokens) }} in · {{ formatTokens(scan.outputTokens) }} out ·
            {{ formatTokens(scan.cachedTokens) }} cached
          </p>
        </div>
        <div class="rounded-lg border border-line bg-surface-raised p-4">
          <dt class="text-xs text-fg-muted uppercase">Findings</dt>
          <dd class="mt-1 text-xl font-semibold tabular-nums">{{ totalFindings }}</dd>
          <div class="mt-1 flex flex-wrap gap-1">
            <template v-for="severity in FINDING_SEVERITIES" :key="severity">
              <SeverityBadge
                v-if="scan.findings[severity] > 0"
                :severity="severity"
                :count="scan.findings[severity]"
                compact
              />
            </template>
          </div>
        </div>
      </dl>

      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section
          class="rounded-lg border border-line bg-surface-raised p-4"
          aria-labelledby="agents"
        >
          <h2 id="agents" class="font-semibold">Agents</h2>
          <p v-if="scan.agents.length === 0" class="mt-2 text-sm text-fg-muted">
            {{ scan.status === 'queued' ? 'Waiting for a worker.' : 'No agents yet.' }}
          </p>
          <ScanAgentTree v-else class="mt-3" :agents="scan.agents" />
        </section>

        <section class="rounded-lg border border-line bg-surface-raised" aria-labelledby="feed">
          <h2 id="feed" class="border-b border-line px-4 py-3 font-semibold">Activity</h2>
          <ol ref="feed" class="max-h-[28rem] overflow-y-auto p-4 font-mono text-xs">
            <li v-if="events.length === 0" class="text-fg-muted">Nothing yet.</li>
            <li v-for="event in events" :key="event.id" class="flex gap-3 py-1">
              <time :datetime="event.createdAt" class="shrink-0 text-fg-muted tabular-nums">
                {{ formatTime(event.createdAt) }}
              </time>
              <span
                :class="[eventIcon[event.type], eventTone[event.type]]"
                class="mt-0.5 size-3.5 shrink-0"
                aria-hidden="true"
              />
              <span class="break-words">{{ event.message }}</span>
            </li>
          </ol>
        </section>
      </div>

      <section class="mt-6" aria-labelledby="findings">
        <h2 id="findings" class="font-semibold">Findings</h2>
        <p v-if="findings.length === 0" class="mt-2 text-sm text-fg-muted">No findings yet.</p>
        <ul v-else class="mt-3 space-y-2">
          <li
            v-for="finding in findings"
            :key="finding.id"
            class="rounded-lg border border-line bg-surface-raised"
          >
            <details>
              <summary class="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
                <SeverityBadge :severity="finding.severity" />
                <span class="font-medium">{{ finding.title }}</span>
                <span class="ml-auto flex flex-wrap gap-x-3 text-xs text-fg-muted">
                  <span v-if="finding.endpoint" class="font-mono">
                    {{ finding.method ?? '' }} {{ finding.endpoint }}
                  </span>
                  <span v-else-if="finding.target" class="font-mono">{{ finding.target }}</span>
                  <span v-if="finding.cvss !== null">CVSS {{ finding.cvss }}</span>
                  <span v-if="finding.cwe">{{ finding.cwe }}</span>
                  <span v-if="finding.cve">{{ finding.cve }}</span>
                  <span v-if="finding.confidence" class="capitalize">
                    {{ finding.confidence }} confidence
                  </span>
                </span>
              </summary>
              <div class="space-y-4 border-t border-line px-4 py-4">
                <template v-for="[label, key] in sections" :key="key">
                  <div v-if="text(finding.report, key)">
                    <h3 class="text-xs font-semibold text-fg-muted uppercase">{{ label }}</h3>
                    <!-- eslint-disable vue/no-v-html -- renderMarkdown disables raw HTML -->
                    <div
                      class="markdown mt-1"
                      v-html="renderMarkdown(text(finding.report, key)!)"
                    />
                    <!-- eslint-enable vue/no-v-html -->
                  </div>
                </template>
                <div v-if="text(finding.report, 'poc_script_code')">
                  <h3 class="text-xs font-semibold text-fg-muted uppercase">PoC script</h3>
                  <pre
                    class="mt-1 overflow-x-auto rounded-md bg-surface-sunken p-3 font-mono text-xs"
                  ><code>{{ text(finding.report, 'poc_script_code') }}</code></pre>
                </div>
                <div v-if="codeLocations(finding.report).length > 0">
                  <h3 class="text-xs font-semibold text-fg-muted uppercase">Code locations</h3>
                  <ul class="mt-1 list-disc pl-5 font-mono text-xs">
                    <li v-for="loc in codeLocations(finding.report)" :key="loc">{{ loc }}</li>
                  </ul>
                </div>
              </div>
            </details>
          </li>
        </ul>
      </section>
    </template>

    <p v-else class="text-sm text-fg-muted">Loading…</p>
  </div>
</template>
