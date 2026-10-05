import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import AppSwitch from '../src/components/ui/AppSwitch.vue'

test('toggles its model on click', async () => {
  const wrapper = mount(AppSwitch, {
    props: {
      modelValue: false,
      'onUpdate:modelValue': (value: boolean) => wrapper.setProps({ modelValue: value }),
    },
  })
  const button = wrapper.get('[role="switch"]')
  expect(button.attributes('aria-checked')).toBe('false')
  await button.trigger('click')
  expect(wrapper.props('modelValue')).toBe(true)
  expect(button.attributes('aria-checked')).toBe('true')
})
