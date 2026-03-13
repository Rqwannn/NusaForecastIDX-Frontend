import { createRouter, createWebHistory } from 'vue-router'

import { hasActiveSession, initAuthSession } from '../composables/useAuthSession'
import AppLayout from '../layouts/AppLayout.vue'
import AuthLayout from '../layouts/AuthLayout.vue'
import AgenticPage from '../pages/app/AgenticPage.vue'
import AccountEmailPage from '../pages/app/AccountEmailPage.vue'
import AccountPasswordPage from '../pages/app/AccountPasswordPage.vue'
import ForecastPage from '../pages/app/ForecastPage.vue'
import MarketPage from '../pages/app/MarketPage.vue'
import OverviewPage from '../pages/app/OverviewPage.vue'
import ProfilePage from '../pages/app/ProfilePage.vue'
import TradingPage from '../pages/app/TradingPage.vue'
import AuthPage from '../pages/auth/AuthPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/app/overview',
    },
    {
      path: '/auth',
      component: AuthLayout,
      meta: { guestOnly: true },
      children: [
        {
          path: '',
          redirect: '/auth/login',
        },
        {
          path: 'login',
          component: AuthPage,
        },
        {
          path: 'register',
          component: AuthPage,
        },
      ],
    },
    {
      path: '/app',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/app/overview',
        },
        {
          path: 'overview',
          component: OverviewPage,
        },
        {
          path: 'market',
          component: MarketPage,
        },
        {
          path: 'forecast',
          component: ForecastPage,
        },
        {
          path: 'trading',
          component: TradingPage,
        },
        {
          path: 'agentic',
          component: AgenticPage,
        },
        {
          path: 'profile',
          component: ProfilePage,
        },
        {
          path: 'account/email',
          component: AccountEmailPage,
        },
        {
          path: 'account/password',
          component: AccountPasswordPage,
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/app/overview',
    },
  ],
})

router.beforeEach(async (to) => {
  await initAuthSession()
  const authenticated = hasActiveSession()

  if (to.meta.requiresAuth && !authenticated) {
    return '/auth/login'
  }

  if (to.meta.guestOnly && authenticated) {
    return '/app/overview'
  }

  return true
})

export default router
