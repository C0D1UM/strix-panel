import { remainingBudget, toRole } from '@strix-panel/shared'
import { Elysia } from 'elysia'
import { loadBudget } from '../../lib/budget'
import { authPlugin } from '../../plugins/auth'
import { getSettings } from '../settings/service'
import { countPendingUsers } from '../users/service'
import { MeResponse, MyBudgetResponse } from './schema'

export const meModule = new Elysia({ name: 'me' })
  .use(authPlugin)
  .get(
    '/me',
    async ({ user }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
      role: toRole(user.role),
      approved: user.approvedAt != null,
      ...(user.role === 'admin' ? { pendingUsers: await countPendingUsers() } : {}),
    }),
    {
      requireAuth: true,
      response: MeResponse,
      detail: { tags: ['Users'], summary: 'Current signed-in user' },
    },
  )
  .get(
    '/me/budget',
    async ({ user }) => {
      const [budget, settings] = await Promise.all([loadBudget(user.id), getSettings()])
      return {
        limitUsd: budget.limitUsd,
        window: budget.window,
        spentUsd: budget.spentUsd,
        remainingUsd: remainingBudget(budget.limitUsd, budget.spentUsd),
        minToStartUsd: settings.budget.minToStartUsd,
        windowStartsAt: budget.windowStartsAt?.toISOString() ?? null,
        resetsAt: budget.resetsAt?.toISOString() ?? null,
      }
    },
    {
      requireAuth: true,
      response: MyBudgetResponse,
      detail: { tags: ['Users'], summary: "Current user's scan budget and spend in its window" },
    },
  )
