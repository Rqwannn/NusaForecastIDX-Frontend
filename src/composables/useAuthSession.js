import { computed, ref } from 'vue'

import { backendApi } from '../services/backendApi'
import { clearAuthToken, getAuthToken, setAuthToken } from '../services/httpClient'

const SESSION_STORAGE_KEY = 'idx30_auth_session'

const session = ref(null)
const initialized = ref(false)

const normalizeSession = (payload) => {
  if (!payload?.token?.access_token || !payload?.user) return null
  return {
    user: payload.user,
    token: payload.token,
  }
}

const persistSession = (payload) => {
  const normalized = normalizeSession(payload)
  if (!normalized) {
    clearSession()
    return null
  }

  session.value = normalized
  setAuthToken(normalized.token.access_token)

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalized))
  }

  return normalized
}

export const initAuthSession = () => {
  if (initialized.value) return
  initialized.value = true

  if (typeof window === 'undefined') return

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) {
    if (!getAuthToken()) clearAuthToken()
    return
  }

  try {
    const parsed = JSON.parse(raw)
    const normalized = normalizeSession(parsed)
    if (!normalized) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
      clearAuthToken()
      return
    }

    session.value = normalized
    setAuthToken(normalized.token.access_token)
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    clearAuthToken()
  }
}

export const clearSession = () => {
  session.value = null
  clearAuthToken()
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  }
}

export const loginSession = async ({ credential, password }) => {
  const payload = await backendApi.login({ credential, password })
  return persistSession(payload)
}

export const registerSession = async (registerPayload) => {
  const payload = await backendApi.register(registerPayload)
  return persistSession(payload)
}

export const hasActiveSession = () => Boolean(session.value?.token?.access_token)

export const useAuthSession = () => {
  const isAuthenticated = computed(() => hasActiveSession())
  const user = computed(() => session.value?.user || null)
  const token = computed(() => session.value?.token || null)

  return {
    session,
    user,
    token,
    isAuthenticated,
    loginSession,
    registerSession,
    clearSession,
    initAuthSession,
  }
}
