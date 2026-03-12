<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { clearSession, useAuthSession } from '../composables/useAuthSession'

const route = useRoute()
const router = useRouter()
const { user } = useAuthSession()

const navigationItems = [
  { label: 'Overview', to: '/app/overview' },
  { label: 'Market', to: '/app/market' },
  { label: 'Forecast', to: '/app/forecast' },
  { label: 'Trading', to: '/app/trading' },
  { label: 'Agentic', to: '/app/agentic' },
]

const displayName = computed(() => {
  const first = user.value?.profile?.first_name || ''
  const last = user.value?.profile?.last_name || ''
  const full = `${first} ${last}`.trim()
  return full || user.value?.email || 'Investor'
})

const onLogout = async () => {
  clearSession()
  await router.replace('/auth/login')
}
</script>

<template>
  <div class="dashboard-shell">
    <aside class="dashboard-sidebar">
      <div>
        <p class="eyebrow">IDX30 Workspace</p>
        <h2>{{ displayName }}</h2>
        <p class="sidebar-role">{{ user?.workspace?.job_title || 'Market Explorer' }}</p>
      </div>

      <nav class="dashboard-nav">
        <RouterLink
          v-for="item in navigationItems"
          :key="item.to"
          :to="item.to"
          :class="['nav-link', route.path === item.to ? 'active' : '']"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <button type="button" class="logout-button" @click="onLogout">Logout</button>
    </aside>

    <section class="dashboard-content">
      <RouterView />
    </section>
  </div>
</template>
