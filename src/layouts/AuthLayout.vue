<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const isRegisterMode = computed(() => route.path.includes('/auth/register'))

const registerStep = computed(() => {
  const raw = Number(route.query.step || 1)
  if (Number.isNaN(raw)) return 1
  return Math.min(3, Math.max(1, raw))
})

const registerSteps = [
  {
    id: 1,
    title: 'Buat akun',
    description: 'Buat akses utama dengan email dan kata sandi.',
  },
  {
    id: 2,
    title: 'Siapkan workspace',
    description: 'Tambahkan posisi kerja, tim, dan fokus investasi.',
  },
  {
    id: 3,
    title: 'Profil analis',
    description: 'Atur identitas analis untuk personalisasi rekomendasi.',
  },
]

const loginHighlights = [
  {
    id: 1,
    title: 'Pantau pergerakan',
    description: 'Lihat ringkasan market IDX30 dan perubahan harga harian.',
  },
  {
    id: 2,
    title: 'Cek prediksi + XAI',
    description: 'Lihat hasil forecast dan penjelasan faktor utama model.',
  },
  {
    id: 3,
    title: 'Kelola strategi',
    description: 'Uji ide trading di paper account sebelum eksekusi nyata.',
  },
]
</script>

<template>
  <div class="auth-shell">
    <div class="market-glow glow-a"></div>
    <div class="market-glow glow-b"></div>
    <main class="auth-layout">
      <section class="brand-panel">
        <p class="eyebrow">IDX30 Intelligence Desk</p>
        <h1>
          {{
            isRegisterMode
              ? 'Bangun Workspace Riset Saham Kamu'
              : 'Masuk ke Meja Riset IDX30'
          }}
        </h1>
        <p class="brand-copy">
          {{
            isRegisterMode
              ? 'Daftar sekali, lalu susun profil analis, siapkan posisi kerja, dan mulai alur riset saham dengan proses yang rapi.'
              : 'Lanjutkan analisis yang sudah kamu mulai: pantau market, cek prediksi model, dan kelola strategi trading.'
          }}
        </p>

        <div class="steps-grid">
          <article
            v-for="step in (isRegisterMode ? registerSteps : loginHighlights)"
            :key="step.id"
            :class="[
              'step-card',
              isRegisterMode && step.id === registerStep ? 'active' : '',
              isRegisterMode && step.id < registerStep ? 'done' : '',
            ]"
          >
            <span>{{ step.id }}</span>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </article>
        </div>
      </section>

      <section class="form-panel">
        <RouterView />
      </section>
    </main>
  </div>
</template>
