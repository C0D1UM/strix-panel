import { join } from 'node:path'
import { expect, test } from 'bun:test'
import { buildStrixArgs } from '../src/strix/args'

test('builds a non-interactive argv with every option', () => {
  expect(
    buildStrixArgs(
      'strix',
      {
        id: 's1',
        targets: [
          { type: 'url', value: 'https://a.example/' },
          { type: 'url', value: 'https://b.example/' },
        ],
        scanMode: 'quick',
        instruction: 'Focus on IDOR; ignore $(rm -rf /)',
        maxBudgetUsd: 12.5,
        runName: null,
      },
      '/uploads',
    ),
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
    buildStrixArgs(
      '/opt/strix',
      {
        id: 's1',
        targets: [{ type: 'url', value: 'https://a.example/' }],
        scanMode: 'deep',
        instruction: null,
        maxBudgetUsd: null,
        runName: null,
      },
      '/uploads',
    ),
  ).toEqual(['/opt/strix', '-n', '-t', 'https://a.example/', '-m', 'deep'])
})

test('continues an existing run with only the budget', () => {
  expect(
    buildStrixArgs(
      'strix',
      {
        id: 's1',
        targets: [{ type: 'url', value: 'https://a.example/' }],
        scanMode: 'quick',
        instruction: 'Focus on IDOR',
        maxBudgetUsd: 5,
        runName: 'a-example_ab12',
      },
      '/uploads',
    ),
  ).toEqual(['strix', '-n', '--resume', 'a-example_ab12', '--max-budget', '5'])
})

test('passes uploaded spec files as paths in the upload dir, keeping the order', () => {
  expect(
    buildStrixArgs(
      'strix',
      {
        id: 's1',
        targets: [
          { type: 'file', name: 'pets.yaml' },
          { type: 'url', value: 'https://a.example/' },
        ],
        scanMode: 'quick',
        instruction: null,
        maxBudgetUsd: null,
        runName: null,
      },
      '/data/uploads',
    ),
  ).toEqual([
    'strix',
    '-n',
    '-t',
    '/data/uploads/s1/pets.yaml',
    '-t',
    'https://a.example/',
    '-m',
    'quick',
  ])
})

test('resolves a relative upload dir, since Strix runs in the scan folder', () => {
  const args = buildStrixArgs(
    'strix',
    {
      id: 's1',
      targets: [{ type: 'file', name: 'a.json' }],
      scanMode: 'quick',
      instruction: null,
      maxBudgetUsd: null,
      runName: null,
    },
    'uploads',
  )
  expect(args[3]).toBe(join(process.cwd(), 'uploads', 's1', 'a.json'))
})

test('puts uploaded spec files back in the workspace on resume, where Strix staged them', () => {
  expect(
    buildStrixArgs(
      'strix',
      {
        id: 's1',
        targets: [
          { type: 'url', value: 'https://a.example/' },
          { type: 'file', name: 'pets.yaml' },
        ],
        scanMode: 'quick',
        instruction: null,
        maxBudgetUsd: null,
        runName: 'a-example_ab12',
      },
      '/data/uploads',
    ),
  ).toEqual([
    'strix',
    '-n',
    '--resume',
    'a-example_ab12',
    '--workspace-file',
    '/data/uploads/s1/pets.yaml:api-specs/pets.yaml',
  ])
})
