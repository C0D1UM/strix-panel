import { effectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { expect, test } from 'vitest'
import { useScanStream } from '../src/composables/useScanStream'
import type { Scan, ScanEvent } from '../src/lib/scans'

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

type Initial = { scan: Scan; events: ScanEvent[] } | null

function setup(initial: Promise<Initial> | (() => Promise<Initial>) = new Promise(() => {})) {
  FakeEventSource.instances = []
  const scope = effectScope()
  const stream = scope.run(() =>
    useScanStream('s1', {
      eventSource: FakeEventSource as unknown as typeof EventSource,
      loadInitial: typeof initial === 'function' ? initial : () => initial,
    }),
  )!
  return { scope, stream, source: FakeEventSource.instances[0]! }
}

const initialOf = (status: string, eventIds: string[]) =>
  Promise.resolve({
    scan: scan(status) as unknown as Scan,
    events: eventIds.map((id) => event(id)) as unknown as ScanEvent[],
  })

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

test('reconnect opens a new stream after a finished scan and resolves on its snapshot', async () => {
  const { stream, source } = setup()
  source.emit('snapshot', { scan: scan('failed'), events: [event('e1')] })
  expect(source.closed).toBe(true)

  let settled = false
  const done = stream.reconnect().then(() => (settled = true))
  const next = FakeEventSource.instances[1]!
  expect(next.url).toBe('/api/v1/scans/s1/stream')
  await Promise.resolve()
  expect(settled).toBe(false)

  next.emit('open')
  next.emit('snapshot', { scan: scan('queued'), events: [event('e1'), event('e2')] })
  await done
  expect(next.closed).toBe(false)
  expect(stream.connected.value).toBe(true)
  expect(stream.scan.value?.status).toBe('queued')
  expect(stream.events.value.map((e) => e.id)).toEqual(['e1', 'e2'])

  next.emit('scan', scan('running'))
  expect(stream.scan.value?.status).toBe('running')
})

test('reconnect resolves when the new stream fails', async () => {
  const { stream, source } = setup()
  source.emit('snapshot', { scan: scan('stopped'), events: [] })
  const done = stream.reconnect()
  const next = FakeEventSource.instances[1]!
  next.readyState = FakeEventSource.CLOSED
  next.emit('error')
  await done
  expect(stream.connected.value).toBe(false)
})

test('the page is filled from the initial fetch before the stream snapshot arrives', async () => {
  const { stream, source } = setup(initialOf('running', ['e1']))
  await flushPromises()
  expect(stream.scan.value?.status).toBe('running')
  expect(stream.events.value.map((e) => e.id)).toEqual(['e1'])
  expect(source.closed).toBe(false)
  source.emit('snapshot', { scan: scan('running'), events: [event('e1'), event('e2')] })
  expect(stream.events.value.map((e) => e.id)).toEqual(['e1', 'e2'])
})

test('the initial fetch is ignored once the snapshot has arrived', async () => {
  let resolve!: (value: Initial) => void
  const { stream, source } = setup(new Promise<Initial>((r) => (resolve = r)))
  source.emit('snapshot', { scan: scan('running'), events: [event('e1')] })
  source.emit('scan', scan('completed'))
  resolve(await initialOf('running', ['e0']))
  await flushPromises()
  expect(stream.scan.value?.status).toBe('completed')
  expect(stream.events.value.map((e) => e.id)).toEqual(['e1'])
})

test('a finished scan from the initial fetch closes the stream', async () => {
  const { stream, source } = setup(initialOf('completed', ['e1']))
  await flushPromises()
  expect(stream.scan.value?.status).toBe('completed')
  expect(source.closed).toBe(true)
})

test('a failed initial fetch leaves the stream to report', async () => {
  const { stream, source } = setup(Promise.resolve(null))
  await flushPromises()
  expect(stream.scan.value).toBeNull()
  expect(stream.error.value).toBeNull()
  expect(source.closed).toBe(false)
})

test('reconnect resolves on the initial fetch when it beats the snapshot', async () => {
  const loads = [new Promise<Initial>(() => {}), initialOf('queued', ['e1', 'e2'])]
  const { stream, source } = setup(() => loads.shift()!)
  source.emit('snapshot', { scan: scan('failed'), events: [event('e1')] })
  await stream.reconnect()
  expect(stream.scan.value?.status).toBe('queued')
  expect(stream.events.value.map((e) => e.id)).toEqual(['e1', 'e2'])
  expect(FakeEventSource.instances[1]!.closed).toBe(false)
})
