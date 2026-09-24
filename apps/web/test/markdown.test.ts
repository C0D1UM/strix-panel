import { expect, test } from 'vitest'
import { renderMarkdown } from '../src/lib/markdown'

test('raw HTML is escaped, not rendered', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)> and <script>alert(1)</script>')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('<script')
  expect(html).toContain('&lt;script&gt;')
})

test('dangerous link protocols are not turned into links', () => {
  expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a')
  expect(renderMarkdown('[x](data:text/html;base64,AAAA)')).not.toContain('<a')
})

test('safe links open in a new tab without leaking the opener', () => {
  const html = renderMarkdown('[docs](https://example.com)')
  expect(html).toContain('href="https://example.com"')
  expect(html).toContain('target="_blank"')
  expect(html).toContain('rel="noopener noreferrer nofollow"')
})

test('code fences render as code blocks', () => {
  expect(renderMarkdown('```\ncurl https://x\n```')).toContain('<pre><code>')
})
