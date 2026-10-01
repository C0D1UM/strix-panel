import { mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import AppCredits from '../src/components/AppCredits.vue'
import { publicConfig, type PublicConfig } from '../src/lib/public-config'

vi.mock('../src/lib/public-config', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPublicConfig: vi.fn(),
}))

const config = (showPoweredBy: boolean): PublicConfig => ({
  auth: { providers: ['email'], registrationEnabled: true },
  branding: { showPoweredBy },
})

afterEach(() => {
  publicConfig.value = null
})

test('credits Strix with links to its site and GitHub repo', () => {
  const hrefs = mount(AppCredits)
    .findAll('a')
    .map((a) => a.attributes('href'))
  expect(hrefs).toEqual(['https://strix.ai', 'https://github.com/usestrix/strix'])
})

test('hides the CODIUM credit by default', () => {
  publicConfig.value = config(false)
  expect(mount(AppCredits).find('[data-testid="powered-by"]').exists()).toBe(false)
})

test('shows the CODIUM credit when enabled', () => {
  publicConfig.value = config(true)
  const credit = mount(AppCredits).find('[data-testid="powered-by"]')
  expect(credit.text()).toBe('Powered by CODIUM')
  expect(credit.find('a').attributes('href')).toBe('https://codium.co')
})
