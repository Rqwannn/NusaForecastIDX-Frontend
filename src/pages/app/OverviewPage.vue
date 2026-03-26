<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthSession } from '../../composables/useAuthSession'
import { usePageContext } from '../../composables/usePageContext'
import { backendApi } from '../../services/backendApi'
import '../../styles/pages/overview-page.css'

const { setPageContext, clearPageContext } = usePageContext()

const route = useRoute()
const router = useRouter()
const { user } = useAuthSession()

const overview = ref(null)
const isLoading = ref(true)
const loadError = ref('')
const selectedTicker = ref(String(route.query.ticker || '').toUpperCase())
const selectedHorizon = ref(Number(route.query.horizon || 5) || 5)
const selectedChartRange = ref(String(route.query.chart_range || '1mo'))
const selectedPointIndex = ref(0)

let refreshTimerId = null

const chartWidth = 700
const chartHeight = 260
const paddingX = 24
const paddingTop = 20
const paddingBottom = 28
const chartBottom = chartHeight - paddingBottom

const defaultChartWidget = {
  title: 'Pergerakan harga dan volume',
  subtitle: 'Data chart belum tersedia.',
  labels: [],
  series_a_label: 'Harga penutupan',
  series_b_label: 'Volume relatif',
  series_a: [],
  series_b: [],
  series_a_display: [],
  series_b_display: [],
  tooltip_title: '-',
  tooltip_value_a: '-',
  tooltip_value_b: '-',
}

const displayName = computed(() => {
  const first = user.value?.profile?.first_name || ''
  const last = user.value?.profile?.last_name || ''
  const full = `${first} ${last}`.trim()
  return full || user.value?.email || 'Trader'
})

const workspaceRole = computed(() => user.value?.workspace?.job_title || 'Research Analyst')
const workspaceFocus = computed(() => {
  return user.value?.workspace?.investment_focus || 'peluang IDX30 dan keputusan yang lebih terukur'
})

const currentDate = computed(() => {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
})

const widgets = computed(() => overview.value?.widgets || {})
const rawData = computed(() => overview.value?.data || {})
const controls = computed(() => overview.value?.controls || {})
const summaryCards = computed(() => widgets.value.summary_cards || [])
const pipelineMix = computed(() => widgets.value.insight_breakdown || [])
const shapDrivers = computed(() => widgets.value.shap_drivers || [])
const agentStatuses = computed(() => widgets.value.agent_statuses || [])
const watchlist = computed(() => widgets.value.watchlist || [])
const nextActions = computed(() => widgets.value.next_actions || [])
const chartWidget = computed(() => widgets.value.chart || defaultChartWidget)
const availableTickers = computed(() => controls.value.ticker_options || [])
const availableHorizons = computed(() => controls.value.horizon_options || [1, 5])
const availableChartRanges = computed(() => controls.value.chart_range_options || ['5d', '1mo', '3mo'])
const refreshSeconds = computed(() => Number(controls.value.refresh_seconds || 60))

const primaryTicker = computed(() => overview.value?.ticker || rawData.value.primary_forecast?.ticker || 'IDX30')
const primaryForecast = computed(() => rawData.value.primary_forecast || {})
const primaryXai = computed(() => rawData.value.primary_xai || {})
const primaryQuote = computed(() => rawData.value.primary_quote || {})
const marketOverview = computed(() => rawData.value.market_overview || {})
const primaryHorizon = computed(() => overview.value?.horizon || primaryForecast.value.horizon || 5)

const dataSourceLabel = computed(() => {
  const source = String(marketOverview.value?.source || primaryQuote.value?.source || '')
  const mapping = {
    yfinance_delayed: 'Data pasar tertunda tersedia',
    yfinance_delayed_partial: 'Data pasar tertunda tersedia sebagian',
    mixed: 'Data pasar tersedia',
  }
  return mapping[source] || 'Data pasar tersedia'
})

const outlookLabel = computed(() => {
  const signal = String(primaryForecast.value.final_signal || 'hold').toLowerCase()
  if (signal === 'buy') return 'peluang naik'
  if (signal === 'sell') return 'tekanan turun'
  return 'pergerakan netral'
})

const updatedAtLabel = computed(() => {
  const generatedAt = overview.value?.generated_at || primaryForecast.value?.generated_at
  if (!generatedAt) return 'Belum ada timestamp'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(generatedAt))
  } catch {
    return 'Timestamp tidak tersedia'
  }
})

const pointCoordinates = (values) => {
  const normalized = Array.isArray(values) ? values : []
  if (!normalized.length) return []

  const divisor = Math.max(normalized.length - 1, 1)
  const stepX = (chartWidth - paddingX * 2) / divisor

  return normalized.map((value, index) => {
    const x = paddingX + stepX * index
    const ratio = Math.max(0, Math.min(100, Number(value) || 0))
    const y = paddingTop + ((100 - ratio) / 100) * (chartBottom - paddingTop)
    return { x, y, value: ratio }
  })
}

const chartSeriesA = computed(() => chartWidget.value.series_a || [])
const chartSeriesB = computed(() => chartWidget.value.series_b || [])
const chartLabels = computed(() => chartWidget.value.labels || [])

const seriesAPoints = computed(() => pointCoordinates(chartSeriesA.value))
const seriesBPoints = computed(() => pointCoordinates(chartSeriesB.value))

const toPolyline = (points) => points.map((point) => `${point.x},${point.y}`).join(' ')

const toAreaPath = (points) => {
  if (!points.length) return ''
  const start = points[0]
  const body = points.map((point) => `L ${point.x} ${point.y}`).join(' ')
  const last = points[points.length - 1]
  return `M ${start.x} ${chartBottom} L ${start.x} ${start.y} ${body} L ${last.x} ${chartBottom} Z`
}

const seriesALine = computed(() => toPolyline(seriesAPoints.value))
const seriesBLine = computed(() => toPolyline(seriesBPoints.value))
const seriesAArea = computed(() => toAreaPath(seriesAPoints.value))

const clampedPointIndex = computed(() => {
  const maxIndex = Math.max(chartLabels.value.length - 1, 0)
  return Math.min(Math.max(selectedPointIndex.value, 0), maxIndex)
})

const selectedSeriesAPoint = computed(() => seriesAPoints.value[clampedPointIndex.value] || { x: 0, y: 0, value: 0 })
const selectedSeriesBPoint = computed(() => seriesBPoints.value[clampedPointIndex.value] || { x: 0, y: 0, value: 0 })
const selectedTooltipTitle = computed(() => chartLabels.value[clampedPointIndex.value] || chartWidget.value.tooltip_title)
const selectedTooltipValueA = computed(() => {
  return chartWidget.value.series_a_display?.[clampedPointIndex.value] || chartWidget.value.tooltip_value_a
})
const selectedTooltipValueB = computed(() => {
  return chartWidget.value.series_b_display?.[clampedPointIndex.value] || chartWidget.value.tooltip_value_b
})

const alertContent = computed(() => {
  const signal = String(primaryForecast.value.final_signal || 'hold').toLowerCase()
  const confidence = Number(primaryForecast.value.confidence_score || 0)
  const sharpeRatio = Number(rawData.value.backtest_summary?.items?.[0]?.sharpe_ratio || 0)

  if (signal === 'buy' && confidence >= 0.7 && sharpeRatio >= 1) {
    return {
      title: 'Setup desk masih sehat.',
      body: 'Sinyal utama masih didukung tingkat keyakinan yang baik dan profil risiko yang relatif terjaga.',
    }
  }
  if (signal === 'sell') {
    return {
      title: 'Desk perlu defensif.',
      body: 'Arah pembacaan cenderung negatif. Prioritaskan review risiko sebelum membuka simulasi baru.',
    }
  }
  return {
    title: 'Perlu validasi tambahan.',
    body: 'Ringkasan terbaru sudah tersedia, tetapi sinyal utama belum cukup kuat untuk keputusan agresif.',
  }
})

const aiBrief = computed(() => {
  const signal = String(primaryForecast.value.final_signal || 'hold').toLowerCase()
  const ticker = primaryTicker.value
  const changePct = Number(primaryQuote.value.change_pct || 0)
  const topDrivers = shapDrivers.value.slice(0, 2).map((item) => item.feature)
  const signalLabel =
    signal === 'buy' ? 'bias naik' : signal === 'sell' ? 'bias turun' : 'bias netral'
  const marketPulse =
    changePct > 0 ? 'market masih bergerak konstruktif' : changePct < 0 ? 'market sedang tertahan' : 'market masih seimbang'
  const driverSummary =
    topDrivers.length >= 2
      ? `Faktor yang paling banyak memengaruhi pembacaan saat ini adalah ${topDrivers[0]} dan ${topDrivers[1]}.`
      : topDrivers.length === 1
        ? `Faktor yang paling banyak memengaruhi pembacaan saat ini adalah ${topDrivers[0]}.`
        : 'Gunakan halaman Proyeksi dan Penjelasan untuk memvalidasi faktor utama sebelum mengambil langkah berikutnya.'

  return `${ticker} saat ini dibaca dengan ${signalLabel}, sementara ${marketPulse}. ${driverSummary}`
})

const syncRouteQuery = async () => {
  await router.replace({
    query: {
      ...route.query,
      ticker: selectedTicker.value || undefined,
      horizon: selectedHorizon.value ? String(selectedHorizon.value) : undefined,
      chart_range: selectedChartRange.value || undefined,
    },
  })
}

const stopAutoRefresh = () => {
  if (typeof window === 'undefined') return
  if (refreshTimerId) {
    window.clearInterval(refreshTimerId)
    refreshTimerId = null
  }
}

const startAutoRefresh = () => {
  stopAutoRefresh()
  if (typeof window === 'undefined') return
  if (!refreshSeconds.value || refreshSeconds.value <= 0) return
  refreshTimerId = window.setInterval(() => {
    void loadOverview({ syncQuery: false })
  }, refreshSeconds.value * 1000)
}

const loadOverview = async ({ syncQuery = true } = {}) => {
  isLoading.value = true
  loadError.value = ''

  try {
    overview.value = await backendApi.getDashboardOverview(
      selectedTicker.value || undefined,
      selectedHorizon.value || 5,
      selectedChartRange.value || '1mo',
    )
    selectedTicker.value = overview.value?.ticker || selectedTicker.value
    selectedHorizon.value = Number(overview.value?.horizon || selectedHorizon.value || 5)
    selectedChartRange.value = String(overview.value?.controls?.chart_range || selectedChartRange.value || '1mo')
    selectedPointIndex.value = Math.max((chartWidget.value.labels || []).length - 1, 0)
    startAutoRefresh()
    if (syncQuery) {
      await syncRouteQuery()
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Gagal memuat overview dashboard.'
    stopAutoRefresh()
  } finally {
    isLoading.value = false
  }
}

const onControlsChange = async () => {
  await loadOverview()
}

const onTickerInputChange = async () => {
  const normalized = String(selectedTicker.value || '').trim().toUpperCase()
  if (!normalized) return
  selectedTicker.value = normalized
  await onControlsChange()
}

watch(chartLabels, (labels) => {
  selectedPointIndex.value = Math.max((labels || []).length - 1, 0)
})

watch(() => [overview.value, alertContent.value, aiBrief.value], () => {
  setPageContext({
    pageName: 'Executive Overview',
    overviewDashboard: {
      ticker: primaryTicker.value,
      horizon: primaryHorizon.value,
      outlook: outlookLabel.value,
      summaryCards: summaryCards.value,
      alertDecision: alertContent.value,
      aiBrief: aiBrief.value,
      nextActions: nextActions.value
    }
  })
}, { deep: true })

onMounted(() => {
  void loadOverview()
})

onBeforeUnmount(() => {
  clearPageContext()
  stopAutoRefresh()
})
</script>

<template>
  <div class="overview-page">
    <section class="overview-hero">
      <div>
        <p class="overview-kicker">Ringkasan workspace</p>
        <h1>Selamat datang kembali, {{ displayName }}</h1>
        <p class="overview-copy">
          {{ currentDate }}. Fokus kerja kamu saat ini sebagai {{ workspaceRole }} mengarah ke
          <strong>{{ workspaceFocus }}</strong>.
        </p>
      </div>

      <div class="overview-hero__actions">
        <div class="overview-chip">
          <span>Data pasar</span>
          <strong>{{ isLoading ? 'Memuat...' : dataSourceLabel }}</strong>
        </div>
        <div class="overview-chip">
          <span>Fokus analisis</span>
          <strong>{{ isLoading ? 'Sinkronisasi...' : `${primaryTicker} · ${primaryHorizon} hari · ${outlookLabel}` }}</strong>
        </div>
        <div class="overview-chip">
          <span>Pembaruan terakhir</span>
          <strong>{{ isLoading ? 'Memuat timestamp...' : updatedAtLabel }}</strong>
        </div>
      </div>
    </section>

    <section class="overview-toolbar">
      <label class="overview-control">
        <span>Saham utama</span>
        <input
          v-model="selectedTicker"
          list="overview-ticker-options"
          type="text"
          placeholder="Cari ticker, contoh: ADRO"
          @change="onTickerInputChange"
          @blur="onTickerInputChange"
          @keyup.enter="onTickerInputChange"
        />
        <datalist id="overview-ticker-options">
          <option v-for="ticker in availableTickers" :key="ticker" :value="ticker" />
        </datalist>
      </label>

      <label class="overview-control">
        <span>Rentang analisis</span>
        <select v-model.number="selectedHorizon" @change="onControlsChange">
          <option v-for="horizon in availableHorizons" :key="horizon" :value="horizon">{{ horizon }} hari</option>
        </select>
      </label>

      <label class="overview-control">
        <span>Periode chart</span>
        <select v-model="selectedChartRange" @change="onControlsChange">
          <option v-for="range in availableChartRanges" :key="range" :value="range">
            {{ range === '5d' ? '5 hari' : range === '3mo' ? '3 bulan' : '1 bulan' }}
          </option>
        </select>
      </label>

      <div class="overview-control overview-control--action">
        <span>Aksi</span>
        <button
          type="button"
          class="overview-link-button overview-link-button--primary overview-toolbar__refresh"
          @click="loadOverview()"
        >
          Refresh sekarang
        </button>
      </div>
    </section>

    <section v-if="loadError" class="overview-state-card is-error">
      <strong>Overview belum bisa dimuat.</strong>
      <span>{{ loadError }}</span>
      <div class="overview-state-card__actions">
        <button type="button" class="overview-link-button overview-link-button--primary" @click="loadOverview()">
          Coba refresh
        </button>
      </div>
    </section>

    <section v-else-if="isLoading" class="overview-state-card">
      <strong>Memuat data live overview...</strong>
      <span>Ringkasan pasar dan pembacaan terbaru sedang disiapkan untuk halaman ini.</span>
    </section>

    <template v-else>
      <section class="overview-metrics">
        <article
          v-for="card in summaryCards"
          :key="card.title"
          :class="['overview-metric-card', card.tone === 'accent' ? 'is-accent' : '']"
        >
          <p>{{ card.title }}</p>
          <h2>{{ card.value }}</h2>
          <small>{{ card.footnote }}</small>
          <span>{{ card.meta }}</span>
        </article>
      </section>

      <section class="overview-body">
        <div class="overview-main-column">
          <article class="overview-panel overview-chart-panel">
            <div class="overview-panel__header">
              <div>
                <p class="overview-kicker">Sorotan pergerakan</p>
                <h3>{{ chartWidget.title }}</h3>
                <small class="overview-panel__subtitle">{{ chartWidget.subtitle }}</small>
              </div>
              <div class="overview-legend">
                <span><i class="legend-dot legend-dot--accent" /> {{ chartWidget.series_a_label }}</span>
                <span><i class="legend-dot legend-dot--muted" /> {{ chartWidget.series_b_label }}</span>
              </div>
            </div>

            <div class="overview-chart">
              <svg :viewBox="`0 0 ${chartWidth} ${chartHeight}`" preserveAspectRatio="none" aria-hidden="true">
                <g>
                  <line
                    v-for="level in [0, 25, 50, 75, 100]"
                    :key="level"
                    :x1="paddingX"
                    :x2="chartWidth - paddingX"
                    :y1="paddingTop + ((100 - level) / 100) * (chartBottom - paddingTop)"
                    :y2="paddingTop + ((100 - level) / 100) * (chartBottom - paddingTop)"
                    class="chart-grid-line"
                  />
                </g>

                <path :d="seriesAArea" class="chart-area" />
                <polyline :points="seriesALine" class="chart-line chart-line--accent" />
                <polyline :points="seriesBLine" class="chart-line chart-line--muted" />

                <circle
                  :cx="selectedSeriesAPoint.x"
                  :cy="selectedSeriesAPoint.y"
                  r="5"
                  class="chart-focus chart-focus--accent"
                />
                <circle
                  :cx="selectedSeriesBPoint.x"
                  :cy="selectedSeriesBPoint.y"
                  r="4.2"
                  class="chart-focus chart-focus--muted"
                />
              </svg>

              <div
                class="overview-chart__tooltip"
                :style="{
                  left: `min(calc(${((selectedSeriesAPoint.x / chartWidth) * 100).toFixed(2)}% + 8px), calc(100% - 190px))`,
                  top: '26px',
                }"
              >
                <p>{{ selectedTooltipTitle }}</p>
                <strong>{{ chartWidget.series_a_label }} {{ selectedTooltipValueA }}</strong>
                <span>{{ chartWidget.series_b_label }} {{ selectedTooltipValueB }}</span>
              </div>
            </div>

            <div
              class="overview-axis-labels"
              :style="{ gridTemplateColumns: `repeat(${Math.max(chartLabels.length, 1)}, minmax(0, 1fr))` }"
            >
              <button
                v-for="(label, index) in chartLabels"
                :key="label"
                type="button"
                :class="['overview-axis-label', index === clampedPointIndex ? 'is-active' : '']"
                @mouseenter="selectedPointIndex = index"
                @focus="selectedPointIndex = index"
                @click="selectedPointIndex = index"
              >
                {{ label }}
              </button>
            </div>

            <div class="overview-alert">
              <strong>{{ alertContent.title }}</strong>
              <span>{{ alertContent.body }}</span>
            </div>
          </article>

          <article class="overview-panel overview-brief-panel">
            <div>
              <p class="overview-kicker">Ringkasan harian</p>
              <h3>Catatan singkat untuk pembukaan sesi</h3>
              <p class="overview-brief-panel__copy">{{ aiBrief }}</p>
            </div>

            <div class="overview-brief-panel__actions">
              <RouterLink to="/app/forecast" class="overview-link-button overview-link-button--primary">
                Buka Proyeksi
              </RouterLink>
              <RouterLink to="/app/agentic" class="overview-link-button">Lihat alur analisis</RouterLink>
            </div>
          </article>
        </div>

        <aside class="overview-side-column">
          <article class="overview-panel">
            <div class="overview-panel__header compact">
              <div>
                <p class="overview-kicker">Cakupan insight</p>
                <h3>Komposisi ringkasan</h3>
              </div>
            </div>

            <div class="overview-progress-list">
              <div v-for="item in pipelineMix" :key="item.label" class="overview-progress-item">
                <div class="overview-progress-item__head">
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.value }}</span>
                </div>
                <div class="overview-progress-track">
                  <div class="overview-progress-fill" :style="{ width: `${item.percentage || 0}%` }" />
                </div>
                <small>{{ item.note }}</small>
              </div>
            </div>
          </article>

          <article class="overview-panel">
            <div class="overview-panel__header compact">
              <div>
                <p class="overview-kicker">Faktor utama</p>
                <h3>Pendorong arah pembacaan</h3>
              </div>
            </div>

            <div v-if="shapDrivers.length" class="overview-driver-list">
              <div v-for="driver in shapDrivers" :key="driver.feature" class="overview-driver-item">
                <div>
                  <strong>{{ driver.feature }}</strong>
                  <small>{{ driver.stance === 'bullish' ? 'Mendorong bias naik' : 'Menahan agresivitas sinyal' }}</small>
                </div>
                <span :class="['overview-driver-pill', driver.stance === 'bullish' ? 'is-bullish' : 'is-bearish']">
                  {{ driver.impact }}
                </span>
              </div>
            </div>
            <p v-else class="overview-empty-copy">
              Penjelasan faktor utama belum tersedia untuk pilihan ini. Ringkasan pasar tetap berjalan, tetapi panel penjelasan masih terbatas.
            </p>
          </article>

          <article class="overview-panel">
            <div class="overview-panel__header compact">
              <div>
                <p class="overview-kicker">Status layanan</p>
                <h3>Kondisi layanan internal</h3>
              </div>
            </div>

            <div class="overview-status-list">
              <div v-for="agent in agentStatuses" :key="agent.name" class="overview-status-item">
                <div class="overview-status-item__body">
                  <strong>{{ agent.name }}</strong>
                  <small>{{ agent.note }}</small>
                </div>
                <span
                  :class="[
                    'overview-status-pill',
                    agent.status === 'Aktif' ? 'is-good' : agent.status === 'Waspada' ? 'is-watch' : 'is-limited',
                  ]"
                >
                  {{ agent.status }}
                </span>
              </div>
            </div>
          </article>
        </aside>
      </section>

      <section class="overview-lower">
        <article class="overview-panel">
          <div class="overview-panel__header">
            <div>
              <p class="overview-kicker">Watchlist prioritas</p>
              <h3>Ticker yang layak dibuka lebih dulu</h3>
            </div>
          </div>

          <div v-if="watchlist.length" class="overview-watchlist">
            <div v-for="item in watchlist" :key="item.ticker" class="overview-watch-item">
              <div class="overview-watch-item__symbol">{{ item.ticker }}</div>
              <div class="overview-watch-item__body">
                <strong>{{ item.signal }}</strong>
                <small>{{ item.model }}</small>
              </div>
              <span>{{ item.confidence }}</span>
            </div>
          </div>
          <p v-else class="overview-empty-copy">
            Daftar prioritas belum tersedia untuk pilihan ini. Coba ganti rentang analisis atau lakukan refresh beberapa saat lagi.
          </p>
        </article>

        <article class="overview-panel">
          <div class="overview-panel__header">
            <div>
              <p class="overview-kicker">Agenda analis</p>
              <h3>Langkah berikutnya untuk sesi ini</h3>
            </div>
          </div>

          <ol class="overview-action-list">
            <li v-for="action in nextActions" :key="action">{{ action }}</li>
          </ol>
        </article>
      </section>
    </template>
  </div>
</template>
