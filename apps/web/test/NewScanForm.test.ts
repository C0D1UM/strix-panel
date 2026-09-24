import { mount } from '@vue/test-utils'
import { beforeEach, expect, test, vi } from 'vitest'
import NewScanForm from '../src/components/NewScanForm.vue'

const post = vi.fn()
vi.mock('../src/lib/api', () => ({
  api: { v1: { scans: { post: (body: unknown) => post(body) } } },
}))

beforeEach(() => post.mockReset())

test('shows target errors and does not submit an invalid form', async () => {
  const wrapper = mount(NewScanForm)
  await wrapper.find('form').trigger('submit')
  expect(wrapper.findAll('[data-testid="target-error"]').map((e) => e.text())).toEqual([
    'Enter at least one target URL',
  ])
  await wrapper.find('textarea').setValue('ftp://example.com')
  expect(wrapper.find('[data-testid="target-error"]').text()).toBe(
    'Not an http(s) URL: ftp://example.com',
  )
  expect(post).not.toHaveBeenCalled()
})

test('submits a budget as a number', async () => {
  post.mockResolvedValue({ data: { id: 's1' }, error: null })
  const wrapper = mount(NewScanForm)
  await wrapper.find('textarea').setValue('https://example.com')
  await wrapper.find('input[type="number"]').setValue('2.5')
  await wrapper.find('form').trigger('submit')
  await vi.waitFor(() => expect(post).toHaveBeenCalled())
  expect(post.mock.calls.at(-1)![0]).toMatchObject({ maxBudgetUsd: 2.5 })
})

test('rejects a non-positive budget', async () => {
  const wrapper = mount(NewScanForm)
  await wrapper.find('textarea').setValue('https://example.com')
  await wrapper.find('input[type="number"]').setValue('0')
  await wrapper.find('form').trigger('submit')
  expect(wrapper.text()).toContain('Budget must be greater than 0')
  expect(post).not.toHaveBeenCalled()
})

test('submits normalized targets, defaulting to deep mode with no budget', async () => {
  post.mockResolvedValue({ data: { id: 's1' }, error: null })
  const wrapper = mount(NewScanForm)
  await wrapper.findAll('textarea')[0]!.setValue('https://Example.com')
  await wrapper.find('form').trigger('submit')
  await vi.waitFor(() => expect(post).toHaveBeenCalled())
  expect(post).toHaveBeenCalledWith({
    name: undefined,
    targets: ['https://example.com/'],
    scanMode: 'deep',
    instruction: undefined,
    maxBudgetUsd: undefined,
  })
  expect(wrapper.emitted('created')).toHaveLength(1)
})
