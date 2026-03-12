const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '')

const deriveWsBase = (apiBase) => {
  if (apiBase.startsWith('https://')) return `wss://${apiBase.slice('https://'.length)}`
  if (apiBase.startsWith('http://')) return `ws://${apiBase.slice('http://'.length)}`
  return apiBase
}

const apiBaseFromEnv = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000')
const wsBaseFromEnv = normalizeBaseUrl(import.meta.env.VITE_WS_BASE_URL || '')

export const API_BASE_URL = apiBaseFromEnv
export const WS_BASE_URL = wsBaseFromEnv || deriveWsBase(apiBaseFromEnv)
