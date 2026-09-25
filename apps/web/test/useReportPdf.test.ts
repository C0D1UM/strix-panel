import { effectScope } from 'vue'
import { beforeEach, expect, test, vi } from 'vitest'
import { useReportPdf } from '../src/composables/useReportPdf'

const post = vi.fn()
const get = vi.fn()
vi.mock('../src/lib/api', () => ({
  api: { v1: { scans: () => ({ 'report-pdf': { post: () => post(), get: () => get() } }) } },
}))

beforeEach(() => {
  post.mockReset()
  get.mockReset()
})

const status = (state: string, error: string | null = null) => ({
  data: { state, error },
  error: null,
})

function setup() {
  const download = vi.fn()
  const scope = effectScope()
  const pdf = scope.run(() => useReportPdf('s1', download, async () => {}))!
  return { ...pdf, download, scope }
}

test('asks for the PDF, polls until it is ready, then downloads it', async () => {
  post.mockResolvedValue(status('pending'))
  get.mockResolvedValueOnce(status('pending')).mockResolvedValueOnce(status('ready'))
  const { downloadPdf, download, preparing, error } = setup()

  const done = downloadPdf()
  expect(preparing.value).toBe(true)
  await done
  expect(get).toHaveBeenCalledTimes(2)
  expect(download).toHaveBeenCalledWith('/api/v1/scans/s1/report.pdf')
  expect(preparing.value).toBe(false)
  expect(error.value).toBeNull()
})

test('an already rendered PDF downloads without polling', async () => {
  post.mockResolvedValue(status('ready'))
  const { downloadPdf, download } = setup()
  await downloadPdf()
  expect(get).not.toHaveBeenCalled()
  expect(download).toHaveBeenCalledOnce()
})

test('a failed render shows its reason', async () => {
  post.mockResolvedValue(status('pending'))
  get.mockResolvedValue(status('failed', 'Rendering the PDF failed: boom'))
  const { downloadPdf, download, error } = setup()
  await downloadPdf()
  expect(download).not.toHaveBeenCalled()
  expect(error.value).toBe('Rendering the PDF failed: boom')
})

test('an API error shows its message', async () => {
  post.mockResolvedValue({
    data: null,
    error: { value: { error: { code: 'X', message: 'Only a completed scan has a PDF report' } } },
  })
  const { downloadPdf, error } = setup()
  await downloadPdf()
  expect(error.value).toBe('Only a completed scan has a PDF report')
})

test('stops polling once the page is gone', async () => {
  post.mockResolvedValue(status('pending'))
  get.mockResolvedValue(status('pending'))
  const { downloadPdf, download, scope } = setup()
  const done = downloadPdf()
  scope.stop()
  await done
  expect(download).not.toHaveBeenCalled()
})
