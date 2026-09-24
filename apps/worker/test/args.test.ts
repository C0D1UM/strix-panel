import { expect, test } from 'bun:test'
import { buildStrixArgs } from '../src/strix/args'

test('builds a non-interactive argv with every option', () => {
  expect(
    buildStrixArgs('strix', {
      targets: ['https://a.example/', 'https://b.example/'],
      scanMode: 'quick',
      instruction: 'Focus on IDOR; ignore $(rm -rf /)',
      maxBudgetUsd: 12.5,
    }),
  ).toEqual([
    'strix',
    '-n',
    '-t',
    'https://a.example/',
    '-t',
    'https://b.example/',
    '-m',
    'quick',
    '--instruction',
    'Focus on IDOR; ignore $(rm -rf /)',
    '--max-budget',
    '12.5',
  ])
})

test('omits instruction and budget when unset', () => {
  expect(
    buildStrixArgs('/opt/strix', {
      targets: ['https://a.example/'],
      scanMode: 'deep',
      instruction: null,
      maxBudgetUsd: null,
    }),
  ).toEqual(['/opt/strix', '-n', '-t', 'https://a.example/', '-m', 'deep'])
})
