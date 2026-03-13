<script setup>
import { reactive, ref } from 'vue'

import { refreshSession, useAuthSession } from '../../composables/useAuthSession'
import { backendApi } from '../../services/backendApi'

const { user } = useAuthSession()

const isSubmitting = ref(false)
const noticeError = ref('')
const noticeSuccess = ref('')

const form = reactive({
  current_password: '',
  new_email: '',
  confirm_new_email: '',
})

const clearNotice = () => {
  noticeError.value = ''
  noticeSuccess.value = ''
}

const resetForm = () => {
  form.current_password = ''
  form.new_email = ''
  form.confirm_new_email = ''
}

const handleSubmit = async () => {
  clearNotice()
  isSubmitting.value = true

  try {
    await backendApi.updateEmail({
      current_password: form.current_password,
      new_email: form.new_email,
      confirm_new_email: form.confirm_new_email,
    })
    await refreshSession()
    noticeSuccess.value = 'Email akun berhasil diperbarui dan session sudah disegarkan.'
    resetForm()
  } catch (error) {
    noticeError.value = error?.message || 'Gagal memperbarui email akun.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <section class="settings-hero">
      <div>
        <p class="settings-kicker">Email akun</p>
        <h1>Ganti alamat email secara terpisah</h1>
        <p class="settings-copy">
          Perubahan email dipisah dari profil agar sistem bisa melakukan validasi ulang kata sandi dan menyegarkan
          session cookie tanpa mengganggu pengisian data workspace.
        </p>
      </div>

      <aside class="settings-side-note">
        <span>Email aktif</span>
        <strong>{{ user?.email || '-' }}</strong>
        <small>Session akan diperbarui setelah email berhasil diganti.</small>
      </aside>
    </section>

    <section class="settings-grid settings-grid--single">
      <form class="settings-panel settings-form" @submit.prevent="handleSubmit">
        <div class="settings-panel__head">
          <div>
            <p class="settings-kicker">Verifikasi kredensial</p>
            <h2>Ubah email akun</h2>
          </div>
        </div>

        <p v-if="noticeError" class="settings-notice is-error">{{ noticeError }}</p>
        <p v-if="noticeSuccess" class="settings-notice is-success">{{ noticeSuccess }}</p>

        <div class="settings-form-grid">
          <label class="settings-field settings-field--full">
            <span>Email saat ini</span>
            <input :value="user?.email || '-'" type="email" disabled />
          </label>

          <label class="settings-field settings-field--full">
            <span>Kata sandi saat ini</span>
            <input v-model="form.current_password" type="password" placeholder="Masukkan kata sandi sekarang" required />
          </label>

          <label class="settings-field">
            <span>Email baru</span>
            <input v-model="form.new_email" type="email" placeholder="nama-baru@desk-saham.com" required />
          </label>

          <label class="settings-field">
            <span>Konfirmasi email baru</span>
            <input
              v-model="form.confirm_new_email"
              type="email"
              placeholder="Ulangi email baru"
              required
            />
          </label>
        </div>

        <div class="settings-actions">
          <button type="submit" class="settings-primary-button" :disabled="isSubmitting">
            {{ isSubmitting ? 'Memproses...' : 'Simpan email baru' }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
