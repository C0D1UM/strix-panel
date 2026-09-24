import { Elysia } from 'elysia'
import { authPlugin } from '../../plugins/auth'
import { ErrorResponse } from '../scans/schema'
import { DashboardQuery, DashboardResponse } from './schema'
import { getDashboard } from './service'

const tags = ['Dashboard']

export const dashboardModule = new Elysia({ name: 'dashboard', prefix: '/dashboard' })
  .use(authPlugin)
  .get('/', ({ user, query }) => getDashboard(user, query), {
    requireAuth: true,
    query: DashboardQuery,
    response: { 200: DashboardResponse, 400: ErrorResponse, 403: ErrorResponse },
    detail: { tags, summary: "Usage metrics: the viewer's own, or everyone's for admins" },
  })
