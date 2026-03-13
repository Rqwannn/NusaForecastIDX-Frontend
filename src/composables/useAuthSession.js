import { computed, ref } from 'vue'

import { backendApi } from '../services/backendApi'
import { clearAuthToken } from '../services/httpClient'

const session = ref(null)
const initialized = ref(false)
let initPromise = null

const normalizeSession = (payload) => {
  if (!payload?.user) return null
  return {
    user: payload.user,
    session: payload.session || null,
  }
}

const persistSession = (payload) => {
  const normalized = normalizeSession(payload)
  session.value = normalized
  return normalized
}

export const initAuthSession = async ({ force = false } = {}) => {
  if (force) {
    initialized.value = false
  }

  if (initialized.value && !force) return session.value
  if (initPromise) return initPromise

  // Drop any legacy bearer token stored by older frontend versions.
  clearAuthToken()

  initPromise = (async () => {
    try {
      const payload = await backendApi.getSession()
      session.value = normalizeSession(payload)
    } catch {
      session.value = null
    } finally {
      initialized.value = true
      initPromise = null
    }

    return session.value
  })()

  return initPromise
}

export const clearSession = () => {
  session.value = null
  initialized.value = true
  clearAuthToken()
}

export const logoutSession = async () => {
  try {
    await backendApi.logout()
  } finally {
    clearSession()
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

export const refreshSession = async () => {
  return initAuthSession({ force: true })
}

export const hasActiveSession = () => Boolean(session.value?.user?.uid)

export const useAuthSession = () => {
  const isAuthenticated = computed(() => hasActiveSession())
  const user = computed(() => session.value?.user || null)
  const authSession = computed(() => session.value?.session || null)

  return {
    session,
    user,
    authSession,
    isAuthenticated,
    loginSession,
    registerSession,
    logoutSession,
    clearSession,
    initAuthSession,
    refreshSession,
  }
}
