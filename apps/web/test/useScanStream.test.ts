import { effectScope } from 'vue'
import { expect, test } from 'vitest'
import { useScanStream } from '../src/composables/useScanStream'

class FakeEventSource {
  static CLOSED = 2
  static instances: FakeEventSource[] = []
  readyState = 0
  closed = false
  listeners = new Map<string, ((event: Event) => void)[]>()
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, fn: (event: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }
  close() {
    this.closed = true
    this.readyState = FakeEventSource.CLOSED
  }
  emit(type: string, data?: unknown) {
    const event = new MessageEvent(type, { data: data === undefined ? '' : JSON.stringify(data) })
    for (const fn of this.listeners.get(type) ?? []) fn(event)
  }
}

const scan = (status: string) => ({
  id: 's1',
  status,
  findings: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
})
const event = (id: string, type = 'status') => ({
  id,
  type,
  message: id,
  data: null,
  createdAt: '2026-09-24T10:00:00Z',
})

function setup() {
  FakeEventSource.instances = []
  const scope = effectScope()
  const stream = scope.run(() =>
    useScanStream('s1', { eventSource: FakeEventSource as unknown as typeof EventSource }),
  )!
  return { scope, stream, source: FakeEventSource.instances[0]! }
}

test('connects to the scan stream and applies the snapshot', () => {
  const { stream, source } = setup()
  expect(source.url).toBe('/api/v1/scans/s1/stream')
  source.emit('open')
  source.emit('snapshot', { scan: scan('running'), events: [event('e1'), event('e2')] })
  expect(stream.connected.value).toBe(true)
  expect(stream.scan.value?.status).toBe('running')
  expect(stream.events.value.map((e) => e.id)).toEqual(['e1', 'e2'])
})

test('events are deduplicated by id, including after a reconnect snapshot', () => {
  const { stream, source } = setup()
  source.emit('snapshot', { scan: scan('running'), events: [event('e1')] })
  source.emit('event', event('e2'))
  source.emit('event', event('e2'))
  source.emit('snapshot', { scan: scan('running'), events: [event('e2'), event('e3')] })
  expect(stream.events.value.map((e) => e.id)).toEqual(['e1', 'e2', 'e3'])
})

test('findings messages bump the refetch counter', () => {
  const { stream, source } = setup()
  source.emit('snapshot', { scan: scan('running'), events: [] })
  source.emit('findings')
  source.emit('findings')
  expect(stream.findingsVersion.value).toBe(2)
})

test('the stream closes once the scan reaches a finished status', () => {
  const { stream, source } = setup()
  source.emit('snapshot', { scan: scan('running'), events: [] })
  expect(source.closed).toBe(false)
  source.emit('scan', scan('completed'))
  expect(source.closed).toBe(true)
  expect(stream.connected.value).toBe(false)
  source.emit('error')
  expect(stream.error.value).toBeNull()
})

test('disposing the owning scope closes the connection', () => {
  const { scope, source } = setup()
  scope.stop()
  expect(source.closed).toBe(true)
})

test('an unreachable scan reports not found', () => {
  const { stream, source } = setup()
  source.readyState = FakeEventSource.CLOSED
  source.emit('error')
  expect(stream.error.value).toBe('Scan not found')
})
