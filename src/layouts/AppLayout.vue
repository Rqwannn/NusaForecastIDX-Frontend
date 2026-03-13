<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { logoutSession, useAuthSession } from '../composables/useAuthSession'

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
    short: 'OV',
    eyebrow: 'Executive overview',
    description: 'Ringkasan kondisi market, model, dan prioritas riset harian.',
  },
  {
    label: 'Market',
    to: '/app/market',
    short: 'MK',
    eyebrow: 'Market watch',
    description: 'Pantau breadth IDX30, quote, dan konteks pasar terkini.',
  },
  {
    label: 'Forecast',
    to: '/app/forecast',
    short: 'FC',
    eyebrow: 'Forecast lab',
    description: 'Buka sinyal prediksi, confidence score, dan perbandingan model.',
  },
  {
    label: 'Trading',
    to: '/app/trading',
    short: 'TR',
    eyebrow: 'Paper strategy',
    description: 'Kelola simulasi order, posisi, dan disiplin eksekusi strategi.',
  },
  {
    label: 'Agentic',
    to: '/app/agentic',
    short: 'AI',
    eyebrow: 'Agentic orchestration',
    description: 'Pantau respons ReAct, reasoning trace, dan ringkasan multi-agent.',
  },
]

const accountNavigationItems = [
  {
    label: 'Profil',
    to: '/app/profile',
    short: 'PF',
    eyebrow: 'Profile settings',
    description: 'Perbarui identitas analis, workspace, dan deskripsi desk riset.',
  },
  {
    label: 'Email akun',
    to: '/app/account/email',
    short: 'EM',
    eyebrow: 'Email security',
    description: 'Ganti alamat email akun secara aman dengan verifikasi kata sandi.',
  },
  {
    label: 'Kata sandi',
    to: '/app/account/password',
    short: 'PW',
    eyebrow: 'Password security',
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

const workspaceRole = computed(() => {
  return user.value?.workspace?.job_title || 'Research Analyst'
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
            <h2 class="workspace-brand__title">Research Workspace</h2>
          </div>
        </div>

        <button type="button" class="workspace-close" aria-label="Tutup sidebar" @click="sidebarOpen = false">
          ×
        </button>
      </div>

      <section class="workspace-profile-card">
        <div class="workspace-profile-card__avatar">{{ profileInitials }}</div>
        <div>
          <p class="workspace-profile-card__name">{{ displayName }}</p>
          <p class="workspace-profile-card__role">{{ workspaceRole }}</p>
        </div>
      </section>

      <div class="workspace-nav-group">
        <p class="workspace-nav-group__label">Menu utama</p>
        <nav class="workspace-nav">
          <RouterLink
            v-for="item in mainNavigationItems"
            :key="item.to"
            :to="item.to"
            :class="['workspace-nav__link', route.path === item.to ? 'is-active' : '']"
          >
            <span class="workspace-nav__badge">{{ item.short }}</span>
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
            :class="['workspace-nav__link', route.path === item.to ? 'is-active' : '']"
          >
            <span class="workspace-nav__badge">{{ item.short }}</span>
            <span>
              <strong>{{ item.label }}</strong>
              <small>{{ item.eyebrow }}</small>
            </span>
          </RouterLink>
        </nav>
      </div>

      <article class="workspace-status-card">
        <p class="workspace-status-card__eyebrow">Mesin aktif</p>
        <h3>ReAct + Multi-Agent</h3>
        <p>
          Orkestrasi riset memakai agent market, forecast, XAI, dan risk dengan narasi LLM per agent.
        </p>
        <div class="workspace-status-card__meta">
          <span>Default model</span>
          <strong>o4-mini</strong>
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
  </div>
</template>

<style scoped>
.workspace-shell {
  --ws-bg: #07110f;
  --ws-bg-soft: #0b1714;
  --ws-panel: rgba(13, 21, 19, 0.92);
  --ws-panel-strong: rgba(16, 26, 23, 0.97);
  --ws-panel-alt: rgba(19, 31, 27, 0.96);
  --ws-card: rgba(15, 24, 21, 0.96);
  --ws-card-muted: rgba(17, 27, 24, 0.92);
  --ws-line: rgba(148, 171, 160, 0.18);
  --ws-line-strong: rgba(148, 171, 160, 0.3);
  --ws-text: #f4f7f6;
  --ws-text-soft: #b7c2bd;
  --ws-text-dim: #879690;
  --ws-accent: #1f7a5a;
  --ws-accent-strong: #2d916d;
  --ws-accent-soft: rgba(45, 145, 109, 0.16);
  --ws-shadow: 0 28px 60px rgba(2, 7, 6, 0.28);
  min-height: 100vh;
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  gap: 18px;
  padding: 18px;
  background:
    radial-gradient(circle at top left, rgba(45, 145, 109, 0.1), transparent 22%),
    linear-gradient(180deg, var(--ws-bg), var(--ws-bg-soft));
  color: var(--ws-text);
}

.workspace-shell[data-theme='light'] {
  --ws-bg: #eef3ef;
  --ws-bg-soft: #e4ebe6;
  --ws-panel: rgba(255, 255, 255, 0.94);
  --ws-panel-strong: rgba(252, 254, 253, 0.98);
  --ws-panel-alt: rgba(245, 248, 246, 0.98);
  --ws-card: rgba(255, 255, 255, 0.98);
  --ws-card-muted: rgba(244, 247, 245, 0.98);
  --ws-line: rgba(88, 111, 100, 0.14);
  --ws-line-strong: rgba(88, 111, 100, 0.22);
  --ws-text: #16211c;
  --ws-text-soft: #586760;
  --ws-text-dim: #71817a;
  --ws-accent: #19694e;
  --ws-accent-strong: #14533d;
  --ws-accent-soft: rgba(25, 105, 78, 0.1);
  --ws-shadow: 0 20px 46px rgba(59, 84, 73, 0.12);
}

.workspace-sidebar,
.workspace-stage,
.workspace-topbar {
  border: 1px solid var(--ws-line);
  box-shadow: var(--ws-shadow);
}

.workspace-sidebar {
  position: relative;
  z-index: 4;
  display: grid;
  grid-template-rows: auto auto auto 1fr auto;
  gap: 18px;
  padding: 18px;
  border-radius: 28px;
  background: var(--ws-panel);
  backdrop-filter: blur(14px);
}

.workspace-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workspace-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.workspace-brand__mark,
.workspace-profile-card__avatar,
.workspace-user-pill__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 16px;
  background: rgba(15, 36, 28, 0.95);
  color: #ebf5f1;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.workspace-shell[data-theme='light'] .workspace-brand__mark,
.workspace-shell[data-theme='light'] .workspace-profile-card__avatar,
.workspace-shell[data-theme='light'] .workspace-user-pill__avatar {
  background: #183427;
  color: #f3f6f4;
}

.workspace-brand__mark {
  width: 48px;
  height: 48px;
}

.workspace-brand__eyebrow,
.workspace-topbar__eyebrow,
.workspace-stage__eyebrow,
.workspace-nav-group__label,
.workspace-status-card__eyebrow {
  margin: 0;
  color: var(--ws-text-dim);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.workspace-brand__title {
  margin-top: 4px;
  font-size: 1.15rem;
}

.workspace-close,
.workspace-menu {
  display: none;
  border: 1px solid var(--ws-line);
  background: var(--ws-card);
  color: var(--ws-text);
  border-radius: 14px;
  width: 42px;
  height: 42px;
  cursor: pointer;
}

.workspace-profile-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--ws-line);
  border-radius: 22px;
  background: var(--ws-card);
}

.workspace-profile-card__avatar,
.workspace-user-pill__avatar {
  width: 44px;
  height: 44px;
}

.workspace-profile-card__name,
.workspace-user-pill p {
  margin: 0;
  font-weight: 800;
}

.workspace-profile-card__role,
.workspace-user-pill small,
.workspace-stage__hint {
  margin: 4px 0 0;
  color: var(--ws-text-soft);
}

.workspace-nav-group {
  display: grid;
  gap: 10px;
}

.workspace-nav {
  display: grid;
  gap: 10px;
}

.workspace-nav__link {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-radius: 18px;
  text-decoration: none;
  color: inherit;
  border: 1px solid transparent;
  background: transparent;
  transition:
    border-color 0.22s ease,
    background-color 0.22s ease,
    transform 0.22s ease;
}

.workspace-nav__link:hover,
.workspace-nav__link.is-active {
  background: var(--ws-accent-soft);
  border-color: var(--ws-line-strong);
  transform: translateX(2px);
}

.workspace-nav__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: 1px solid var(--ws-line);
  background: var(--ws-card-muted);
  color: var(--ws-text-soft);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.workspace-nav__link strong {
  display: block;
  font-size: 0.98rem;
}

.workspace-nav__link small {
  display: block;
  margin-top: 3px;
  color: var(--ws-text-dim);
}

.workspace-status-card {
  align-self: end;
  display: grid;
  gap: 10px;
  padding: 16px;
  border-radius: 22px;
  background: var(--ws-panel-alt);
  border: 1px solid var(--ws-line);
}

.workspace-status-card h3 {
  font-size: 1.05rem;
}

.workspace-status-card p {
  color: var(--ws-text-soft);
  line-height: 1.6;
}

.workspace-status-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--ws-line);
  color: var(--ws-text-dim);
  font-size: 0.88rem;
}

.workspace-status-card__meta strong {
  color: var(--ws-text);
}

.workspace-logout {
  border: 1px solid rgba(205, 91, 91, 0.26);
  border-radius: 16px;
  background: rgba(128, 43, 43, 0.1);
  color: #f4d0d0;
  font-weight: 700;
  padding: 12px 14px;
  cursor: pointer;
}

.workspace-shell[data-theme='light'] .workspace-logout {
  background: rgba(163, 63, 63, 0.08);
  color: #7b2929;
}

.workspace-main {
  min-width: 0;
  display: grid;
  gap: 16px;
  align-content: start;
}

.workspace-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
  border-radius: 28px;
  background: var(--ws-panel);
}

.workspace-topbar__left,
.workspace-topbar__right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.workspace-topbar h1 {
  font-size: clamp(1.35rem, 2vw, 1.85rem);
}

.workspace-search {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: min(360px, 36vw);
  padding: 0 14px;
  height: 46px;
  border-radius: 16px;
  border: 1px solid var(--ws-line);
  background: var(--ws-card);
  color: var(--ws-text-dim);
}

.workspace-search input {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--ws-text);
}

.workspace-search input::placeholder {
  color: var(--ws-text-dim);
}

.workspace-theme-toggle {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 4px;
  border-radius: 16px;
  border: 1px solid var(--ws-line);
  background: var(--ws-card);
}

.workspace-theme-toggle__button {
  border: 0;
  background: transparent;
  color: var(--ws-text-dim);
  border-radius: 12px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
}

.workspace-theme-toggle__button.is-active {
  background: var(--ws-accent-soft);
  color: var(--ws-text);
}

.workspace-user-pill {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px 6px 6px;
  border-radius: 18px;
  border: 1px solid var(--ws-line);
  background: var(--ws-card);
}

.workspace-stage {
  display: grid;
  gap: 18px;
  padding: 18px;
  border-radius: 30px;
  background: var(--ws-panel-strong);
}

.workspace-stage__intro {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 2px;
}

.workspace-stage__intro h2 {
  margin-top: 4px;
  font-size: clamp(1.15rem, 1.8vw, 1.5rem);
}

.workspace-stage__hint {
  max-width: 34ch;
  font-size: 0.92rem;
  line-height: 1.6;
  text-align: right;
}

.workspace-scrim {
  position: fixed;
  inset: 0;
  z-index: 3;
  border: 0;
  background: rgba(3, 6, 5, 0.48);
}

@media (max-width: 1220px) {
  .workspace-shell {
    grid-template-columns: 1fr;
  }

  .workspace-sidebar {
    position: fixed;
    inset: 16px auto 16px 16px;
    width: min(320px, calc(100vw - 32px));
    transform: translateX(-120%);
    transition: transform 0.26s ease;
  }

  .workspace-sidebar.is-open {
    transform: translateX(0);
  }

  .workspace-close,
  .workspace-menu {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}

@media (max-width: 960px) {
  .workspace-topbar,
  .workspace-stage__intro {
    flex-direction: column;
    align-items: stretch;
  }

  .workspace-topbar__right {
    width: 100%;
    flex-wrap: wrap;
  }

  .workspace-search {
    min-width: 0;
    width: 100%;
  }

  .workspace-stage__hint {
    max-width: none;
    text-align: left;
  }
}

@media (max-width: 720px) {
  .workspace-shell {
    padding: 12px;
    gap: 12px;
  }

  .workspace-topbar,
  .workspace-stage,
  .workspace-sidebar {
    padding: 14px;
    border-radius: 24px;
  }

  .workspace-topbar__right {
    display: grid;
    grid-template-columns: 1fr;
  }

  .workspace-theme-toggle,
  .workspace-user-pill {
    width: 100%;
  }
}
</style>
