import { isFinishedScanStatus } from '@strix-panel/shared'
import { getCurrentScope, onScopeDispose, ref } from 'vue'
import { api } from '../lib/api'
import type { Scan, ScanEvent } from '../lib/scans'

export interface ScanStreamOptions {
  // Injectable for tests. Native EventSource reconnects on its own and resends Last-Event-ID.
  eventSource?: typeof EventSource
  // Injectable for tests. Resolves to null when the scan can't be read; the stream then reports why.
  loadInitial?: (scanId: string) => Promise<{ scan: Scan; events: ScanEvent[] } | null>
}

async function fetchInitial(scanId: string) {
  const routes = api.v1.scans({ id: scanId })
  const [scan, events] = await Promise.all([routes.get(), routes.events.get()])
  return scan.data && events.data ? { scan: scan.data, events: events.data } : null
}

// Live view of one scan over SSE: a snapshot first, then `scan`, `event` and `findings` messages.
// This is the one place the web app talks to the API without Eden: Eden has no SSE client.
// A proxy in front (e.g. Cloudflare) can hold back the first SSE message for seconds, so each connection
// also fetches the scan with plain GETs; whichever arrives first wins, and the stream takes over from there.
export function useScanStream(scanId: string, options: ScanStreamOptions = {}) {
  const scan = ref<Scan | null>(null)
  const events = ref<ScanEvent[]>([])
  // Bumped whenever findings changed; the page refetches GET /findings.
  const findingsVersion = ref(0)
  const connected = ref(false)
  const error = ref<string | null>(null)

  const ES = options.eventSource ?? EventSource
  const seen = new Set<string>()
  let source: EventSource
  // Settles the promise returned by `reconnect` once the new connection answers.
  let onSettled: (() => void) | null = null

  const settle = () => {
    onSettled?.()
    onSettled = null
  }

  const close = () => {
    source.close()
    connected.value = false
    settle()
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

  const connect = () => {
    const current = new ES(`/api/v1/scans/${scanId}/stream`)
    source = current
    let snapshotReceived = false

    current.addEventListener('open', () => {
      connected.value = true
      error.value = null
    })
    current.addEventListener('snapshot', (message) => {
      const data = JSON.parse((message as MessageEvent<string>).data) as {
        scan: Scan
        events: ScanEvent[]
      }
      snapshotReceived = true
      append(data.events)
      applyScan(data.scan)
      settle()
    })
    current.addEventListener('scan', (message) => {
      applyScan(JSON.parse((message as MessageEvent<string>).data) as Scan)
    })
    current.addEventListener('event', (message) => {
      append([JSON.parse((message as MessageEvent<string>).data) as ScanEvent])
    })
    current.addEventListener('findings', () => {
      findingsVersion.value += 1
    })
    current.addEventListener('error', () => {
      connected.value = false
      // CLOSED means the browser gave up (e.g. a 404); CONNECTING means it is retrying by itself.
      if (current.readyState !== ES.CLOSED) return
      settle()
      if (!(scan.value && isFinishedScanStatus(scan.value.status))) {
        error.value = scan.value
          ? 'Live updates disconnected. Reload to reconnect.'
          : 'Scan not found'
      }
    })

    void (options.loadInitial ?? fetchInitial)(scanId)
      .then((initial) => {
        if (!initial || snapshotReceived || current !== source) return
        if (current.readyState === ES.CLOSED) return
        append(initial.events)
        applyScan(initial.scan)
        settle()
      })
      // The stream still delivers the snapshot.
      .catch(() => {})
  }

  // Opens a fresh connection, e.g. after a finished scan was resumed. Resolves on the new snapshot.
  const reconnect = () => {
    source.close()
    settle()
    connected.value = false
    error.value = null
    return new Promise<void>((resolve) => {
      onSettled = resolve
      connect()
    })
  }

  connect()

  if (getCurrentScope()) onScopeDispose(close)

  return { scan, events, findingsVersion, connected, error, close, reconnect }
}
