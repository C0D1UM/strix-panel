import { createRouter, createWebHistory } from 'vue-router'
import { currentUser, loadCurrentUser } from './lib/current-user'
import { loadSession } from './lib/session'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    guestOnly?: boolean
    requiresAdmin?: boolean
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
        { path: 'scans', name: 'scans', component: () => import('./pages/ScansPage.vue') },
        {
          path: 'scans/:id',
          name: 'scan',
          component: () => import('./pages/ScanDetailPage.vue'),
          props: true,
        },
        {
          path: 'admin/users',
          name: 'admin-users',
          component: () => import('./pages/AdminUsersPage.vue'),
          meta: { requiresAdmin: true },
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
  // UX only; the API enforces admin access itself.
  if (to.meta.requiresAdmin) {
    const user = currentUser.value ?? (await loadCurrentUser())
    if (user?.role !== 'admin') return { name: 'dashboard' }
  }
})
