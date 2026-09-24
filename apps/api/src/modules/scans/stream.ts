// Server-sent events for one scan: a snapshot, then the scan row and new feed events after every NOTIFY.
import { isFinishedScanStatus } from '@strix-panel/shared'
import { sse } from 'elysia'
import { scanListener } from '../../lib/scan-listener'
import { getScan, listEventsUnchecked, type ScanDto } from './service'

const HEARTBEAT_MS = 25_000

type Viewer = Parameters<typeof getScan>[0]

const findingsChanged = (a: ScanDto, b: ScanDto) =>
  Object.entries(a.findings).some(([k, v]) => b.findings[k as keyof ScanDto['findings']] !== v)

// `initial` comes from the route, which checked access before the response started: an async generator
// can't turn a late error into a 404 once its first chunk is on the wire.
export async function* streamScan(
  viewer: Viewer,
  initial: ScanDto,
  lastEventId: string | undefined,
  signal: AbortSignal,
) {
  const scanId = initial.id
  let scan = initial
  await scanListener.ready()

  let pending = false
  let wake: (() => void) | null = null
  const poke = () => {
    pending = true
    wake?.()
  }
  const unsubscribe = scanListener.subscribe(scanId, poke)
  signal.addEventListener('abort', () => wake?.(), { once: true })

  try {
    const events = await listEventsUnchecked(scanId, lastEventId)
    let last = events.at(-1)?.id ?? lastEventId
    yield sse({ event: 'snapshot', data: { scan, events }, ...(last ? { id: last } : {}) })
    if (isFinishedScanStatus(scan.status)) return

    while (!signal.aborted) {
      if (!pending) {
        let timer: ReturnType<typeof setTimeout> | undefined
        await new Promise<void>((resolve) => {
          wake = resolve
          timer = setTimeout(resolve, HEARTBEAT_MS)
        })
        wake = null
        clearTimeout(timer)
      }
      if (signal.aborted) return
      if (!pending) {
        yield sse({ event: 'ping', data: '' })
        continue
      }
      pending = false

      const next = await getScan(viewer, scanId)
      const fresh = await listEventsUnchecked(scanId, last)
      yield sse({ event: 'scan', data: next })
      for (const event of fresh) {
        yield sse({ event: 'event', data: event, id: event.id })
        last = event.id
      }
      if (findingsChanged(scan, next) || fresh.some((e) => e.type === 'finding')) {
        yield sse({ event: 'findings', data: '' })
      }
      scan = next
      if (isFinishedScanStatus(scan.status)) return
    }
  } finally {
    unsubscribe()
  }
}
