import { createRouter, createWebHistory } from 'vue-router'

import ConsoleLayout from '@/layouts/ConsoleLayout.vue'
import { useSessionStore } from '@/stores/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/signin',
      name: 'signin',
      component: () => import('@/views/SignInView.vue'),
    },
    {
      path: '/',
      component: ConsoleLayout,
      children: [
        { path: '', name: 'index', component: () => import('@/views/IndexView.vue') },
        {
          path: 't/:table',
          name: 'records',
          component: () => import('@/views/RecordsView.vue'),
          props: true,
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const session = useSessionStore()
  if (to.name !== 'signin' && !session.isAuthenticated) {
    return { name: 'signin', query: { next: to.fullPath } }
  }
  if (to.name === 'signin' && session.isAuthenticated) {
    return { name: 'index' }
  }
  return true
})

export default router
