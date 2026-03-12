<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { loginSession, registerSession } from '../../composables/useAuthSession'

const router = useRouter()
const route = useRoute()

const isSubmitting = ref(false)
const apiError = ref('')
const apiSuccess = ref('')
const registerStep = ref(1)

const registerStepMeta = {
  1: {
    headline: 'Buat Akun Utama',
    caption: 'Langkah 1 dari 3. Isi data akun untuk akses pertama ke workspace.',
  },
  2: {
    headline: 'Siapkan Workspace',
    caption: 'Langkah 2 dari 3. Tambahkan posisi kerja dan fokus investasi.',
  },
  3: {
    headline: 'Lengkapi Profil Analis',
    caption: 'Langkah 3 dari 3. Lengkapi identitas agar rekomendasi makin relevan.',
  },
}

const registerForm = reactive({
  email: '',
  password: '',
  confirm_password: '',
  description: '',
  profile: {
    first_name: '',
    last_name: '',
    phone_number: '',
    country: 'Indonesia',
    bio: '',
  },
  workspace: {
    company_name: '',
    job_title: '',
    team_name: '',
    years_of_experience: 1,
    investment_focus: 'IDX30 momentum dan portofolio berbasis manajemen risiko',
  },
})

const loginForm = reactive({
  credential: '',
  password: '',
})

const mode = computed(() => (route.path.includes('/auth/register') ? 'register' : 'login'))
const isRegister = computed(() => mode.value === 'register')
const currentStepMeta = computed(() => registerStepMeta[registerStep.value] || registerStepMeta[1])

const clearNotice = () => {
  apiError.value = ''
  apiSuccess.value = ''
}

const clampStep = (value) => {
  const next = Number(value || 1)
  if (Number.isNaN(next)) return 1
  return Math.min(3, Math.max(1, next))
}

const syncRegisterStepFromRoute = async () => {
  const current = clampStep(route.query.step)
  registerStep.value = current

  const queryStep = String(route.query.step || '')
  if (queryStep !== String(current)) {
    await router.replace({
      path: '/auth/register',
      query: { step: String(current) },
    })
  }
}

watch(
  () => route.fullPath,
  async () => {
    clearNotice()
    if (!isRegister.value) {
      registerStep.value = 1
      return
    }
    await syncRegisterStepFromRoute()
  },
  { immediate: true },
)

const setMode = async (value) => {
  if (value === mode.value) return

  clearNotice()

  if (value === 'register') {
    registerStep.value = 1
    await router.replace({
      path: '/auth/register',
      query: { step: '1' },
    })
    return
  }

  await router.replace('/auth/login')
}

const setRegisterStep = async (value) => {
  const next = clampStep(value)
  registerStep.value = next

  if (!isRegister.value) return
  await router.replace({
    path: '/auth/register',
    query: { step: String(next) },
  })
}

const validateRegisterStep = (step) => {
  if (step === 1) {
    if (
      !registerForm.profile.first_name.trim() ||
      !registerForm.profile.last_name.trim() ||
      !registerForm.email.trim() ||
      !registerForm.password ||
      !registerForm.confirm_password
    ) {
      apiError.value = 'Lengkapi nama, email, dan kata sandi di langkah 1.'
      return false
    }

    if (registerForm.password.length < 8) {
      apiError.value = 'Kata sandi minimal 8 karakter.'
      return false
    }

    if (registerForm.password !== registerForm.confirm_password) {
      apiError.value = 'Konfirmasi kata sandi belum sama.'
      return false
    }
  }

  if (step === 2) {
    if (
      !registerForm.workspace.company_name.trim() ||
      !registerForm.workspace.job_title.trim() ||
      !registerForm.workspace.team_name.trim()
    ) {
      apiError.value = 'Lengkapi perusahaan, jabatan, dan tim di langkah 2.'
      return false
    }
  }

  if (step === 3) {
    if (!registerForm.profile.country.trim()) {
      apiError.value = 'Negara pada langkah 3 wajib diisi.'
      return false
    }
  }

  return true
}

const goNextRegisterStep = async () => {
  clearNotice()
  if (!validateRegisterStep(registerStep.value)) return
  await setRegisterStep(registerStep.value + 1)
}

const goPreviousRegisterStep = async () => {
  clearNotice()
  await setRegisterStep(registerStep.value - 1)
}

const handleRegister = async () => {
  clearNotice()

  if (registerStep.value < 3) {
    await goNextRegisterStep()
    return
  }

  if (!validateRegisterStep(1)) {
    await setRegisterStep(1)
    return
  }
  if (!validateRegisterStep(2)) {
    await setRegisterStep(2)
    return
  }
  if (!validateRegisterStep(3)) {
    await setRegisterStep(3)
    return
  }

  isSubmitting.value = true

  try {
    await registerSession({
      email: registerForm.email,
      password: registerForm.password,
      confirm_password: registerForm.confirm_password,
      description: registerForm.description,
      profile: {
        first_name: registerForm.profile.first_name,
        last_name: registerForm.profile.last_name,
        phone_number: registerForm.profile.phone_number,
        country: registerForm.profile.country,
        bio: registerForm.profile.bio,
      },
      workspace: {
        company_name: registerForm.workspace.company_name,
        job_title: registerForm.workspace.job_title,
        team_name: registerForm.workspace.team_name,
        years_of_experience: Number(registerForm.workspace.years_of_experience || 0),
        investment_focus: registerForm.workspace.investment_focus,
      },
    })
    apiSuccess.value = 'Akun berhasil dibuat. Mengarahkan ke workspace...'
    await router.replace('/app/overview')
  } catch (err) {
    apiError.value = err?.message || 'Gagal membuat akun.'
  } finally {
    isSubmitting.value = false
  }
}

const handleLogin = async () => {
  clearNotice()
  isSubmitting.value = true

  try {
    await loginSession({
      credential: loginForm.credential,
      password: loginForm.password,
    })
    apiSuccess.value = 'Login berhasil. Mengarahkan ke workspace...'
    await router.replace('/app/overview')
  } catch (err) {
    apiError.value = err?.message || 'Gagal login.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div>
    <div class="auth-toggle" role="tablist" aria-label="Mode autentikasi">
      <button
        type="button"
        :class="['toggle-button', mode === 'register' ? 'active' : '']"
        @click="setMode('register')"
      >
        Daftar
      </button>
      <button
        type="button"
        :class="['toggle-button', mode === 'login' ? 'active' : '']"
        @click="setMode('login')"
      >
        Masuk
      </button>
    </div>

    <header class="form-head">
      <h2>{{ isRegister ? currentStepMeta.headline : 'Selamat Datang Kembali Trader' }}</h2>
      <p>
        {{
          isRegister
            ? currentStepMeta.caption
            : 'Masuk dengan akun yang sudah terdaftar untuk lanjut ke workspace riset kamu.'
        }}
      </p>
    </header>

    <div class="social-grid">
      <button type="button" class="ghost-button" disabled>Google (Segera)</button>
      <button type="button" class="ghost-button" disabled>GitHub (Segera)</button>
    </div>

    <p class="divider"><span>atau lanjut manual</span></p>

    <p v-if="apiError" class="notice error">{{ apiError }}</p>
    <p v-if="apiSuccess" class="notice success">{{ apiSuccess }}</p>

    <form v-if="isRegister" class="form-grid" @submit.prevent="handleRegister">
      <div class="register-stepper">
        <button
          type="button"
          :class="['step-pill', registerStep === 1 ? 'active' : '', registerStep > 1 ? 'done' : '']"
          @click="setRegisterStep(1)"
        >
          1. Akun
        </button>
        <button
          type="button"
          :class="['step-pill', registerStep === 2 ? 'active' : '', registerStep > 2 ? 'done' : '']"
          @click="setRegisterStep(2)"
        >
          2. Workspace
        </button>
        <button
          type="button"
          :class="['step-pill', registerStep === 3 ? 'active' : '']"
          @click="setRegisterStep(3)"
        >
          3. Profil
        </button>
      </div>

      <template v-if="registerStep === 1">
        <label class="field">
          <span>Nama depan</span>
          <input v-model="registerForm.profile.first_name" type="text" placeholder="Raka" required />
        </label>

        <label class="field">
          <span>Nama belakang</span>
          <input v-model="registerForm.profile.last_name" type="text" placeholder="Analis" required />
        </label>

        <label class="field full">
          <span>Email</span>
          <input v-model="registerForm.email" type="email" placeholder="nama@desk-saham.com" required />
        </label>

        <label class="field">
          <span>Kata sandi</span>
          <input v-model="registerForm.password" type="password" placeholder="Minimal 8 karakter" required />
        </label>

        <label class="field">
          <span>Konfirmasi kata sandi</span>
          <input
            v-model="registerForm.confirm_password"
            type="password"
            placeholder="Ulangi kata sandi"
            required
          />
        </label>
      </template>

      <template v-if="registerStep === 2">
        <label class="field">
          <span>Perusahaan</span>
          <input v-model="registerForm.workspace.company_name" type="text" placeholder="IDX Quant Lab" required />
        </label>

        <label class="field">
          <span>Jabatan</span>
          <input v-model="registerForm.workspace.job_title" type="text" placeholder="Research Analyst" required />
        </label>

        <label class="field">
          <span>Tim</span>
          <input v-model="registerForm.workspace.team_name" type="text" placeholder="Alpha Desk" required />
        </label>

        <label class="field">
          <span>Pengalaman (Tahun)</span>
          <input v-model.number="registerForm.workspace.years_of_experience" type="number" min="0" max="60" />
        </label>

        <label class="field full">
          <span>Fokus investasi</span>
          <input
            v-model="registerForm.workspace.investment_focus"
            type="text"
            placeholder="IDX30 momentum, valuasi, risk-adjusted"
          />
        </label>
      </template>

      <template v-if="registerStep === 3">
        <label class="field">
          <span>Negara</span>
          <input v-model="registerForm.profile.country" type="text" placeholder="Indonesia" required />
        </label>

        <label class="field">
          <span>Nomor telepon</span>
          <input v-model="registerForm.profile.phone_number" type="text" placeholder="+62..." />
        </label>

        <label class="field full">
          <span>Bio trading</span>
          <textarea
            v-model="registerForm.profile.bio"
            rows="2"
            placeholder="Contoh: Fokus swing trade 3-10 hari dengan disiplin stop loss"
          ></textarea>
        </label>

        <label class="field full">
          <span>Deskripsi workspace</span>
          <textarea
            v-model="registerForm.description"
            rows="2"
            placeholder="Tujuan workspace ini untuk riset model dan eksekusi strategi"
          ></textarea>
        </label>

        <div class="field full">
          <span>Ringkasan data</span>
          <div class="review-box">
            <p><strong>Akun:</strong> {{ registerForm.profile.first_name }} {{ registerForm.profile.last_name }}</p>
            <p><strong>Email:</strong> {{ registerForm.email }}</p>
            <p>
              <strong>Workspace:</strong>
              {{ registerForm.workspace.company_name }} · {{ registerForm.workspace.job_title }}
            </p>
            <p><strong>Tim:</strong> {{ registerForm.workspace.team_name }}</p>
          </div>
        </div>
      </template>

      <div class="form-actions">
        <button
          v-if="registerStep > 1"
          type="button"
          class="secondary-button"
          :disabled="isSubmitting"
          @click="goPreviousRegisterStep"
        >
          Sebelumnya
        </button>

        <button
          v-if="registerStep < 3"
          type="button"
          class="secondary-button primary"
          :disabled="isSubmitting"
          @click="goNextRegisterStep"
        >
          Lanjut
        </button>

        <button v-else class="submit-button" type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'Membuat Akun...' : 'Daftar dan Masuk Workspace' }}
        </button>
      </div>

      <p class="switch-text">
        Sudah punya akun?
        <button type="button" class="text-button" @click="setMode('login')">Masuk sekarang</button>
      </p>
    </form>

    <form v-else class="form-grid" @submit.prevent="handleLogin">
      <label class="field full">
        <span>Email atau kredensial</span>
        <input
          v-model="loginForm.credential"
          type="text"
          placeholder="nama@desk-saham.com"
          autocomplete="username"
          required
        />
      </label>

      <label class="field full">
        <span>Kata sandi</span>
        <input
          v-model="loginForm.password"
          type="password"
          placeholder="Masukkan kata sandi"
          autocomplete="current-password"
          required
        />
      </label>

      <button class="submit-button" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? 'Memproses...' : 'Masuk ke Workspace' }}
      </button>

      <p class="switch-text">
        Belum punya akun?
        <button type="button" class="text-button" @click="setMode('register')">Daftar sekarang</button>
      </p>
    </form>
  </div>
</template>
