import { isFinishedScanStatus } from '@strix-panel/shared'
import { getCurrentScope, onScopeDispose, ref } from 'vue'
import type { Scan, ScanEvent } from '../lib/scans'

export interface ScanStreamOptions {
  // Injectable for tests. Native EventSource reconnects on its own and resends Last-Event-ID.
  eventSource?: typeof EventSource
}

// Live view of one scan over SSE: a snapshot first, then `scan`, `event` and `findings` messages.
// This is the one place the web app talks to the API without Eden: Eden has no SSE client.
export function useScanStream(scanId: string, options: ScanStreamOptions = {}) {
  const scan = ref<Scan | null>(null)
  const events = ref<ScanEvent[]>([])
  // Bumped whenever findings changed; the page refetches GET /findings.
  const findingsVersion = ref(0)
  const connected = ref(false)
  const error = ref<string | null>(null)

  const ES = options.eventSource ?? EventSource
  const source = new ES(`/api/v1/scans/${scanId}/stream`)
  const seen = new Set<string>()

  const close = () => {
    source.close()
    connected.value = false
  }

  const append = (incoming: ScanEvent[]) => {
    for (const event of incoming) {
      if (seen.has(event.id)) continue
      seen.add(event.id)
      events.value.push(event)
    }
  }

  const applyScan = (next: Scan) => {
    scan.value = next
    if (isFinishedScanStatus(next.status)) close()
  }

  source.addEventListener('open', () => {
    connected.value = true
    error.value = null
  })
  source.addEventListener('snapshot', (message) => {
    const data = JSON.parse((message as MessageEvent<string>).data) as {
      scan: Scan
      events: ScanEvent[]
    }
    append(data.events)
    applyScan(data.scan)
  })
  source.addEventListener('scan', (message) => {
    applyScan(JSON.parse((message as MessageEvent<string>).data) as Scan)
  })
  source.addEventListener('event', (message) => {
    append([JSON.parse((message as MessageEvent<string>).data) as ScanEvent])
  })
  source.addEventListener('findings', () => {
    findingsVersion.value += 1
  })
  source.addEventListener('error', () => {
    connected.value = false
    // CLOSED means the browser gave up (e.g. a 404); CONNECTING means it is retrying by itself.
    if (
      source.readyState === ES.CLOSED &&
      !(scan.value && isFinishedScanStatus(scan.value.status))
    ) {
      error.value = scan.value
        ? 'Live updates disconnected. Reload to reconnect.'
        : 'Scan not found'
    }
  })

  if (getCurrentScope()) onScopeDispose(close)

  return { scan, events, findingsVersion, connected, error, close }
}
