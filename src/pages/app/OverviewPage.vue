<script setup>
import { computed } from 'vue'

import { useAuthSession } from '../../composables/useAuthSession'

const { user } = useAuthSession()

const displayName = computed(() => {
  const first = user.value?.profile?.first_name || ''
  const last = user.value?.profile?.last_name || ''
  const full = `${first} ${last}`.trim()
  return full || user.value?.email || 'Investor'
})
</script>

<template>
  <div class="page-grid">
    <article class="content-card spotlight">
      <p class="eyebrow">Workspace Overview</p>
      <h2>Hi, {{ displayName }}</h2>
      <p>
        Struktur frontend sudah dipisah ke layout + pages. Kamu tinggal isi logic tiap halaman tanpa menumpuk semua di
        `App.vue`.
      </p>
    </article>

    <article class="content-card">
      <h3>Profile</h3>
      <p>{{ user?.profile?.country || '-' }}</p>
      <p>{{ user?.profile?.phone_number || '-' }}</p>
      <p>{{ user?.profile?.bio || 'Belum ada bio.' }}</p>
    </article>

    <article class="content-card">
      <h3>Workspace</h3>
      <p>{{ user?.workspace?.company_name || '-' }}</p>
      <p>{{ user?.workspace?.job_title || '-' }}</p>
      <p>{{ user?.workspace?.team_name || '-' }}</p>
      <p>{{ user?.workspace?.investment_focus || '-' }}</p>
    </article>
  </div>
</template>
