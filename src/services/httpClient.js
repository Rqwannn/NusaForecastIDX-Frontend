import { API_BASE_URL } from '../config/runtime'

const TOKEN_STORAGE_KEY = 'idx30_access_token'

const readTokenFromStorage = () => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) || ''
}

let authToken = readTokenFromStorage()

export const setAuthToken = (token) => {
  authToken = String(token || '').trim()
  if (typeof window !== 'undefined') {
    if (authToken) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, authToken)
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  }
}

export const getAuthToken = () => authToken

export const clearAuthToken = () => setAuthToken('')

const buildUrl = (path, query = undefined) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${API_BASE_URL}${normalizedPath}`)

  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      url.searchParams.set(key, String(value))
    })
  }

  return url.toString()
}

const parseResponsePayload = async (response) => {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json()
  const raw = await response.text()
  return raw ? { raw } : {}
}

const unwrapSuccessPayload = (payload) => {
  if (
    payload &&
    typeof payload === 'object' &&
    payload.MESSAGE === 'SUCCESS' &&
    Object.prototype.hasOwnProperty.call(payload, 'DATA')
  ) {
    return payload.DATA
  }
  return payload
}

export const apiRequest = async (path, options = {}) => {
  const {
    method = 'GET',
    query,
    body,
    headers = {},
    signal,
    credentials = 'include',
  } = options

  const requestHeaders = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(authToken && !headers.Authorization ? { Authorization: `Bearer ${authToken}` } : {}),
    ...headers,
  }

  const response = await fetch(buildUrl(path, query), {
    method,
    credentials,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  const payload = await parseResponsePayload(response)
  if (response.ok) return unwrapSuccessPayload(payload)

  const detail =
    (typeof payload === 'object' &&
      payload &&
      (payload.ERROR || payload.detail || payload.message || payload.raw)) ||
    response.statusText ||
    'Unknown API error'
  const error = new Error(`HTTP ${response.status}: ${detail}`)
  error.status = response.status
  error.payload = payload
  throw error
}
