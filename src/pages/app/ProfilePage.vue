<script setup>
import { reactive, ref, watch } from 'vue'

import { refreshSession, useAuthSession } from '../../composables/useAuthSession'
import { backendApi } from '../../services/backendApi'

const { user } = useAuthSession()

const isSubmitting = ref(false)
const noticeError = ref('')
const noticeSuccess = ref('')

const form = reactive({
  description: '',
  profile: {
    first_name: '',
    last_name: '',
    phone_number: '',
    country: '',
    bio: '',
  },
  workspace: {
    company_name: '',
    job_title: '',
    team_name: '',
    years_of_experience: '',
    investment_focus: '',
  },
})

const hydrateForm = () => {
  form.description = user.value?.description || ''
  form.profile.first_name = user.value?.profile?.first_name || ''
  form.profile.last_name = user.value?.profile?.last_name || ''
  form.profile.phone_number = user.value?.profile?.phone_number || ''
  form.profile.country = user.value?.profile?.country || ''
  form.profile.bio = user.value?.profile?.bio || ''
  form.workspace.company_name = user.value?.workspace?.company_name || ''
  form.workspace.job_title = user.value?.workspace?.job_title || ''
  form.workspace.team_name = user.value?.workspace?.team_name || ''
  form.workspace.years_of_experience = user.value?.workspace?.years_of_experience ?? ''
  form.workspace.investment_focus = user.value?.workspace?.investment_focus || ''
}

watch(user, hydrateForm, { immediate: true })

const clearNotice = () => {
  noticeError.value = ''
  noticeSuccess.value = ''
}

const handleSubmit = async () => {
  clearNotice()
  isSubmitting.value = true

  try {
    await backendApi.updateProfile({
      description: form.description,
      profile: {
        first_name: form.profile.first_name,
        last_name: form.profile.last_name,
        phone_number: form.profile.phone_number,
        country: form.profile.country,
        bio: form.profile.bio,
      },
      workspace: {
        company_name: form.workspace.company_name,
        job_title: form.workspace.job_title,
        team_name: form.workspace.team_name,
        years_of_experience:
          form.workspace.years_of_experience === '' ? null : Number(form.workspace.years_of_experience),
        investment_focus: form.workspace.investment_focus,
      },
    })
    await refreshSession()
    noticeSuccess.value = 'Profil dan workspace berhasil diperbarui.'
  } catch (error) {
    noticeError.value = error?.message || 'Gagal memperbarui profil.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <section class="settings-hero">
      <div>
        <p class="settings-kicker">Profil analis</p>
        <h1>Perbarui identitas kerja dan workspace</h1>
        <p class="settings-copy">
          Halaman ini khusus untuk data profil, deskripsi desk, dan setup workspace. Perubahan email dan kata sandi
          dipisah ke halaman lain agar alurnya lebih aman.
        </p>
      </div>

      <aside class="settings-side-note">
        <span>Scope halaman</span>
        <strong>Profil + workspace</strong>
        <small>Tanpa perubahan email dan kata sandi.</small>
      </aside>
    </section>

    <section class="settings-grid">
      <form class="settings-panel settings-form" @submit.prevent="handleSubmit">
        <div class="settings-panel__head">
          <div>
            <p class="settings-kicker">Data personal</p>
            <h2>Identitas analis</h2>
          </div>
        </div>

        <p v-if="noticeError" class="settings-notice is-error">{{ noticeError }}</p>
        <p v-if="noticeSuccess" class="settings-notice is-success">{{ noticeSuccess }}</p>

        <div class="settings-form-grid">
          <label class="settings-field">
            <span>Nama depan</span>
            <input v-model="form.profile.first_name" type="text" placeholder="Raqwan" />
          </label>

          <label class="settings-field">
            <span>Nama belakang</span>
            <input v-model="form.profile.last_name" type="text" placeholder="Analis" />
          </label>

          <label class="settings-field">
            <span>Nomor telepon</span>
            <input v-model="form.profile.phone_number" type="text" placeholder="0812xxxxxxx" />
          </label>

          <label class="settings-field">
            <span>Negara</span>
            <input v-model="form.profile.country" type="text" placeholder="Indonesia" />
          </label>

          <label class="settings-field settings-field--full">
            <span>Bio analis</span>
            <textarea
              v-model="form.profile.bio"
              rows="4"
              placeholder="Tuliskan fokus analis, pendekatan riset, atau mandat kerja kamu."
            />
          </label>

          <label class="settings-field settings-field--full">
            <span>Deskripsi workspace</span>
            <textarea
              v-model="form.description"
              rows="4"
              placeholder="Contoh: workspace ini digunakan untuk riset forecasting IDX30, validasi SHAP, dan simulasi trading."
            />
          </label>
        </div>

        <div class="settings-panel__head settings-panel__subhead">
          <div>
            <p class="settings-kicker">Workspace setup</p>
            <h2>Posisi dan konteks kerja</h2>
          </div>
        </div>

        <div class="settings-form-grid">
          <label class="settings-field">
            <span>Perusahaan / institusi</span>
            <input v-model="form.workspace.company_name" type="text" placeholder="IDX Quant Lab" />
          </label>

          <label class="settings-field">
            <span>Jabatan</span>
            <input v-model="form.workspace.job_title" type="text" placeholder="Research Analyst" />
          </label>

          <label class="settings-field">
            <span>Tim / desk</span>
            <input v-model="form.workspace.team_name" type="text" placeholder="Alpha Desk" />
          </label>

          <label class="settings-field">
            <span>Pengalaman (tahun)</span>
            <input v-model="form.workspace.years_of_experience" type="number" min="0" max="60" placeholder="3" />
          </label>

          <label class="settings-field settings-field--full">
            <span>Fokus investasi</span>
            <textarea
              v-model="form.workspace.investment_focus"
              rows="3"
              placeholder="Contoh: IDX30 swing trading, tactical allocation, dan risk-managed execution."
            />
          </label>
        </div>

        <div class="settings-actions">
          <button type="submit" class="settings-primary-button" :disabled="isSubmitting">
            {{ isSubmitting ? 'Menyimpan...' : 'Simpan perubahan profil' }}
          </button>
        </div>
      </form>

      <aside class="settings-panel settings-summary">
        <div class="settings-panel__head">
          <div>
            <p class="settings-kicker">Ringkasan aktif</p>
            <h2>Snapshot profil saat ini</h2>
          </div>
        </div>

        <div class="settings-summary-list">
          <div>
            <span>Nama aktif</span>
            <strong>{{ user?.profile?.first_name || '-' }} {{ user?.profile?.last_name || '' }}</strong>
          </div>
          <div>
            <span>Email akun</span>
            <strong>{{ user?.email || '-' }}</strong>
          </div>
          <div>
            <span>Jabatan</span>
            <strong>{{ user?.workspace?.job_title || '-' }}</strong>
          </div>
          <div>
            <span>Perusahaan</span>
            <strong>{{ user?.workspace?.company_name || '-' }}</strong>
          </div>
          <div>
            <span>Fokus desk</span>
            <strong>{{ user?.workspace?.investment_focus || '-' }}</strong>
          </div>
        </div>

        <div class="settings-divider" />

        <div class="settings-summary-note">
          <p class="settings-kicker">Kenapa dipisah?</p>
          <p>
            Email dan kata sandi dipindahkan ke halaman tersendiri agar perubahan identitas dan perubahan kredensial
            tidak bercampur dalam satu form.
          </p>
        </div>
      </aside>
    </section>
  </div>
</template>
