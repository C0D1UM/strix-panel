import { Type } from '@sinclair/typebox'
import { describe, expect, test } from 'bun:test'
import { parseEnv, splitList } from './env'

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

  test('throws listing invalid variables', () => {
    expect(() => parseEnv(schema, {})).toThrow(/URL/)
  })
})

test('splitList trims, lowercases and drops empties', () => {
  expect(splitList(' A.com, b.com ,,')).toEqual(['a.com', 'b.com'])
})
