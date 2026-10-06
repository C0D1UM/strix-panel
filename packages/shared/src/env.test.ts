import { Type } from '@sinclair/typebox'
import { describe, expect, test } from 'bun:test'
import { isAbsolute, join } from 'node:path'
import {
  DEFAULT_STRIX_TMP_DIR,
  DEFAULT_UPLOAD_DIR,
  parseEnv,
  scanTargetFilePath,
  splitList,
} from './env'

const schema = Type.Object({
  PORT: Type.Number({ default: 3000 }),
  FLAG: Type.Boolean({ default: false }),
  URL: Type.String({ minLength: 1 }),
})

describe('parseEnv', () => {
  test('applies defaults and coerces types', () => {
    expect(parseEnv(schema, { URL: 'x', FLAG: 'true' })).toEqual({
      PORT: 3000,
      FLAG: true,
      URL: 'x',
    })
    expect(parseEnv(schema, { URL: 'x', PORT: '8080' }).PORT).toBe(8080)
  })

  test('treats empty strings as unset', () => {
    expect(parseEnv(schema, { URL: 'x', PORT: '' }).PORT).toBe(3000)
  })

  test('fills missing or empty variables from defaults', () => {
    expect(parseEnv(schema, { URL: '' }, { URL: 'fallback' }).URL).toBe('fallback')
    expect(parseEnv(schema, { URL: 'set' }, { URL: 'fallback' }).URL).toBe('set')
  })

  test('throws listing invalid variables', () => {
    expect(() => parseEnv(schema, {})).toThrow(/URL/)
  })
})

test('splitList trims, lowercases and drops empties', () => {
  expect(splitList(' A.com, b.com ,,')).toEqual(['a.com', 'b.com'])
})

test('development upload and Strix temp dirs live in the repo .data folder', () => {
  expect(isAbsolute(DEFAULT_UPLOAD_DIR)).toBe(true)
  expect(DEFAULT_UPLOAD_DIR.endsWith(join('.data', 'uploads'))).toBe(true)
  expect(DEFAULT_STRIX_TMP_DIR.endsWith(join('.data', 'strix-tmp'))).toBe(true)
  expect(scanTargetFilePath('/u', 's1', 'spec.yaml')).toBe('/u/s1/spec.yaml')
})
