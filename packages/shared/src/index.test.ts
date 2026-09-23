import { describe, expect, test } from 'bun:test'
import { isAllowedEmail } from './index'

describe('isAllowedEmail', () => {
  test('allows everyone when no domains configured', () => {
    expect(isAllowedEmail('a@gmail.com', [])).toBe(true)
  })

  test('matches configured domains case-insensitively', () => {
    expect(isAllowedEmail('a@Example.com', ['example.com'])).toBe(true)
    expect(isAllowedEmail('a@other.com', ['example.com'])).toBe(false)
  })

  test('does not match subdomains or suffixes', () => {
    expect(isAllowedEmail('a@evil-example.com', ['example.com'])).toBe(false)
    expect(isAllowedEmail('a@sub.example.com', ['example.com'])).toBe(false)
  })
})
