import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, test, vi } from 'vitest'
import NewScanForm from '../src/components/NewScanForm.vue'
import { loadPublicConfig, publicConfig } from '../src/lib/public-config'

const post = vi.fn()
const budgetGet = vi.fn()
vi.mock('../src/lib/api', () => ({
  api: {
    v1: {
      scans: { post: (body: unknown) => post(body) },
      me: { budget: { get: () => budgetGet() } },
    },
  },
}))
vi.mock('../src/lib/public-config', async () => {
  const { ref } = await import('vue')
  return { publicConfig: ref(null), loadPublicConfig: vi.fn(async () => null) }
})

const unlimited = {
  limitUsd: null,
  window: 'month',
  spentUsd: 0,
  remainingUsd: null,
  minToStartUsd: 3,
  windowStartsAt: '2026-10-01T00:00:00.000Z',
  resetsAt: '2026-11-01T00:00:00.000Z',
}
const limited = (remainingUsd: number, limitUsd = 50) => ({
  ...unlimited,
  limitUsd,
  remainingUsd,
  spentUsd: limitUsd - remainingUsd,
})

beforeEach(() => {
  post.mockReset()
  budgetGet.mockReset()
  budgetGet.mockResolvedValue({ data: unlimited, error: null })
  publicConfig.value = null
  vi.mocked(loadPublicConfig).mockClear()
})

test('shows target errors and does not submit an invalid form', async () => {
  const wrapper = mount(NewScanForm)
  await wrapper.find('form').trigger('submit')
  expect(wrapper.findAll('[data-testid="target-error"]').map((e) => e.text())).toEqual([
    'Add at least one target',
  ])
  await wrapper.find('input[type="url"]').setValue('ftp://example.com')
  expect(wrapper.find('[data-testid="target-error"]').text()).toBe(
    'Not an http(s) URL: ftp://example.com',
  )
  expect(post).not.toHaveBeenCalled()
})

test('submits a budget as a number', async () => {
  post.mockResolvedValue({ data: { id: 's1' }, error: null })
  const wrapper = mount(NewScanForm)
  await wrapper.find('input[type="url"]').setValue('https://example.com')
  await wrapper.find('input[type="number"]').setValue('2.5')
  await wrapper.find('form').trigger('submit')
  await vi.waitFor(() => expect(post).toHaveBeenCalled())
  expect(post.mock.calls.at(-1)![0]).toMatchObject({ maxBudgetUsd: 2.5 })
})

test('rejects a non-positive budget', async () => {
  const wrapper = mount(NewScanForm)
  await wrapper.find('input[type="url"]').setValue('https://example.com')
  await wrapper.find('input[type="number"]').setValue('0')
  await wrapper.find('form').trigger('submit')
  expect(wrapper.text()).toContain('Budget must be greater than 0')
  expect(post).not.toHaveBeenCalled()
})

test('submits normalized targets, defaulting to deep mode with no budget', async () => {
  post.mockResolvedValue({ data: { id: 's1' }, error: null })
  const wrapper = mount(NewScanForm)
  await wrapper.find('input[type="url"]').setValue('https://Example.com')
  await wrapper.find('form').trigger('submit')
  await vi.waitFor(() => expect(post).toHaveBeenCalled())
  expect(post.mock.calls.at(-1)![0]).toStrictEqual({
    targets: ['https://example.com/'],
    scanMode: 'deep',
  })
  expect(wrapper.emitted('created')).toHaveLength(1)
})

test('sends a file target without undefined fields', async () => {
  post.mockResolvedValue({ data: { id: 's1' }, error: null })
  const wrapper = mount(NewScanForm)
  await wrapper.find('[data-testid="target-upload"]').trigger('click')
  const input = wrapper.find('[data-testid="target-file-input"]')
  const file = new File(['{}'], 'pets.json')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await wrapper.find('form').trigger('submit')
  await vi.waitFor(() => expect(post).toHaveBeenCalled())
  const body = post.mock.calls.at(-1)![0] as Record<string, unknown>
  expect(body.targets).toEqual([file])
  expect(Object.values(body)).not.toContain(undefined)
})

test('shows what is left and caps the budget at it', async () => {
  budgetGet.mockResolvedValue({ data: limited(12.4), error: null })
  const wrapper = mount(NewScanForm)
  await flushPromises()
  expect(wrapper.find('[data-testid="budget-left"]').text()).toBe(
    '$12.40 of $50.00 left this month · resets Nov 1',
  )
  const input = wrapper.find('input[type="number"]')
  expect(input.attributes('placeholder')).toBe('Up to $12.40 (your remaining budget)')
  await wrapper.find('input[type="url"]').setValue('https://example.com')
  await input.setValue('13')
  await wrapper.find('form').trigger('submit')
  expect(wrapper.text()).toContain('At most $12.40 is left in your budget')
  expect(post).not.toHaveBeenCalled()

  post.mockResolvedValue({ data: { id: 's1' }, error: null })
  await input.setValue('')
  await wrapper.find('form').trigger('submit')
  await vi.waitFor(() => expect(post).toHaveBeenCalled())
  expect(post.mock.calls.at(-1)![0]).not.toHaveProperty('maxBudgetUsd')
})

test('cannot start below the minimum or with no budget', async () => {
  budgetGet.mockResolvedValue({ data: limited(2), error: null })
  const low = mount(NewScanForm)
  await flushPromises()
  expect(low.find('[data-testid="budget-blocked"]').text()).toBe(
    'You need at least $3.00 of budget to start a scan',
  )
  expect(low.find('button[type="submit"]').attributes('disabled')).toBeDefined()

  budgetGet.mockResolvedValue({ data: limited(0, 0), error: null })
  const none = mount(NewScanForm)
  await flushPromises()
  expect(none.find('[data-testid="budget-blocked"]').text()).toBe(
    'Your account has no scan budget. Ask an admin.',
  )
})

test('an unlimited budget changes nothing', async () => {
  const wrapper = mount(NewScanForm)
  await flushPromises()
  expect(wrapper.find('[data-testid="budget-left"]').exists()).toBe(false)
  expect(wrapper.find('[data-testid="budget-blocked"]').exists()).toBe(false)
  expect(wrapper.find('input[type="number"]').attributes('placeholder')).toBe('No limit')
})

test('allows as many targets as the public config says, defaulting to 3', async () => {
  const wrapper = mount(NewScanForm)
  await flushPromises()
  expect(loadPublicConfig).toHaveBeenCalled()
  expect(wrapper.text()).toContain('1 of 3')
  publicConfig.value = { scans: { maxTargets: 5 } } as unknown as typeof publicConfig.value
  await flushPromises()
  expect(wrapper.text()).toContain('1 of 5')
})
