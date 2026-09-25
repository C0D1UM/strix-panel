import { onScopeDispose, ref } from 'vue'
import { api } from '../lib/api'

const POLL_INTERVAL_MS = 1000
const MAX_WAIT_MS = 3 * 60 * 1000

type Status = { state: 'none' | 'pending' | 'ready' | 'failed'; error: string | null }

// The PDF report is rendered on demand by the worker: ask for it, poll until it is ready, then download it.
export function useReportPdf(
  scanId: string,
  download: (url: string) => void = defaultDownload,
  sleep: (ms: number) => Promise<void> = defaultSleep,
) {
  const preparing = ref(false)
  const error = ref<string | null>(null)
  let disposed = false
  onScopeDispose(() => (disposed = true))

  const routes = () => api.v1.scans({ id: scanId })['report-pdf']

  async function fetchStatus(start: boolean): Promise<Status> {
    const { data, error: err } = start ? await routes().post() : await routes().get()
    if (err || !data) {
      const message = (err?.value as { error?: { message?: string } } | undefined)?.error?.message
      throw new Error(message ?? 'Could not prepare the PDF report.')
    }
    return data
  }

  async function downloadPdf() {
    if (preparing.value) return
    preparing.value = true
    error.value = null
    try {
      let status = await fetchStatus(true)
      const deadline = Date.now() + MAX_WAIT_MS
      while (status.state === 'pending' && !disposed) {
        if (Date.now() > deadline) throw new Error('The PDF report is taking too long, try again.')
        await sleep(POLL_INTERVAL_MS)
        status = await fetchStatus(false)
      }
      if (disposed) return
      if (status.state === 'failed') throw new Error(status.error ?? 'Rendering the PDF failed.')
      // `none`: the cached file expired in between. Rare; a second click renders it again.
      if (status.state !== 'ready') throw new Error('The PDF report expired, try again.')
      download(`/api/v1/scans/${scanId}/report.pdf`)
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      preparing.value = false
    }
  }

  return { preparing, error, downloadPdf }
}

function defaultDownload(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = ''
  link.click()
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
