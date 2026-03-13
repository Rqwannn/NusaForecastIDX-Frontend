<script setup>
import { reactive, ref } from 'vue'

import { refreshSession } from '../../composables/useAuthSession'
import { backendApi } from '../../services/backendApi'

const isSubmitting = ref(false)
const noticeError = ref('')
const noticeSuccess = ref('')

const form = reactive({
  current_password: '',
  new_password: '',
  confirm_new_password: '',
})

const clearNotice = () => {
  noticeError.value = ''
  noticeSuccess.value = ''
}

const resetForm = () => {
  form.current_password = ''
  form.new_password = ''
  form.confirm_new_password = ''
}

const handleSubmit = async () => {
  clearNotice()
  isSubmitting.value = true

  try {
    await backendApi.updatePassword({
      current_password: form.current_password,
      new_password: form.new_password,
      confirm_new_password: form.confirm_new_password,
    })
    await refreshSession()
    noticeSuccess.value = 'Kata sandi berhasil diperbarui dan session tetap aktif.'
    resetForm()
  } catch (error) {
    noticeError.value = error?.message || 'Gagal memperbarui kata sandi.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <section class="settings-hero">
      <div>
        <p class="settings-kicker">Keamanan akun</p>
        <h1>Perbarui kata sandi di halaman tersendiri</h1>
        <p class="settings-copy">
          Halaman ini hanya menangani perubahan kata sandi. Dengan pemisahan ini, alur keamanan akun tetap rapi dan
          tidak bercampur dengan pengisian profil maupun workspace.
        </p>
      </div>

      <aside class="settings-side-note">
        <span>Standar minimum</span>
        <strong>8 karakter</strong>
        <small>Gunakan kombinasi huruf besar, kecil, angka, dan simbol.</small>
      </aside>
    </section>

    <section class="settings-grid settings-grid--single">
      <form class="settings-panel settings-form" @submit.prevent="handleSubmit">
        <div class="settings-panel__head">
          <div>
            <p class="settings-kicker">Validasi password</p>
            <h2>Ganti kata sandi akun</h2>
          </div>
        </div>

        <p v-if="noticeError" class="settings-notice is-error">{{ noticeError }}</p>
        <p v-if="noticeSuccess" class="settings-notice is-success">{{ noticeSuccess }}</p>

        <div class="settings-form-grid">
          <label class="settings-field settings-field--full">
            <span>Kata sandi saat ini</span>
            <input v-model="form.current_password" type="password" placeholder="Masukkan kata sandi saat ini" required />
          </label>

          <label class="settings-field">
            <span>Kata sandi baru</span>
            <input v-model="form.new_password" type="password" placeholder="Minimal 8 karakter" required />
          </label>

          <label class="settings-field">
            <span>Konfirmasi kata sandi baru</span>
            <input
              v-model="form.confirm_new_password"
              type="password"
              placeholder="Ulangi kata sandi baru"
              required
            />
          </label>
        </div>

        <div class="settings-actions">
          <button type="submit" class="settings-primary-button" :disabled="isSubmitting">
            {{ isSubmitting ? 'Memproses...' : 'Simpan kata sandi baru' }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
