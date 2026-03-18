<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { logoutSession, useAuthSession } from '../composables/useAuthSession'
import InformationCenterWidget from '../components/app/InformationCenterWidget.vue'
import '../styles/layouts/app-layout.css'

const route = useRoute()
const router = useRouter()
const { user } = useAuthSession()

const themeStorageKey = 'idx30-workspace-theme'
const theme = ref('dark')
const sidebarOpen = ref(false)

const mainNavigationItems = [
  {
    label: 'Overview',
    to: '/app/overview',
    icon: 'ri-layout-grid-line',
    eyebrow: 'Executive overview',
    description: 'Ringkasan kondisi market, model, dan prioritas riset harian.',
  },
  {
    label: 'Market',
    to: '/app/market',
    icon: 'ri-line-chart-line',
    eyebrow: 'Market watch',
    description: 'Pantau breadth IDX30, quote, dan konteks pasar terkini.',
  },
  {
    label: 'Forecast',
    to: '/app/forecast',
    icon: 'ri-funds-box-line',
    eyebrow: 'Forecast lab',
    description: 'Buka sinyal prediksi, confidence score, dan perbandingan model.',
  },
  {
    label: 'Trading',
    to: '/app/trading',
    icon: 'ri-exchange-funds-line',
    eyebrow: 'Paper strategy',
    description: 'Kelola simulasi order, posisi, dan disiplin eksekusi strategi.',
  },
  {
    label: 'Agentic',
    to: '/app/agentic',
    icon: 'ri-robot-2-line',
    eyebrow: 'Agentic orchestration',
    description: 'Pantau respons ReAct, reasoning trace, dan ringkasan multi-agent.',
  },
]

const accountNavigationItems = [
  {
    label: 'Profil',
    to: '/app/profile',
    icon: 'ri-user-3-line',
    eyebrow: 'Data profil',
    description: 'Perbarui identitas analis, workspace, dan deskripsi desk riset.',
  },
  {
    label: 'Email akun',
    to: '/app/account/email',
    icon: 'ri-mail-line',
    eyebrow: 'Keamanan email',
    description: 'Ganti alamat email akun secara aman dengan verifikasi kata sandi.',
  },
  {
    label: 'Kata sandi',
    to: '/app/account/password',
    icon: 'ri-lock-password-line',
    eyebrow: 'Keamanan kata sandi',
    description: 'Perbarui kata sandi akun pada halaman terpisah dari profil.',
  },
]

const navigationItems = [...mainNavigationItems, ...accountNavigationItems]

const activeView = computed(() => {
  return (
    navigationItems.find((item) => route.path === item.to) || {
      label: 'Workspace',
      short: 'WS',
      eyebrow: 'Research workspace',
      description: 'Meja riset untuk market, forecasting, explainability, dan trading.',
    }
  )
})

const displayName = computed(() => {
  const first = user.value?.profile?.first_name || ''
  const last = user.value?.profile?.last_name || ''
  const full = `${first} ${last}`.trim()
  return full || user.value?.email || 'Investor'
})

const workspaceDesk = computed(() => {
  return user.value?.workspace?.company_name || 'IDX30 Intelligence Desk'
})

const profileInitials = computed(() => {
  const source = displayName.value.split(' ').filter(Boolean)
  if (!source.length) return 'ID'
  if (source.length === 1) return source[0].slice(0, 2).toUpperCase()
  return `${source[0][0] || ''}${source[1][0] || ''}`.toUpperCase()
})

const topbarDate = computed(() => {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
})

const setTheme = (nextTheme) => {
  theme.value = nextTheme === 'light' ? 'light' : 'dark'
}

const onLogout = async () => {
  await logoutSession()
  await router.replace('/auth/login')
}

watch(
  () => route.path,
  () => {
    sidebarOpen.value = false
  },
)

watch(theme, (value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(themeStorageKey, value)
})

onMounted(() => {
  if (typeof window === 'undefined') return
  const storedTheme = window.localStorage.getItem(themeStorageKey)
  if (storedTheme === 'light' || storedTheme === 'dark') {
    theme.value = storedTheme
  }
})
</script>

<template>
  <div class="workspace-shell" :data-theme="theme">
    <button
      v-if="sidebarOpen"
      type="button"
      class="workspace-scrim"
      aria-label="Tutup navigasi"
      @click="sidebarOpen = false"
    />

    <aside :class="['workspace-sidebar', sidebarOpen ? 'is-open' : '']">
      <div class="workspace-sidebar__header">
        <div class="workspace-brand">
          <div class="workspace-brand__mark">ID</div>
          <div>
            <p class="workspace-brand__eyebrow">{{ workspaceDesk }}</p>
            <h2 class="workspace-brand__title">NusaForecastIDX</h2>
          </div>
        </div>

        <button type="button" class="workspace-close" aria-label="Tutup sidebar" @click="sidebarOpen = false">
          ×
        </button>
      </div>

      <div class="workspace-nav-group">
        <p class="workspace-nav-group__label">Menu utama</p>
        <nav class="workspace-nav">
          <RouterLink
            v-for="item in mainNavigationItems"
            :key="item.to"
            :to="item.to"
            :class="['workspace-nav__link', route.path === item.to ? 'is-active' : '']"
          >
            <span class="workspace-nav__badge">
              <i :class="item.icon" aria-hidden="true" />
            </span>
            <span>
              <strong>{{ item.label }}</strong>
              <small>{{ item.eyebrow }}</small>
            </span>
          </RouterLink>
        </nav>
      </div>

      <div class="workspace-nav-group">
        <p class="workspace-nav-group__label">Akun & preferensi</p>
        <nav class="workspace-nav">
          <RouterLink
            v-for="item in accountNavigationItems"
            :key="item.to"
            :to="item.to"
            :class="['workspace-nav__link', 'is-account-link', route.path === item.to ? 'is-active' : '']"
          >
            <span class="workspace-nav__badge">
              <i :class="item.icon" aria-hidden="true" />
            </span>
            <span>
              <strong>{{ item.label }}</strong>
              <small>{{ item.eyebrow }}</small>
            </span>
          </RouterLink>
        </nav>
      </div>

      <article class="workspace-status-card">
        <p class="workspace-status-card__eyebrow">Layanan aktif</p>
        <h3>Asisten Analisis Cerdas</h3>
        <p>
          Ringkasan pasar, proyeksi arah, dan kontrol risiko berjalan terpadu untuk membantu keputusan sesi harian.
        </p>
        <div class="workspace-status-card__meta">
          <span>Mode layanan</span>
          <strong>Standar cerdas</strong>
        </div>
      </article>

      <button type="button" class="workspace-logout" @click="onLogout">Keluar dari workspace</button>
    </aside>

    <main class="workspace-main">
      <header class="workspace-topbar">
        <div class="workspace-topbar__left">
          <button type="button" class="workspace-menu" aria-label="Buka sidebar" @click="sidebarOpen = true">
            ☰
          </button>
          <div>
            <p class="workspace-topbar__eyebrow">{{ activeView.eyebrow }}</p>
            <h1>{{ activeView.label }}</h1>
          </div>
        </div>

        <div class="workspace-topbar__right">
          <label class="workspace-search">
            <span>⌕</span>
            <input type="text" placeholder="Cari insight, ticker, atau agent..." />
          </label>

          <div class="workspace-theme-toggle" role="tablist" aria-label="Tema dashboard">
            <button
              type="button"
              :class="['workspace-theme-toggle__button', theme === 'dark' ? 'is-active' : '']"
              @click="setTheme('dark')"
            >
              Gelap
            </button>
            <button
              type="button"
              :class="['workspace-theme-toggle__button', theme === 'light' ? 'is-active' : '']"
              @click="setTheme('light')"
            >
              Terang
            </button>
          </div>

          <div class="workspace-user-pill">
            <div class="workspace-user-pill__avatar">{{ profileInitials }}</div>
            <div>
              <p>{{ displayName }}</p>
              <small>{{ topbarDate }}</small>
            </div>
          </div>
        </div>
      </header>

      <section class="workspace-stage">
        <div class="workspace-stage__intro">
          <div>
            <p class="workspace-stage__eyebrow">{{ activeView.description }}</p>
            <h2>{{ workspaceDesk }}</h2>
          </div>
          <p class="workspace-stage__hint">Mode default dashboard aktif di tema gelap dan bisa diganti kapan saja.</p>
        </div>

        <RouterView />
      </section>
    </main>

    <InformationCenterWidget />
  </div>
</template>
