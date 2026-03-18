import { computed, onBeforeUnmount, ref } from 'vue'

import { WS_BASE_URL } from '../config/runtime'

const SOCKET_PATH = '/api/v1/ws/info-center'

export const useInfoCenterSocket = () => {
  const socket = ref(null)
  const status = ref('idle')
  const sessionId = ref('')
  const events = ref([])
  const error = ref('')

  const isConnected = computed(() => status.value === 'connected')
  const lastFinalAnswer = computed(() => {
    const reversed = [...events.value].reverse()
    return reversed.find((event) => event.type === 'final_answer') || null
  })

  const connect = ({ token } = {}) =>
    new Promise((resolve) => {
      if (socket.value && isConnected.value) {
        resolve(true)
        return
      }

      error.value = ''
      status.value = 'connecting'

      const wsUrl = new URL(`${WS_BASE_URL}${SOCKET_PATH}`)
      if (token) wsUrl.searchParams.set('token', String(token))

      const ws = new WebSocket(wsUrl.toString())
      ws.onopen = () => {
        status.value = 'connected'
        resolve(true)
      }
      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data)
          events.value.push(payload)
          if (payload.type === 'connected' && payload.session_id) {
            sessionId.value = String(payload.session_id)
          }
          if (payload.type === 'error') {
            error.value = payload.detail || payload.error || 'WebSocket error'
          }
        } catch {
          events.value.push({ type: 'raw', data: evt.data })
        }
      }
      ws.onerror = () => {
        error.value = 'Gagal terhubung ke layanan informasi'
      }
      ws.onclose = () => {
        status.value = 'closed'
      }
      socket.value = ws
    })

  const ask = async ({ user_id, question, ticker, horizon, context, token }) => {
    if (!socket.value || status.value !== 'connected') {
      await connect({ token })
    }
    if (!socket.value || status.value !== 'connected') {
      throw new Error('Info center websocket tidak terhubung')
    }

    socket.value.send(
      JSON.stringify({
        user_id,
        question,
        ...(ticker ? { ticker } : {}),
        ...(horizon ? { horizon } : {}),
        ...(context ? { context } : {}),
      }),
    )
  }

  const clearEvents = () => {
    events.value = []
  }

  const disconnect = () => {
    if (socket.value) {
      socket.value.close()
      socket.value = null
    }
    status.value = 'closed'
  }

  onBeforeUnmount(() => {
    disconnect()
  })

  return {
    status,
    isConnected,
    sessionId,
    events,
    error,
    lastFinalAnswer,
    connect,
    ask,
    clearEvents,
    disconnect,
  }
}
