<script setup>
import { computed, nextTick, ref, watch } from 'vue'

import { useAuthSession } from '../../composables/useAuthSession'
import { useInfoCenterSocket } from '../../composables/useInfoCenterSocket'
import '../../styles/components/information-center-widget.css'

const open = ref(false)
const question = ref('')
const ticker = ref('ADRO')
const horizon = ref(5)
const sending = ref(false)
const activeStreamMessageId = ref('')
const bodyRef = ref(null)

const { user } = useAuthSession()
const socket = useInfoCenterSocket()

const messages = ref([
  {
    id: 'welcome',
    role: 'agent',
    text: 'Halo, saya Information Center. Saya bantu ringkasan forecasting, risiko, dan langkah analisis di aplikasi ini.',
    time: new Date().toISOString(),
  },
])

const userId = computed(() => String(user.value?.uid || ''))
const typing = computed(() => sending.value || socket.status.value === 'connecting')
const canSend = computed(() => userId.value && question.value.trim().length >= 3 && !sending.value)
const statusLabel = computed(() => {
  if (socket.isConnected.value) return 'Online'
  if (socket.status.value === 'connecting') return 'Menghubungkan...'
  if (socket.status.value === 'closed') return 'Terputus'
  return 'Siap'
})

const scrollToBottom = async () => {
  await nextTick()
  if (bodyRef.value) {
    bodyRef.value.scrollTop = bodyRef.value.scrollHeight
  }
}

watch(
  () => socket.events.value.length,
  async () => {
    const event = socket.events.value[socket.events.value.length - 1]
    if (!event) return

    if (event.type === 'response_waiting') {
      sending.value = true
      await scrollToBottom()
      return
    }

    if (event.type === 'response_stream') {
      const chunk = String(event.chunk || '')
      if (!chunk) return

      let message = messages.value.find((item) => item.id === activeStreamMessageId.value)
      if (!message) {
        activeStreamMessageId.value = `agent-stream-${Date.now()}`
        message = {
          id: activeStreamMessageId.value,
          role: 'agent',
          text: '',
          time: new Date().toISOString(),
        }
        messages.value.push(message)
      }
      message.text += chunk
      await scrollToBottom()
      return
    }

    if (event.type === 'final_answer' && event.result?.answer) {
      const finalText = String(event.result.answer || '')
      const message = messages.value.find((item) => item.id === activeStreamMessageId.value)
      if (message) {
        message.text = finalText
      } else {
        messages.value.push({
          id: `agent-${Date.now()}`,
          role: 'agent',
          text: finalText,
          time: new Date().toISOString(),
        })
      }
      activeStreamMessageId.value = ''
      sending.value = false
      await scrollToBottom()
      return
    }

    if (event.type === 'error') {
      activeStreamMessageId.value = ''
      messages.value.push({
        id: `error-${Date.now()}`,
        role: 'agent',
        text: 'Maaf, jawaban belum bisa diproses. Coba lagi beberapa saat.',
        time: new Date().toISOString(),
      })
      sending.value = false
      await scrollToBottom()
    }
  },
)

const toggleWidget = async () => {
  open.value = !open.value
  if (open.value) {
    await socket.connect()
    await scrollToBottom()
  }
}

const onSend = async () => {
  if (!canSend.value) return
  const text = question.value.trim()
  question.value = ''

  messages.value.push({
    id: `user-${Date.now()}`,
    role: 'user',
    text,
    time: new Date().toISOString(),
  })
  sending.value = true
  activeStreamMessageId.value = ''
  await scrollToBottom()

  try {
    await socket.ask({
      user_id: userId.value,
      question: text,
      ticker: ticker.value,
      horizon: horizon.value,
    })
  } catch {
    sending.value = false
    activeStreamMessageId.value = ''
    messages.value.push({
      id: `error-send-${Date.now()}`,
      role: 'agent',
      text: 'Koneksi belum siap. Klik kirim lagi.',
      time: new Date().toISOString(),
    })
    await scrollToBottom()
  }
}

const quickPrompts = [
  'Ringkas kondisi ticker ini untuk sesi hari ini.',
  'Apa risiko utama yang perlu saya jaga?',
  'Apa langkah berikutnya sebelum ambil keputusan?',
]

const assistantBlocks = (text) => {
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, index, arr) => !(line === '' && arr[index - 1] === ''))
  if (!lines.length) return []

  const blocks = []
  let listItems = []

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: 'list', items: [...listItems] })
      listItems = []
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushList()
      continue
    }
    if (line.startsWith('- ')) {
      listItems.push(line.slice(2).trim())
      continue
    }
    if (/^\d+\)\s+/.test(line)) {
      listItems.push(line.replace(/^\d+\)\s+/, '').trim())
      continue
    }
    flushList()
    if (line.endsWith(':')) {
      blocks.push({ type: 'heading', text: line.slice(0, -1) })
    } else {
      blocks.push({ type: 'paragraph', text: line })
    }
  }

  flushList()
  return blocks
}
</script>

<template>
  <div class="info-center" :class="{ 'is-open': open }">
    <button class="info-center__fab" type="button" @click="toggleWidget">
      <span class="info-center__fab-icon">◎</span>
      <span class="info-center__fab-text">Information Center</span>
    </button>

    <section v-if="open" class="info-center__panel">
      <header class="info-center__header">
        <div>
          <p>Asisten informasi</p>
          <h3>Information Center</h3>
        </div>
        <div class="info-center__header-right">
          <small>{{ statusLabel }}</small>
          <button type="button" @click="open = false">×</button>
        </div>
      </header>

      <div class="info-center__controls">
        <label>
          <span>Ticker</span>
          <input v-model="ticker" maxlength="10" />
        </label>
        <label>
          <span>Horizon</span>
          <select v-model.number="horizon">
            <option :value="1">1 hari</option>
            <option :value="5">5 hari</option>
            <option :value="10">10 hari</option>
          </select>
        </label>
      </div>

      <div ref="bodyRef" class="info-center__body">
        <article
          v-for="message in messages"
          :key="message.id"
          :class="['info-center__bubble', message.role === 'user' ? 'is-user' : 'is-agent']"
        >
          <template v-if="message.role === 'agent'">
            <template v-for="(block, idx) in assistantBlocks(message.text)" :key="`${message.id}-${idx}`">
              <p v-if="block.type === 'paragraph'" class="info-center__paragraph">{{ block.text }}</p>
              <p v-else-if="block.type === 'heading'" class="info-center__heading">{{ block.text }}</p>
              <ul v-else class="info-center__list">
                <li v-for="(item, itemIdx) in block.items" :key="`${message.id}-${idx}-${itemIdx}`">{{ item }}</li>
              </ul>
            </template>
          </template>
          <template v-else>
            {{ message.text }}
          </template>
        </article>

        <div v-if="typing" class="info-center__typing" aria-label="Menunggu jawaban">
          <span />
          <span />
          <span />
        </div>
      </div>

      <div class="info-center__quick">
        <button v-for="prompt in quickPrompts" :key="prompt" type="button" @click="question = prompt">
          {{ prompt }}
        </button>
      </div>

      <form class="info-center__form" @submit.prevent="onSend">
        <textarea
          v-model="question"
          rows="2"
          placeholder="Tanya seputar forecasting, risiko, atau langkah analisis..."
        />
        <button type="submit" :disabled="!canSend">Kirim</button>
      </form>
    </section>
  </div>
</template>
