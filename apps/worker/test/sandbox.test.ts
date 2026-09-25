import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'bun:test'
import {
  createDockerSandboxes,
  removeSandboxes,
  sweepSandboxes,
  type Sandboxes,
} from '../src/sandbox'

const FAKE_DOCKER = join(import.meta.dir, 'fixtures', 'fake-docker.sh')

let log: string
beforeEach(async () => {
  log = join(await mkdtemp(join(tmpdir(), 'strix-docker-')), 'calls.log')
})
const docker = (env: Record<string, string> = {}) =>
  createDockerSandboxes({ bin: FAKE_DOCKER, env: { ...process.env, FAKE_DOCKER_LOG: log, ...env } })
const calls = async () => (await Bun.file(log).text()).trim().split('\n')

test('remove force-removes every container labelled with the scan id', async () => {
  await docker({ FAKE_DOCKER_PS: 'abc\ndef\n' }).remove('scan-1')
  expect(await calls()).toEqual(['ps -aq --filter label=strix-run-id=scan-1', 'rm -f -v abc def'])
})

test('remove does nothing when the scan has no containers', async () => {
  await docker().remove('scan-1')
  expect(await calls()).toEqual(['ps -aq --filter label=strix-run-id=scan-1'])
})

test('scanIds lists the scans of panel-labelled containers once each', async () => {
  const sandboxes = docker({ FAKE_DOCKER_PS: 'scan-1\nscan-2\nscan-1\n' })
  expect(await sandboxes.scanIds()).toEqual(['scan-1', 'scan-2'])
  expect((await calls())[0]).toContain('--filter label=strix-run-type=strix-panel')
})

test('a failing docker call is logged, not thrown', async () => {
  const sandboxes = docker({ FAKE_DOCKER_PS: 'abc', FAKE_DOCKER_FAIL: 'rm' })
  await expect(sandboxes.remove('scan-1')).rejects.toThrow(/cannot remove container/)
  await removeSandboxes(sandboxes, 'scan-1')
})

test('the startup sweep removes finished and unknown scans, and leaves live ones', async () => {
  const removed: string[] = []
  const sandboxes: Sandboxes = {
    remove: async (scanId) => void removed.push(scanId),
    scanIds: async () => ['done', 'live', 'gone', 'broken'],
  }
  const statuses: Record<string, string | null> = { done: 'completed', live: 'running', gone: null }
  const status = async (scanId: string) => {
    if (scanId === 'broken') throw new Error('invalid uuid')
    return statuses[scanId] as never
  }
  expect(await sweepSandboxes(sandboxes, status)).toEqual(['done', 'gone'])
  expect(removed).toEqual(['done', 'gone'])
})
