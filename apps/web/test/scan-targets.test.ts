import { expect, test } from 'vitest'
import { parseTargetsInput } from '../src/lib/scan-targets'

test('parses one URL per line, normalizes and deduplicates', () => {
  const { targets, errors } = parseTargetsInput(
    ' https://Example.com \n\nhttps://example.com/\nhttp://10.0.0.1:8080/app',
  )
  expect(targets).toEqual(['https://example.com/', 'http://10.0.0.1:8080/app'])
  expect(errors).toEqual([])
})

test('reports an empty input, bad lines and too many targets', () => {
  expect(parseTargetsInput('  \n').errors).toEqual(['Enter at least one target URL'])
  expect(parseTargetsInput('example.com\nftp://x.test').errors).toEqual([
    'Not an http(s) URL: example.com',
    'Not an http(s) URL: ftp://x.test',
  ])
  const four = ['a', 'b', 'c', 'd'].map((h) => `https://${h}.example`).join('\n')
  expect(parseTargetsInput(four).errors).toEqual(['At most 3 targets per scan'])
})
