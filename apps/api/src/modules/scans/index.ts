import { Elysia, t } from 'elysia'
import { auth } from '../../lib/auth'
import { authPlugin } from '../../plugins/auth'
import {
  CreateScanBody,
  ErrorResponse,
  ListEventsQuery,
  ListScansQuery,
  ReportPdfResponse,
  ScanEventResponse,
  ScanFindingResponse,
  ScanIdParams,
  ScanListResponse,
  ScanResponse,
} from './schema'
import {
  createScan,
  getReport,
  getReportPdf,
  getReportPdfStatus,
  getScan,
  listEvents,
  listFindings,
  listScans,
  requestReportPdf,
  resumeScan,
  stopScan,
} from './service'
import { streamScan } from './stream'

const tags = ['Scans']

export const scansModule = new Elysia({ name: 'scans', prefix: '/scans' })
  .use(authPlugin)
  .post(
    '/',
    async ({ user, body, set }) => {
      set.status = 201
      return createScan(user, body)
    },
    {
      requireAuth: true,
      body: CreateScanBody,
      response: { 201: ScanResponse, 400: ErrorResponse },
      detail: { tags, summary: 'Create a scan and start it' },
    },
  )
  .get('/', ({ user, query }) => listScans(user, query.page ?? 1, query.pageSize ?? 20), {
    requireAuth: true,
    query: ListScansQuery,
    response: ScanListResponse,
    detail: { tags, summary: 'List scans, newest first' },
  })
  .get('/:id', ({ user, params }) => getScan(user, params.id), {
    requireAuth: true,
    params: ScanIdParams,
    response: { 200: ScanResponse, 404: ErrorResponse },
    detail: { tags, summary: 'One scan with its agents' },
  })
  .get('/:id/events', ({ user, params, query }) => listEvents(user, params.id, query.after), {
    requireAuth: true,
    params: ScanIdParams,
    query: ListEventsQuery,
    response: { 200: t.Array(ScanEventResponse), 404: ErrorResponse },
    detail: { tags, summary: 'Feed events, oldest first' },
  })
  .get('/:id/findings', ({ user, params }) => listFindings(user, params.id), {
    requireAuth: true,
    params: ScanIdParams,
    response: { 200: t.Array(ScanFindingResponse), 404: ErrorResponse },
    detail: { tags, summary: 'Findings, most severe first' },
  })
  .get(
    '/:id/report.md',
    async ({ user, params }) => {
      const markdown = await getReport(user, params.id)
      return new Response(markdown, {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'content-disposition': `attachment; filename="strix-report-${params.id}.md"`,
        },
      })
    },
    {
      requireAuth: true,
      params: ScanIdParams,
      response: { 200: t.String({ description: 'Markdown' }), 404: ErrorResponse },
      detail: { tags, summary: 'Download the whole-scan report' },
    },
  )
  .post('/:id/report-pdf', ({ user, params }) => requestReportPdf(user, params.id), {
    requireAuth: true,
    params: ScanIdParams,
    response: { 200: ReportPdfResponse, 404: ErrorResponse, 409: ErrorResponse },
    detail: {
      tags,
      summary: 'Start rendering the PDF report (completed scans); poll GET until it is ready',
    },
  })
  .get('/:id/report-pdf', ({ user, params }) => getReportPdfStatus(user, params.id), {
    requireAuth: true,
    params: ScanIdParams,
    response: { 200: ReportPdfResponse, 404: ErrorResponse, 409: ErrorResponse },
    detail: { tags, summary: 'Whether the PDF report is ready' },
  })
  .get(
    '/:id/report.pdf',
    async ({ user, params }) => {
      const file = await getReportPdf(user, params.id)
      return new Response(file, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="strix-report-${params.id}.pdf"`,
        },
      })
    },
    {
      requireAuth: true,
      params: ScanIdParams,
      response: {
        200: t.String({ format: 'binary', description: 'PDF' }),
        404: ErrorResponse,
        409: ErrorResponse,
      },
      detail: { tags, summary: 'Download the PDF report once it is ready' },
    },
  )
  .get(
    '/:id/stream',
    async ({ user, params, request, set }) => {
      const scan = await getScan(user, params.id)
      // no-transform: stops proxies such as Cloudflare from compressing, and so buffering, the stream.
      set.headers['cache-control'] = 'no-cache, no-transform'
      const resolveViewer = async () =>
        (await auth.api.getSession({ headers: request.headers }))?.user ?? null
      return streamScan(
        resolveViewer,
        scan,
        request.headers.get('last-event-id') ?? undefined,
        request.signal,
      )
    },
    {
      // No `response` schema: Elysia types SSE by the generator's yields, and TypeBox can't describe a stream.
      requireAuth: true,
      params: ScanIdParams,
      detail: {
        tags,
        summary: 'Live updates (SSE): snapshot, then scan / event / findings messages',
      },
    },
  )
  .post('/:id/stop', ({ user, params }) => stopScan(user, params.id), {
    requireAuth: true,
    params: ScanIdParams,
    response: { 200: ScanResponse, 404: ErrorResponse, 409: ErrorResponse },
    detail: { tags, summary: 'Stop a queued or running scan' },
  })
  .post('/:id/resume', ({ user, params }) => resumeScan(user, params.id), {
    requireAuth: true,
    params: ScanIdParams,
    response: { 200: ScanResponse, 404: ErrorResponse, 409: ErrorResponse },
    detail: { tags, summary: 'Resume a failed or stopped scan' },
  })
