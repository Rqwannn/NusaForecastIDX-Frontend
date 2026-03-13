<script setup>
import { computed, onMounted, ref } from 'vue'

import { useAuthSession } from '../../composables/useAuthSession'
import { backendApi } from '../../services/backendApi'

const { user } = useAuthSession()

const overview = ref(null)
const isLoading = ref(true)
const loadError = ref('')

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
  return user.value?.workspace?.investment_focus || 'IDX30 momentum, forecasting, dan risk-aware execution'
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
const summaryCards = computed(() => widgets.value.summary_cards || [])
const pipelineMix = computed(() => widgets.value.insight_breakdown || [])
const shapDrivers = computed(() => widgets.value.shap_drivers || [])
const agentStatuses = computed(() => widgets.value.agent_statuses || [])
const watchlist = computed(() => widgets.value.watchlist || [])
const nextActions = computed(() => widgets.value.next_actions || [])
const chartWidget = computed(() => widgets.value.chart || defaultChartWidget)

const primaryTicker = computed(() => overview.value?.ticker || rawData.value.primary_forecast?.ticker || 'IDX30')
const primaryForecast = computed(() => rawData.value.primary_forecast || {})
const primaryXai = computed(() => rawData.value.primary_xai || {})
const primaryQuote = computed(() => rawData.value.primary_quote || {})
const marketOverview = computed(() => rawData.value.market_overview || {})
const primaryHorizon = computed(() => overview.value?.horizon || primaryForecast.value.horizon || 5)

const dataSourceLabel = computed(() => {
  const source = marketOverview.value?.source || primaryQuote.value?.source || 'runtime'
  return String(source).replace(/_/g, ' ')
})

const runtimeModeLabel = computed(() => {
  return String(overview.value?.mode || primaryForecast.value?.mode || 'hybrid').replace(/_/g, ' ')
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

const selectedPointIndex = computed(() => {
  const labels = chartWidget.value.labels || []
  return labels.length ? labels.length - 1 : 0
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

const selectedSeriesAPoint = computed(() => seriesAPoints.value[selectedPointIndex.value] || { x: 0, y: 0, value: 0 })
const selectedSeriesBPoint = computed(() => seriesBPoints.value[selectedPointIndex.value] || { x: 0, y: 0, value: 0 })

const alertContent = computed(() => {
  const signal = String(primaryForecast.value.final_signal || 'hold').toLowerCase()
  const confidence = Number(primaryForecast.value.confidence_score || 0)
  const sharpeRatio = Number(rawData.value.backtest_summary?.items?.[0]?.sharpe_ratio || 0)

  if (signal === 'buy' && confidence >= 0.7 && sharpeRatio >= 1) {
    return {
      title: 'Setup desk masih sehat.',
      body: 'Sinyal utama masih didukung confidence model dan profil risiko yang relatif terjaga.',
    }
  }
  if (signal === 'sell') {
    return {
      title: 'Desk perlu defensif.',
      body: 'Bias prediksi cenderung negatif. Prioritaskan review risiko sebelum membuka simulasi baru.',
    }
  }
  return {
    title: 'Perlu validasi tambahan.',
    body: 'Overview sudah terisi live, tetapi sinyal utama belum cukup kuat untuk keputusan agresif.',
  }
})

const aiBrief = computed(() => {
  const signal = String(primaryForecast.value.final_signal || 'hold').toLowerCase()
  const model = primaryForecast.value.selected_model || 'model runtime'
  const ticker = primaryTicker.value
  const reason = primaryXai.value?.explanation?.reason_summary
  const changePct = Number(primaryQuote.value.change_pct || 0)
  const signalLabel =
    signal === 'buy' ? 'bias naik' : signal === 'sell' ? 'bias turun' : 'bias netral'
  const marketPulse =
    changePct > 0 ? 'market masih bergerak konstruktif' : changePct < 0 ? 'market sedang tertahan' : 'market masih seimbang'

  return `${ticker} saat ini dibaca dengan ${signalLabel} menggunakan ${model}, sementara ${marketPulse}. ${
    reason || 'Gunakan halaman Forecast dan XAI untuk memvalidasi driver utama sebelum aksi.'
  }`
})

const loadOverview = async () => {
  isLoading.value = true
  loadError.value = ''

  try {
    overview.value = await backendApi.getDashboardOverview(undefined, 5)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Gagal memuat overview dashboard.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void loadOverview()
})
</script>

<template>
  <div class="overview-page">
    <section class="overview-hero">
      <div>
        <p class="overview-kicker">Overview workspace</p>
        <h1>Selamat datang kembali, {{ displayName }}</h1>
        <p class="overview-copy">
          {{ currentDate }}. Fokus kerja kamu saat ini sebagai {{ workspaceRole }} mengarah ke
          <strong>{{ workspaceFocus }}</strong>.
        </p>
      </div>

      <div class="overview-hero__actions">
        <div class="overview-chip">
          <span>Feed market</span>
          <strong>{{ isLoading ? 'Memuat...' : dataSourceLabel }}</strong>
        </div>
        <div class="overview-chip">
          <span>Fokus sesi</span>
          <strong>{{ isLoading ? 'Sinkronisasi...' : `${primaryTicker} · H${primaryHorizon} · ${runtimeModeLabel}` }}</strong>
        </div>
        <div class="overview-chip">
          <span>Pembaruan terakhir</span>
          <strong>{{ isLoading ? 'Memuat timestamp...' : updatedAtLabel }}</strong>
        </div>
      </div>
    </section>

    <section v-if="loadError" class="overview-state-card is-error">
      <strong>Overview belum bisa dimuat.</strong>
      <span>{{ loadError }}</span>
    </section>

    <section v-else-if="isLoading" class="overview-state-card">
      <strong>Memuat data live overview...</strong>
      <span>Frontend sedang mengambil ringkasan market, forecast, evaluasi, dan XAI dari backend.</span>
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
                <p class="overview-kicker">Pulse forecast</p>
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
                <p>{{ chartWidget.tooltip_title }}</p>
                <strong>{{ chartWidget.series_a_label }} {{ chartWidget.tooltip_value_a }}</strong>
                <span>{{ chartWidget.series_b_label }} {{ chartWidget.tooltip_value_b }}</span>
              </div>
            </div>

            <div
              class="overview-axis-labels"
              :style="{ gridTemplateColumns: `repeat(${Math.max(chartLabels.length, 1)}, minmax(0, 1fr))` }"
            >
              <span v-for="label in chartLabels" :key="label">{{ label }}</span>
            </div>

            <div class="overview-alert">
              <strong>{{ alertContent.title }}</strong>
              <span>{{ alertContent.body }}</span>
            </div>
          </article>

          <article class="overview-panel overview-brief-panel">
            <div>
              <p class="overview-kicker">Catatan orkestrator</p>
              <h3>Brief AI untuk pembukaan sesi</h3>
              <p class="overview-brief-panel__copy">{{ aiBrief }}</p>
            </div>

            <div class="overview-brief-panel__actions">
              <RouterLink to="/app/forecast" class="overview-link-button overview-link-button--primary">
                Buka Forecast
              </RouterLink>
              <RouterLink to="/app/agentic" class="overview-link-button">Lihat Agentic Trace</RouterLink>
            </div>
          </article>
        </div>

        <aside class="overview-side-column">
          <article class="overview-panel">
            <div class="overview-panel__header compact">
              <div>
                <p class="overview-kicker">Pipeline mix</p>
                <h3>Komposisi insight</h3>
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
                <p class="overview-kicker">SHAP drivers</p>
                <h3>Faktor dominan model</h3>
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
              SHAP runtime belum tersedia untuk model terpilih. Overview tetap live, tetapi panel XAI masih terbatas.
            </p>
          </article>

          <article class="overview-panel">
            <div class="overview-panel__header compact">
              <div>
                <p class="overview-kicker">Agent runtime</p>
                <h3>Status agent internal</h3>
              </div>
            </div>

            <div class="overview-status-list">
              <div v-for="agent in agentStatuses" :key="agent.name" class="overview-status-item">
                <div>
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

          <div class="overview-watchlist">
            <div v-for="item in watchlist" :key="item.ticker" class="overview-watch-item">
              <div class="overview-watch-item__symbol">{{ item.ticker }}</div>
              <div class="overview-watch-item__body">
                <strong>{{ item.signal }}</strong>
                <small>{{ item.model }}</small>
              </div>
              <span>{{ item.confidence }}</span>
            </div>
          </div>
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

<style scoped>
.overview-page {
  display: grid;
  gap: 18px;
}

.overview-hero,
.overview-panel,
.overview-metric-card,
.overview-state-card {
  border: 1px solid var(--ws-line);
  background: var(--ws-card);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.overview-hero {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 18px;
  padding: 22px;
  border-radius: 26px;
}

.overview-kicker {
  margin: 0;
  color: var(--ws-text-dim);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.overview-hero h1 {
  margin-top: 8px;
  font-size: clamp(1.8rem, 3vw, 2.75rem);
  line-height: 1.05;
}

.overview-copy {
  margin-top: 12px;
  max-width: 62ch;
  color: var(--ws-text-soft);
  font-size: 1rem;
  line-height: 1.7;
}

.overview-copy strong {
  color: var(--ws-text);
  font-weight: 700;
}

.overview-hero__actions {
  display: grid;
  gap: 10px;
  min-width: 260px;
}

.overview-chip,
.overview-state-card {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--ws-line);
  background: var(--ws-card-muted);
}

.overview-state-card {
  gap: 6px;
  padding: 18px 20px;
}

.overview-state-card.is-error {
  border-color: rgba(191, 94, 94, 0.28);
  background: rgba(77, 22, 22, 0.35);
}

.overview-chip span,
.overview-state-card span,
.overview-metric-card small,
.overview-metric-card span,
.overview-progress-item small,
.overview-driver-item small,
.overview-status-item small,
.overview-watch-item small,
.overview-empty-copy,
.overview-panel__subtitle {
  color: var(--ws-text-dim);
}

.overview-chip strong {
  color: var(--ws-text);
  font-size: 0.96rem;
}

.overview-metrics {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.overview-metric-card {
  display: grid;
  gap: 10px;
  padding: 18px;
  border-radius: 22px;
}

.overview-metric-card.is-accent {
  background: rgba(28, 67, 52, 0.88);
  border-color: rgba(45, 145, 109, 0.28);
}

.overview-metric-card p {
  margin: 0;
  color: var(--ws-text-soft);
  font-weight: 700;
}

.overview-metric-card h2 {
  font-size: clamp(1.4rem, 2vw, 2rem);
}

.overview-metric-card small,
.overview-metric-card span {
  display: block;
  line-height: 1.5;
}

.overview-body {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(290px, 0.95fr);
  gap: 16px;
}

.overview-main-column,
.overview-side-column,
.overview-lower {
  display: grid;
  gap: 16px;
}

.overview-panel {
  padding: 18px;
  border-radius: 24px;
}

.overview-panel__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.overview-panel__header.compact {
  margin-bottom: 14px;
}

.overview-panel__header h3 {
  margin-top: 6px;
  font-size: 1.18rem;
}

.overview-panel__subtitle {
  display: block;
  margin-top: 6px;
  line-height: 1.5;
}

.overview-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--ws-text-soft);
  font-size: 0.9rem;
}

.legend-dot {
  display: inline-block;
  width: 11px;
  height: 11px;
  margin-right: 8px;
  border-radius: 999px;
  vertical-align: middle;
}

.legend-dot--accent,
.overview-progress-fill,
.overview-driver-pill.is-bullish,
.overview-status-pill.is-good {
  background: var(--ws-accent-strong);
}

.legend-dot--muted,
.overview-driver-pill.is-bearish,
.overview-status-pill.is-watch {
  background: rgba(144, 157, 151, 0.62);
}

.overview-status-pill.is-limited {
  background: rgba(125, 135, 131, 0.42);
}

.overview-chart {
  position: relative;
  height: 260px;
}

.overview-chart svg {
  width: 100%;
  height: 100%;
}

.chart-grid-line {
  stroke: rgba(148, 171, 160, 0.14);
  stroke-width: 1;
}

.chart-area {
  fill: rgba(45, 145, 109, 0.12);
}

.chart-line {
  fill: none;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chart-line--accent {
  stroke: var(--ws-accent-strong);
}

.chart-line--muted {
  stroke: rgba(178, 188, 183, 0.62);
}

.chart-focus {
  stroke: var(--ws-card);
  stroke-width: 2;
}

.chart-focus--accent {
  fill: var(--ws-accent-strong);
}

.chart-focus--muted {
  fill: rgba(189, 200, 195, 0.8);
}

.overview-chart__tooltip {
  position: absolute;
  top: 24px;
  min-width: 168px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--ws-line);
  background: var(--ws-panel-alt);
  box-shadow: 0 20px 42px rgba(4, 8, 7, 0.18);
}

.overview-chart__tooltip p,
.overview-chart__tooltip span {
  margin: 0;
  color: var(--ws-text-dim);
  font-size: 0.84rem;
}

.overview-chart__tooltip strong {
  display: block;
  margin: 6px 0 4px;
  font-size: 1rem;
}

.overview-axis-labels {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  color: var(--ws-text-dim);
  font-size: 0.84rem;
}

.overview-axis-labels span:last-child {
  text-align: right;
}

.overview-alert {
  display: flex;
  align-items: start;
  gap: 10px;
  margin-top: 18px;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(35, 88, 67, 0.1);
  border: 1px solid rgba(45, 145, 109, 0.18);
  line-height: 1.6;
}

.overview-alert strong {
  white-space: nowrap;
}

.overview-alert span,
.overview-brief-panel__copy {
  color: var(--ws-text-soft);
}

.overview-brief-panel {
  display: grid;
  gap: 18px;
}

.overview-brief-panel__copy {
  margin-top: 8px;
  line-height: 1.7;
}

.overview-brief-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.overview-link-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 160px;
  padding: 11px 16px;
  border-radius: 14px;
  border: 1px solid var(--ws-line);
  background: var(--ws-card-muted);
  color: var(--ws-text);
  text-decoration: none;
  font-weight: 700;
}

.overview-link-button--primary {
  border-color: rgba(45, 145, 109, 0.26);
  background: rgba(32, 87, 64, 0.9);
}

.overview-progress-list,
.overview-driver-list,
.overview-status-list {
  display: grid;
  gap: 14px;
}

.overview-progress-item,
.overview-driver-item,
.overview-status-item,
.overview-watch-item {
  display: grid;
  gap: 8px;
}

.overview-progress-item__head,
.overview-driver-item,
.overview-status-item,
.overview-watch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.overview-progress-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(119, 136, 129, 0.14);
  overflow: hidden;
}

.overview-progress-fill {
  height: 100%;
  border-radius: inherit;
}

.overview-driver-pill,
.overview-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  padding: 6px 10px;
  border-radius: 999px;
  color: #f6faf8;
  font-size: 0.82rem;
  font-weight: 800;
}

.overview-watchlist {
  display: grid;
  gap: 12px;
}

.overview-watch-item {
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--ws-line);
  background: var(--ws-card-muted);
}

.overview-watch-item__symbol {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  background: rgba(25, 105, 78, 0.12);
  color: var(--ws-text);
  font-weight: 800;
  letter-spacing: 0.06em;
}

.overview-watch-item__body {
  flex: 1;
}

.overview-watch-item__body strong {
  display: block;
}

.overview-watch-item span:last-child {
  color: var(--ws-text);
  font-weight: 800;
}

.overview-lower {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.overview-action-list {
  margin: 0;
  padding-left: 18px;
  color: var(--ws-text-soft);
  line-height: 1.8;
}

.overview-action-list li + li {
  margin-top: 8px;
}

.overview-empty-copy {
  margin: 0;
  line-height: 1.7;
}

@media (max-width: 1180px) {
  .overview-metrics,
  .overview-lower,
  .overview-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 840px) {
  .overview-hero,
  .overview-panel__header,
  .overview-hero__actions {
    grid-template-columns: 1fr;
  }

  .overview-hero {
    flex-direction: column;
  }

  .overview-hero__actions {
    width: 100%;
    min-width: 0;
  }

  .overview-alert {
    flex-direction: column;
  }
}

@media (max-width: 620px) {
  .overview-page,
  .overview-main-column,
  .overview-side-column,
  .overview-lower {
    gap: 14px;
  }

  .overview-hero,
  .overview-panel,
  .overview-metric-card,
  .overview-state-card {
    padding: 16px;
    border-radius: 20px;
  }

  .overview-axis-labels {
    font-size: 0.76rem;
  }

  .overview-watch-item {
    grid-template-columns: 1fr;
    align-items: start;
  }
}
</style>
