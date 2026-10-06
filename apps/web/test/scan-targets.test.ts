import { MAX_SCAN_TARGET_FILE_BYTES } from '@strix-panel/shared'
import { expect, test } from 'vitest'
import { formatFileSize, validateTargetRows, type TargetRow } from '../src/lib/scan-targets'

let id = 0
const url = (text: string): TargetRow => ({ id: ++id, kind: 'url', text })
const file = (name: string, size = 10): TargetRow => ({
  id: ++id,
  kind: 'file',
  file: new File([new Uint8Array(size)], name),
})

test('keeps row order, normalizes URLs and skips empty rows', () => {
  const rows = [
    url(' https://Example.com '),
    url(''),
    file('pets.yaml'),
    url('https://example.com/'),
  ]
  const { targets, errors } = validateTargetRows(rows, 3)
  expect(errors).toEqual([])
  expect(targets.map((t) => (typeof t === 'string' ? t : t.name))).toEqual([
    'https://example.com/',
    'pets.yaml',
  ])
})

test('reports no targets, bad URLs, bad files and duplicates', () => {
  expect(validateTargetRows([url('  ')], 3).errors).toEqual(['Add at least one target'])
  expect(validateTargetRows([url('ftp://x.test')], 3).errors).toEqual([
    'Not an http(s) URL: ftp://x.test',
  ])
  expect(validateTargetRows([file('notes.txt')], 3).errors).toEqual([
    'Only .json, .yaml and .yml files are accepted: notes.txt',
  ])
  expect(validateTargetRows([file('big.json', MAX_SCAN_TARGET_FILE_BYTES + 1)], 3).errors).toEqual([
    'big.json: larger than 5 MB',
  ])
  expect(validateTargetRows([file('A.json'), file('a.json')], 3).errors).toEqual([
    'a.json: added more than once',
  ])
})

test('limits the target count to the given maximum, URLs and files together', () => {
  const rows = [url('https://a.example'), file('a.json'), url('https://b.example')]
  expect(validateTargetRows(rows, 3).errors).toEqual([])
  expect(validateTargetRows(rows, 2).errors).toEqual(['At most 2 targets per scan'])
})

test('formats file sizes', () => {
  expect(formatFileSize(512)).toBe('512 B')
  expect(formatFileSize(42 * 1024)).toBe('42 KB')
  expect(formatFileSize(3.5 * 1024 * 1024)).toBe('3.5 MB')
})
