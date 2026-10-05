import { MAX_SCAN_TARGET_FILE_BYTES } from '@strix-panel/shared'
import { describe, expect, test } from 'bun:test'
import { parseScanTargets } from '../src/modules/scans/target-files'

const file = (name: string, content: string | Uint8Array) => new File([content], name)
const OPENAPI_YAML = 'openapi: 3.0.0\ninfo: { title: Pets, version: "1" }\npaths: {}\n'
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: { code: string }) => error.code,
  )

describe('parseScanTargets', () => {
  test('keeps the given order of URLs and files', async () => {
    const { targets, files } = await parseScanTargets([
      'https://B.example',
      file('pets.yaml', OPENAPI_YAML),
      file('postman.json', '{"info":{"_postman_id":"x"},"item":[]}'),
    ])
    expect(targets).toEqual([
      { type: 'url', value: 'https://b.example/' },
      { type: 'file', name: 'pets.yaml' },
      { type: 'file', name: 'postman.json' },
    ])
    expect(files.map((f) => f.name)).toEqual(['pets.yaml', 'postman.json'])
    expect(new TextDecoder().decode(files[0]!.bytes)).toBe(OPENAPI_YAML)
  })

  test('drops duplicate URLs, as before', async () => {
    const { targets } = await parseScanTargets(['https://a.example', 'https://A.example/'])
    expect(targets).toEqual([{ type: 'url', value: 'https://a.example/' }])
  })

  test('accepts JSON content in a .yaml file (YAML is a superset)', async () => {
    expect(await code(parseScanTargets([file('a.yaml', '{"openapi":"3.0.0"}')]))).toBe('ok')
  })

  test('counts URLs and files together against the limit', async () => {
    const raw = [
      'https://a.example',
      'https://b.example',
      file('a.json', '{}'),
      file('b.json', '{}'),
    ]
    expect(await code(parseScanTargets(raw))).toBe('INVALID_TARGET')
    expect(await code(parseScanTargets([]))).toBe('INVALID_TARGET')
  })

  test('rejects content that is not a JSON/YAML object', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe])
    for (const bad of [
      file('spec.json', png),
      file('spec.yaml', png),
      file('spec.json', '<html><body>hi</body></html>'),
      file('spec.yaml', '<html><body>hi</body></html>'),
      file('spec.json', 'openapi: 3.0.0'),
      file('spec.yaml', '- a\n- b\n'),
      file('spec.json', '"just a string"'),
      file('spec.yaml', 'a: [unclosed'),
      file('spec.yaml', ''),
    ]) {
      expect(await code(parseScanTargets([bad]))).toBe('INVALID_TARGET_FILE')
    }
  })

  test('rejects bad names, oversize files and duplicate names in any case', async () => {
    expect(await code(parseScanTargets([file('spec.txt', '{}')]))).toBe('INVALID_TARGET_FILE')
    const big = file('big.json', `{"a":"${'x'.repeat(MAX_SCAN_TARGET_FILE_BYTES)}"}`)
    expect(await code(parseScanTargets([big]))).toBe('INVALID_TARGET_FILE')
    expect(await code(parseScanTargets([file('Spec.json', '{}'), file('spec.json', '{}')]))).toBe(
      'INVALID_TARGET_FILE',
    )
  })
})
