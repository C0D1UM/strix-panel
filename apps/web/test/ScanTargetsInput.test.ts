import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import ScanTargetsInput from '../src/components/ScanTargetsInput.vue'
import { newTargetRow, type TargetRow } from '../src/lib/scan-targets'

function setup(rows: TargetRow[] = [newTargetRow()]) {
  const wrapper = mount(ScanTargetsInput, {
    props: {
      modelValue: rows,
      'onUpdate:modelValue': (value: TargetRow[]) => wrapper.setProps({ modelValue: value }),
    },
  })
  return wrapper
}
const model = (wrapper: ReturnType<typeof setup>) => wrapper.props('modelValue') as TargetRow[]

async function pick(wrapper: ReturnType<typeof setup>, row: number, file: File) {
  await wrapper.findAll('[data-testid="target-upload"]')[row]!.trigger('click')
  const input = wrapper.find('[data-testid="target-file-input"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

test('adds rows up to three and removes them, keeping one empty row', async () => {
  const wrapper = setup()
  await wrapper.find('[data-testid="target-add"]').trigger('click')
  await wrapper.find('[data-testid="target-add"]').trigger('click')
  expect(model(wrapper)).toHaveLength(3)
  expect(wrapper.find('[data-testid="target-add"]').attributes('disabled')).toBeDefined()
  for (let i = 0; i < 3; i++) await wrapper.find('[data-testid="target-remove"]').trigger('click')
  expect(model(wrapper)).toEqual([expect.objectContaining({ kind: 'url', text: '' })])
})

test('picking a file turns that row into a file row, in place', async () => {
  const first: TargetRow = { ...newTargetRow(), kind: 'url', text: 'https://a.example' }
  const wrapper = setup([first, newTargetRow()])
  await pick(wrapper, 1, new File(['{}'], 'pets.json'))
  expect(model(wrapper).map((row) => row.kind)).toEqual(['url', 'file'])
  expect(wrapper.find('[data-testid="target-file"]').text()).toContain('pets.json')
})
