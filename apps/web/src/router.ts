import { createRouter, createWebHistory } from 'vue-router'
import { loadSession } from './lib/session'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./pages/LoginPage.vue'),
      meta: { guestOnly: true },
    },
    {
      // Signed-in app shell (sidebar). Add authenticated pages as children.
      path: '/',
      component: () => import('./layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: { name: 'dashboard' } },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('./pages/DashboardPage.vue'),
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth && !to.meta.guestOnly) return
  const session = await loadSession()
  if (to.meta.requiresAuth && !session) {
    return {
      name: 'login',
      query: ['/', '/dashboard'].includes(to.fullPath) ? {} : { redirect: to.fullPath },
    }
  }
  if (to.meta.guestOnly && session) return { name: 'dashboard' }
})
