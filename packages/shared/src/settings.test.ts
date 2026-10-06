import { describe, expect, test } from 'bun:test'
import { DEFAULT_SETTINGS, diffSettings, flattenPatch, mergeSettings } from './settings'

describe('mergeSettings', () => {
  test('defaults when there are no rows', () => {
    expect(mergeSettings([])).toEqual(DEFAULT_SETTINGS)
  })

  test('stored values override defaults', () => {
    expect(mergeSettings([{ key: 'auth.registrationEnabled', value: false }]).auth).toEqual({
      registrationEnabled: false,
      autoApproveUsers: true,
    })
  })

  test('ignores unknown keys and values of the wrong type', () => {
    expect(
      mergeSettings([
        { key: 'auth.nope', value: false },
        { key: 'nope.x', value: false },
        { key: 'auth.registrationEnabled.deep', value: false },
        { key: 'auth.autoApproveUsers', value: 'no' },
      ]),
    ).toEqual(DEFAULT_SETTINGS)
  })

  test('ignores values outside the allowed set', () => {
    expect(
      mergeSettings([{ key: 'budget.newUserWindow', value: 'decade' }]).budget.newUserWindow,
    ).toBe('month')
    expect(
      mergeSettings([{ key: 'budget.newUserWindow', value: 'week' }]).budget.newUserWindow,
    ).toBe('week')
  })

  test('ignores a max target count that is not a whole number from 1 to the hard limit', () => {
    const maxTargets = (value: unknown) =>
      mergeSettings([{ key: 'scans.maxTargets', value }]).scans.maxTargets
    expect(maxTargets(10)).toBe(10)
    expect(maxTargets(1)).toBe(1)
    expect(maxTargets(20)).toBe(20)
    expect(maxTargets(0)).toBe(3)
    expect(maxTargets(21)).toBe(3)
    expect(maxTargets(2.5)).toBe(3)
  })

  test('does not mutate the defaults', () => {
    mergeSettings([{ key: 'auth.registrationEnabled', value: false }])
    expect(DEFAULT_SETTINGS.auth.registrationEnabled).toBe(true)
  })
})

test('flattenPatch turns a nested patch into keyed rows', () => {
  expect(flattenPatch({ auth: { autoApproveUsers: false } })).toEqual([
    { key: 'auth.autoApproveUsers', value: false },
  ])
  expect(flattenPatch({})).toEqual([])
})

test('diffSettings returns only changed fields', () => {
  const draft = {
    ...DEFAULT_SETTINGS,
    auth: { ...DEFAULT_SETTINGS.auth, registrationEnabled: false },
  }
  expect(diffSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toEqual({})
  expect(diffSettings(DEFAULT_SETTINGS, draft)).toEqual({ auth: { registrationEnabled: false } })
})
