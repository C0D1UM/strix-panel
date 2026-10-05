// Scan targets as the API receives them: URL strings and uploaded API spec files, in the user's order. Files are
// checked by content: neither browsers nor Bun's form parser give a trustworthy declared type for JSON/YAML (Bun
// infers it from the file name).
import {
  checkScanTargetFileName,
  MAX_SCAN_TARGET_FILE_BYTES,
  MAX_SCAN_TARGETS,
  normalizeScanTarget,
  type ScanTarget,
} from '@strix-panel/shared'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { BadRequestError } from '../../lib/errors'

export interface TargetFile {
  name: string
  bytes: Uint8Array
}

const MAX_FILE_MB = MAX_SCAN_TARGET_FILE_BYTES / (1024 * 1024)
const invalidFile = (name: string, problem: string) =>
  new BadRequestError('INVALID_TARGET_FILE', `${name}: ${problem}`)

// The file must be UTF-8 text that parses (JSON for .json, YAML for .yaml/.yml) to an object, as every API spec
// format does. Whether it is OpenAPI, Swagger or Postman is left to Strix.
export function checkSpecContent(name: string, bytes: Uint8Array): void {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw invalidFile(name, 'not a text file')
  }
  const json = name.toLowerCase().endsWith('.json')
  let data: unknown
  try {
    data = json ? JSON.parse(text) : Bun.YAML.parse(text)
  } catch {
    throw invalidFile(name, json ? 'not valid JSON' : 'not valid YAML')
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw invalidFile(
      name,
      'must contain an object at the top level, like an OpenAPI or Postman file',
    )
  }
}

export async function parseScanTargets(
  raw: (string | File)[],
): Promise<{ targets: ScanTarget[]; files: TargetFile[] }> {
  const targets: ScanTarget[] = []
  const files: TargetFile[] = []
  const names = new Set<string>()
  for (const item of raw) {
    if (typeof item === 'string') {
      const url = normalizeScanTarget(item)
      if (!url) throw new BadRequestError('INVALID_TARGET', `Not an http(s) URL: ${item.trim()}`)
      if (!targets.some((t) => t.type === 'url' && t.value === url)) {
        targets.push({ type: 'url', value: url })
      }
      continue
    }
    const nameProblem = checkScanTargetFileName(item.name)
    if (nameProblem) throw new BadRequestError('INVALID_TARGET_FILE', nameProblem)
    // Case-insensitive: the files share one folder, and macOS/Windows file systems ignore case.
    const key = item.name.toLowerCase()
    if (names.has(key)) throw invalidFile(item.name, 'added more than once')
    if (item.size > MAX_SCAN_TARGET_FILE_BYTES) {
      throw invalidFile(item.name, `larger than ${MAX_FILE_MB} MB`)
    }
    const bytes = new Uint8Array(await item.arrayBuffer())
    checkSpecContent(item.name, bytes)
    names.add(key)
    targets.push({ type: 'file', name: item.name })
    files.push({ name: item.name, bytes })
  }
  if (targets.length === 0) throw new BadRequestError('INVALID_TARGET', 'Add at least one target')
  if (targets.length > MAX_SCAN_TARGETS) {
    throw new BadRequestError('INVALID_TARGET', `At most ${MAX_SCAN_TARGETS} targets per scan`)
  }
  return { targets, files }
}

export async function writeTargetFiles(dir: string, files: TargetFile[]): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const file of files) await Bun.write(join(dir, file.name), file.bytes)
}
