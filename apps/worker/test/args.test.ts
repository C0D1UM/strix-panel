import { expect, test } from 'bun:test'
import { buildStrixArgs } from '../src/strix/args'

test('builds a non-interactive argv with every option', () => {
  expect(
    buildStrixArgs('strix', {
      targets: ['https://a.example/', 'https://b.example/'],
      scanMode: 'quick',
      instruction: 'Focus on IDOR; ignore $(rm -rf /)',
      maxBudgetUsd: 12.5,
      runName: null,
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
      runName: null,
    }),
  ).toEqual(['/opt/strix', '-n', '-t', 'https://a.example/', '-m', 'deep'])
})

test('continues an existing run with only the budget', () => {
  expect(
    buildStrixArgs('strix', {
      targets: ['https://a.example/'],
      scanMode: 'quick',
      instruction: 'Focus on IDOR',
      maxBudgetUsd: 5,
      runName: 'a-example_ab12',
    }),
  ).toEqual(['strix', '-n', '--resume', 'a-example_ab12', '--max-budget', '5'])
})
