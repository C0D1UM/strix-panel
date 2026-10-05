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
