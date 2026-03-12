import { computed, onBeforeUnmount, ref } from 'vue'

import { WS_BASE_URL } from '../config/runtime'

const SOCKET_PATH = '/api/v1/ws/agentic'

export const useAgenticSocket = () => {
  const socket = ref(null)
  const status = ref('idle')
  const sessionId = ref('')
  const events = ref([])
  const error = ref('')

  const isConnected = computed(() => status.value === 'connected')
  const finalAnswers = computed(() => events.value.filter((event) => event.type === 'final_answer'))
  const thoughts = computed(() => events.value.filter((event) => event.type === 'thought'))

  const connect = ({ token } = {}) =>
    new Promise((resolve, reject) => {
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
        error.value = 'Failed to connect websocket /ws/agentic'
      }
      ws.onclose = () => {
        status.value = 'closed'
      }

      socket.value = ws
    })

  const sendChat = async ({ user_id, chat, ticker, horizon, token }) => {
    if (!socket.value || status.value !== 'connected') {
      await connect({ token })
    }

    if (!socket.value || status.value !== 'connected') {
      throw new Error('Agentic websocket is not connected')
    }

    const payload = {
      user_id,
      chat,
      ...(ticker ? { ticker } : {}),
      ...(horizon ? { horizon } : {}),
    }
    socket.value.send(JSON.stringify(payload))
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
    thoughts,
    finalAnswers,
    error,
    connect,
    sendChat,
    clearEvents,
    disconnect,
  }
}
