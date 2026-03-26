<script setup>
import { computed, onMounted, ref, watchEffect, onUnmounted } from 'vue'
import { usePageContext } from '../../composables/usePageContext'

import { backendApi } from '../../services/backendApi'
import '../../styles/pages/agentic-page.css'

const COMMITTEE_MODES = ['per_ticker', 'global', 'hybrid']
const HORIZON_OPTIONS = [1, 5]

const activeTab = ref('ingest')

const tabs = [
  { id: 'ingest', label: 'Data Pipeline', icon: 'ri-database-2-line' },
  { id: 'committee', label: 'Decision Engine', icon: 'ri-team-line' },
  { id: 'risk', label: 'Risk Shield', icon: 'ri-shield-check-line' },
]

const TRACE_ICONS = {
  bullish: 'ri-arrow-up-circle-line',
  bearish: 'ri-arrow-down-circle-line',
  trader: 'ri-exchange-funds-line',
  risk_manager: 'ri-shield-line',
  manager_final: 'ri-user-star-line',
}

const ingestTickersInput = ref('ADRO, BBCA, TLKM')
const ingestRunLoading = ref(false)
const ingestStatusLoading = ref(false)
const ingestError = ref('')
const ingestStatusError = ref('')
const ingestRunResult = ref(null)
const ingestStatus = ref(null)
const ingestNewsItems = ref([])

const committeeTicker = ref('ADRO')
const committeeHorizon = ref(5)
const committeeMode = ref('hybrid')
const committeeLoading = ref(false)
const committeeError = ref('')
const committeeResult = ref(null)

const riskPolicy = ref(null)
const riskPolicyForm = ref({
  max_exposure_per_ticker_pct: 35,
  max_daily_loss_pct: 2,
  max_drawdown_pct: 8,
  min_confidence_score: 0.55,
  no_trade_zone_abs_return: 0.002,
  is_active: true,
})
const riskPolicyLoading = ref(false)
const riskPolicySaving = ref(false)
const riskPolicyError = ref('')
const riskPolicySuccess = ref('')

const riskEventsLimit = ref(100)
const riskEventsLoading = ref(false)
const riskEventsError = ref('')
const riskEvents = ref(null)

const reportsTicker = ref('')
const reportsHorizon = ref('')
const reportsForceRegenerate = ref(true)
const reportsLoading = ref(false)
const reportsError = ref('')
const reportsResult = ref(null)

const reportViewerOpen = ref(false)
const reportViewerKey = ref('')
const reportViewerLabel = ref('')
const reportViewerContent = ref('')
const reportViewerFilename = ref('')
const reportViewerLoading = ref(false)

const generatePolyline = (arr) => {
  if (!arr || !arr.length) return ''
  const max = Math.max(...arr)
  const min = Math.min(...arr)
  const range = (max - min) || 1
  return arr.map((val, i) => {
    const x = (i / (Math.max(arr.length - 1, 1))) * 100
    const y = 30 - (((val - min) / range) * 28) - 1 // keep it inside the 0-30 bounds safely
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

const parsedReportContent = computed(() => {
  if (!reportViewerContent.value) return null
  
  // If it's a CSV file
  if (reportViewerKey.value.includes('csv') || reportViewerKey.value.includes('template')) {
    try {
      const lines = reportViewerContent.value.trim().split(/\r?\n/)
      const rows = lines.map(line => {
        const match = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)
        if (match) return match.map(m => m.replace(/^"|"$/g, ''))
        return line.split(',')
      })
      return { isCsv: true, rows }
    } catch {
      return null
    }
  }

  // If it's JSON
  try {
    const obj = JSON.parse(reportViewerContent.value)
    if (typeof obj !== 'object' || obj === null) return null
    
    const scalars = {}
    const metrics = []
    const tables = {}
    const series = {}
    let maxMetric = 0.001 // prevent division by zero
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'number') {
        metrics.push({ key, value })
        maxMetric = Math.max(maxMetric, Math.abs(value))
      } else if (typeof value === 'string' || typeof value === 'boolean') {
        scalars[key] = value
      } else if (Array.isArray(value) && value.length > 0) {
        if (typeof value[0] === 'object') {
          tables[key] = value
        } else if (typeof value[0] === 'number') {
          series[key] = value
        }
      }
    }
    
    return { 
      isJson: true,
      hasVisuals: Object.keys(scalars).length > 0 || metrics.length > 0 || Object.keys(tables).length > 0 || Object.keys(series).length > 0,
      scalars, 
      metrics, 
      tables,
      series,
      maxMetric 
    }
  } catch {
    return null
  }
})

const getErrorMessage = (error, fallback) => {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

const normalizeTicker = (value) => {
  const text = String(value || '').trim().toUpperCase()
  return text.endsWith('.JK') ? text.slice(0, -3) : text
}

const parseTickersInput = (value) => {
  const chunks = String(value || '')
    .split(/[\s,;\n]+/)
    .map((ticker) => normalizeTicker(ticker))
    .filter((ticker) => ticker.length >= 4)
  return [...new Set(chunks)]
}

const formatDateTime = (value) => {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

const prettyJson = (value) => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return JSON.stringify(parsed, null, 2)
  } catch {
    return String(value || '')
  }
}

const ingestTableCounts = computed(() => {
  return (
    ingestStatus.value?.table_counts ||
    ingestRunResult.value?.table_counts ||
    {}
  )
})

const committeeFinalDecision = computed(() => committeeResult.value?.final_decision || null)
const committeeTraces = computed(() => committeeResult.value?.traces || [])
const committeeGeneratedAt = computed(() => committeeResult.value?.generated_at || '')

const verdictClass = computed(() => {
  const stance = String(committeeFinalDecision.value?.stance || '').toLowerCase()
  if (stance === 'bullish') return 'is-bullish'
  if (stance === 'bearish') return 'is-bearish'
  return 'is-neutral'
})

const verdictLabel = computed(() => {
  const stance = String(committeeFinalDecision.value?.stance || '').toLowerCase()
  if (stance === 'bullish') return '▲ Bullish'
  if (stance === 'bearish') return '▼ Bearish'
  return '● Neutral'
})

const riskEventItems = computed(() => riskEvents.value?.items || [])

const reportCounts = computed(() => reportsResult.value?.counts || {})

const maxReportCount = computed(() => {
  const values = Object.values(reportCounts.value).map(v => Number(v) || 0)
  return values.length ? Math.max(...values, 1) : 1
})

const REPORT_LABELS = {
  benchmark_config: { label: 'Benchmark Config', icon: 'ri-settings-3-line', desc: 'Konfigurasi baseline untuk pengujian', type: 'yaml' },
  baseline_report: { label: 'Baseline Report', icon: 'ri-file-text-line', desc: 'Laporan performa model baseline', type: 'json' },
  result_table_template: { label: 'Table Template', icon: 'ri-table-line', desc: 'Template tabel hasil evaluasi', type: 'csv' },
  model_vs_agent_report_json: { label: 'Model vs Agent', icon: 'ri-bar-chart-2-line', desc: 'Perbandingan model ML vs keputusan agen', type: 'json' },
  model_vs_agent_report_csv: { label: 'Model vs Agent (CSV)', icon: 'ri-file-excel-line', desc: 'Data perbandingan dalam format spreadsheet', type: 'csv' },
  model_vs_agent_plot: { label: 'Visualisasi Plot', icon: 'ri-line-chart-line', desc: 'Data visualisasi perbandingan performa', type: 'json' },
  ablation_report_json: { label: 'Ablation Study', icon: 'ri-test-tube-line', desc: 'Analisis dampak setiap komponen', type: 'json' },
  ablation_report_csv: { label: 'Ablation (CSV)', icon: 'ri-file-excel-line', desc: 'Data ablation study dalam spreadsheet', type: 'csv' },
  walk_forward_report_json: { label: 'Walk-Forward Test', icon: 'ri-walk-line', desc: 'Validasi performa secara time-series', type: 'json' },
  walk_forward_report_csv: { label: 'Walk-Forward (CSV)', icon: 'ri-file-excel-line', desc: 'Data walk-forward dalam spreadsheet', type: 'csv' },
  robustness_summary: { label: 'Robustness Summary', icon: 'ri-shield-star-line', desc: 'Ringkasan ketahanan model', type: 'json' },
}

const reportFileEntries = computed(() => {
  const files = reportsResult.value?.files || {}
  return Object.entries(files).map(([key, path]) => ({
    key,
    path,
    ...(REPORT_LABELS[key] || { label: key, icon: 'ri-file-line', desc: '', type: 'txt' }),
  }))
})

const openReportViewer = async (entry) => {
  reportViewerLoading.value = true
  reportViewerKey.value = entry.key
  reportViewerLabel.value = entry.label
  reportViewerFilename.value = ''
  reportViewerContent.value = ''
  reportViewerOpen.value = true
  try {
    const result = await backendApi.readReportFile(entry.key)
    reportViewerFilename.value = result?.filename || entry.key
    let raw = result?.content || ''
    // Format JSON nicely
    if (entry.type === 'json') {
      try { raw = JSON.stringify(JSON.parse(raw), null, 2) } catch {}
    }
    reportViewerContent.value = raw
  } catch (error) {
    reportViewerContent.value = 'Gagal memuat file: ' + getErrorMessage(error, '')
  } finally {
    reportViewerLoading.value = false
  }
}

const closeReportViewer = () => {
  reportViewerOpen.value = false
  reportViewerContent.value = ''
}

const downloadReport = (fileKey) => {
  const url = backendApi.getReportDownloadUrl(fileKey)
  window.open(url, '_blank')
}

const traceIcon = (roleName) => {
  return TRACE_ICONS[String(roleName || '').toLowerCase()] || 'ri-robot-2-line'
}



const fillRiskPolicyForm = (policyPayload) => {
  if (!policyPayload || typeof policyPayload !== 'object') return
  riskPolicyForm.value = {
    max_exposure_per_ticker_pct: Number(policyPayload.max_exposure_per_ticker_pct || 35),
    max_daily_loss_pct: Number(policyPayload.max_daily_loss_pct || 2),
    max_drawdown_pct: Number(policyPayload.max_drawdown_pct || 8),
    min_confidence_score: Number(policyPayload.min_confidence_score || 0.55),
    no_trade_zone_abs_return: Number(policyPayload.no_trade_zone_abs_return || 0.002),
    is_active: Boolean(policyPayload.is_active),
  }
}

const loadIngestStatus = async () => {
  ingestStatusLoading.value = true
  ingestStatusError.value = ''
  try {
    ingestStatus.value = await backendApi.getResearchIngestStatus()
  } catch (error) {
    ingestStatusError.value = getErrorMessage(error, 'Gagal memuat status ingest.')
  } finally {
    ingestStatusLoading.value = false
  }
}

const runIngest = async () => {
  ingestRunLoading.value = true
  ingestError.value = ''
  ingestNewsItems.value = []
  try {
    const parsedTickers = parseTickersInput(ingestTickersInput.value)
    const result = await backendApi.runResearchIngest({
      tickers: parsedTickers.length ? parsedTickers : undefined,
    })
    ingestRunResult.value = result
    // Extract news items from the ingest bundle summary
    const summary = result?.summary || {}
    const newsSource = summary?.news_sources || {}
    // Store the serper_news count for display
    ingestRunResult.value._serperNewsCount = result?.serper_news || 0
    await loadIngestStatus()
  } catch (error) {
    ingestError.value = getErrorMessage(error, 'Gagal menjalankan ingest.')
  } finally {
    ingestRunLoading.value = false
  }
}

const runCommittee = async () => {
  committeeLoading.value = true
  committeeError.value = ''
  try {
    committeeResult.value = await backendApi.runResearchCommittee({
      ticker: normalizeTicker(committeeTicker.value || 'ADRO'),
      horizon: Number(committeeHorizon.value || 5),
      mode: committeeMode.value,
    })
  } catch (error) {
    committeeError.value = getErrorMessage(error, 'Gagal menjalankan committee.')
  } finally {
    committeeLoading.value = false
  }
}

const loadRiskPolicy = async () => {
  riskPolicyLoading.value = true
  riskPolicyError.value = ''
  try {
    riskPolicy.value = await backendApi.getResearchRiskPolicy()
    fillRiskPolicyForm(riskPolicy.value)
  } catch (error) {
    riskPolicyError.value = getErrorMessage(error, 'Gagal memuat risk policy.')
  } finally {
    riskPolicyLoading.value = false
  }
}

const saveRiskPolicy = async () => {
  riskPolicySaving.value = true
  riskPolicyError.value = ''
  riskPolicySuccess.value = ''
  try {
    const payload = {
      max_exposure_per_ticker_pct: Number(riskPolicyForm.value.max_exposure_per_ticker_pct),
      max_daily_loss_pct: Number(riskPolicyForm.value.max_daily_loss_pct),
      max_drawdown_pct: Number(riskPolicyForm.value.max_drawdown_pct),
      min_confidence_score: Number(riskPolicyForm.value.min_confidence_score),
      no_trade_zone_abs_return: Number(riskPolicyForm.value.no_trade_zone_abs_return),
      is_active: Boolean(riskPolicyForm.value.is_active),
    }
    riskPolicy.value = await backendApi.patchResearchRiskPolicy(payload)
    fillRiskPolicyForm(riskPolicy.value)
    riskPolicySuccess.value = 'Risk policy berhasil diperbarui.'
  } catch (error) {
    riskPolicyError.value = getErrorMessage(error, 'Gagal menyimpan risk policy.')
  } finally {
    riskPolicySaving.value = false
  }
}

const loadRiskEvents = async () => {
  riskEventsLoading.value = true
  riskEventsError.value = ''
  try {
    riskEvents.value = await backendApi.getResearchRiskEvents(Number(riskEventsLimit.value || 100))
  } catch (error) {
    riskEventsError.value = getErrorMessage(error, 'Gagal memuat risk events.')
  } finally {
    riskEventsLoading.value = false
  }
}

const generateReports = async () => {
  reportsLoading.value = true
  reportsError.value = ''
  try {
    reportsResult.value = await backendApi.generateResearchReports({
      ticker: reportsTicker.value ? normalizeTicker(reportsTicker.value) : undefined,
      horizon: reportsHorizon.value ? Number(reportsHorizon.value) : undefined,
      force_regenerate: Boolean(reportsForceRegenerate.value),
    })
  } catch (error) {
    reportsError.value = getErrorMessage(error, 'Gagal menghasilkan laporan analisis.')
  } finally {
    reportsLoading.value = false
  }
}

const downloadReportPdf = () => {
  window.print()
}

// Load Serper news feed on demand
const newsFeedTicker = ref('')
const newsFeedLoading = ref(false)
const newsFeedError = ref('')
const newsFeedItems = ref([])

const loadNewsFeed = async () => {
  newsFeedLoading.value = true
  newsFeedError.value = ''
  newsFeedItems.value = []
  try {
    const rawQuery = (newsFeedTicker.value || ingestTickersInput.value).trim()

    // Get the feed data directly using the raw query
    const feed = await backendApi.getResearchIngestFeed({
      ticker: rawQuery,
      snapshotLimit: 20,
    })
    // The raw news items from Serper are returned under 'news_items'
    const rawNews = feed?.news_items || []
    
    // Sort descending by published_at
    const sortedNews = [...rawNews].sort((a, b) => {
      const ta = new Date(a.published_at || 0).getTime()
      const tb = new Date(b.published_at || 0).getTime()
      return tb - ta
    })

    // Build UI items for news feed
    newsFeedItems.value = sortedNews.map((item) => {
      // Determine sentiment from metadata or logic
      const metadata = item.metadata_json || {}
      let score = 0
      let sourceName = metadata.source_name || item.source || 'News'
      
      return {
        id: item.url || item.title + item.published_at,
        ticker: item.ticker,
        title: item.title,
        source: sourceName,
        url: item.url,
        published_at: item.published_at,
      }
    })

    // Update ingest status too
    await loadIngestStatus()
  } catch (error) {
    newsFeedError.value = getErrorMessage(error, 'Gagal memuat berita dari Serper.')
  } finally {
    newsFeedLoading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadIngestStatus(), loadRiskPolicy(), loadRiskEvents()])
})

const { setPageContext, clearPageContext } = usePageContext()

watchEffect(() => {
  const ctx = {
    pageName: 'AI Analyst Center (Agentic Orchestration)',
    activeTab: activeTab.value,
  }
  
  if (activeTab.value === 'ingest' && newsFeedItems.value.length > 0) {
    ctx.liveNewsContext = newsFeedItems.value.slice(0, 5).map(n => ({
      title: n.title,
      source: n.source,
      published_at: n.published_at
    }))
  }
  
  if (activeTab.value === 'committee' && committeeResult.value) {
    ctx.committeeDecisionContent = {
      stance: committeeResult.value.final_decision?.stance,
      confidence: committeeResult.value.final_decision?.confidence_score,
      reasoning: committeeResult.value.final_decision?.reasoning
    }
  }

  setPageContext(ctx)
})

onUnmounted(() => {
  clearPageContext()
})
</script>

<template>
  <div class="agentic-page">
    <!-- Hero -->
    <section class="agentic-hero">
      <div class="agentic-hero__left">
        <p class="agentic-kicker">Asisten AI Cerdas</p>
        <h1 class="agentic-title">Pusat Riset & Analisis</h1>
        <p class="agentic-subtitle">
          Kumpulkan berita pasar, biarkan tim AI menganalisis sentimen, kelola risiko portofolio, dan temukan rekomendasi trading terbaik secara otomatis.
        </p>
      </div>

      <div class="agentic-stat-row">
        <article class="agentic-stat">
          <span>Data tersimpan</span>
          <strong>{{ ingestTableCounts.market_snapshots || 0 }}</strong>
        </article>
        <article class="agentic-stat">
          <span>Keputusan agen</span>
          <strong>{{ ingestTableCounts.agent_decisions || 0 }}</strong>
        </article>
        <article class="agentic-stat">
          <span>Peristiwa risiko</span>
          <strong>{{ ingestTableCounts.risk_events || 0 }}</strong>
        </article>
      </div>
    </section>

    <!-- Tabs -->
    <nav class="agentic-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        :class="['agentic-tab', activeTab === tab.id ? 'is-active' : '']"
        @click="activeTab = tab.id"
      >
        <i :class="tab.icon" aria-hidden="true" />
        {{ tab.label }}
      </button>
    </nav>

    <!-- ═══ Tab: Data Pipeline ═══ -->
    <div v-if="activeTab === 'ingest'" :key="'ingest'" class="agentic-panel">
      <section class="agentic-section">
        <div class="agentic-section__head">
          <div class="agentic-section__title">
            <div class="agentic-section__icon"><i class="ri-database-2-line" /></div>
            <div>
              <h2>Data Pipeline</h2>
              <p>Kumpulkan data market, berita, sentimen, dan fundamental dari berbagai sumber.</p>
            </div>
          </div>
          <button type="button" class="agentic-btn" :disabled="ingestStatusLoading" @click="loadIngestStatus">
            <i class="ri-refresh-line" />
            {{ ingestStatusLoading ? 'Memuat...' : 'Perbarui status' }}
          </button>
        </div>

        <label class="agentic-field">
          <span class="agentic-field__label">Daftar ticker (pisahkan dengan koma atau spasi)</span>
          <textarea
            v-model="ingestTickersInput"
            rows="2"
            placeholder="ADRO, BBCA, TLKM, BMRI"
          />
        </label>

        <div class="agentic-actions">
          <button type="button" class="agentic-btn is-primary" :disabled="ingestRunLoading" @click="runIngest">
            <i class="ri-play-circle-line" />
            {{ ingestRunLoading ? 'Mengumpulkan data...' : 'Jalankan pipeline' }}
          </button>
        </div>

        <p v-if="ingestError" class="agentic-notice is-error">{{ ingestError }}</p>
        <p v-if="ingestStatusError" class="agentic-notice is-error">{{ ingestStatusError }}</p>

        <div class="agentic-kv-grid">
          <div class="agentic-kv">
            <span>Terakhir dijalankan</span>
            <strong>{{ formatDateTime(ingestStatus?.last_run?.generated_at) }}</strong>
          </div>
          <div class="agentic-kv">
            <span>Market snapshots</span>
            <strong>{{ ingestStatus?.last_run?.summary?.market_items || 0 }}</strong>
          </div>
          <div class="agentic-kv">
            <span>Berita Serper</span>
            <strong>{{ ingestStatus?.last_run?.summary?.news_items || 0 }}</strong>
          </div>
          <div class="agentic-kv">
            <span>Analisis sentimen</span>
            <strong>{{ ingestStatus?.last_run?.summary?.sentiment_items || 0 }}</strong>
          </div>
        </div>
      </section>

      <!-- Live News Feed Section -->
      <section class="agentic-section agentic-section--mt">
        <div class="agentic-section__head">
          <div class="agentic-section__title">
            <div class="agentic-section__icon"><i class="ri-newspaper-line" /></div>
            <div>
              <h2>Live News Feed</h2>
              <p>Berita real-time dari Serper — Bloomberg, Reuters, CNBC, Kontan, Bisnis.com.</p>
            </div>
          </div>
        </div>

        <div class="agentic-grid-3">
          <label class="agentic-field" style="grid-column: 1 / 3;">
            <span class="agentic-field__label">Ticker untuk pencarian berita</span>
            <input
              v-model="newsFeedTicker"
              type="text"
              :placeholder="ingestTickersInput || 'ADRO, BBCA, TLKM'"
            />
          </label>
          <div style="display: flex; align-items: flex-end;">
            <button type="button" class="agentic-btn is-primary" :disabled="newsFeedLoading" @click="loadNewsFeed" style="width: 100%;">
              <i class="ri-search-line" />
              {{ newsFeedLoading ? 'Mencari...' : 'Cari berita' }}
            </button>
          </div>
        </div>

        <p v-if="newsFeedError" class="agentic-notice is-error">{{ newsFeedError }}</p>

        <div v-if="newsFeedItems.length" class="agentic-news-grid">
          <article v-for="item in newsFeedItems" :key="item.id" class="agentic-news-card">
            <header>
              <div class="agentic-news-card__source">
                <strong>{{ (item.source || 'News').toUpperCase() }}</strong>
                <span>{{ (item.ticker && item.ticker.length <= 6 && !item.ticker.includes(' ')) ? item.ticker.toUpperCase() : 'OTHER' }}</span>
              </div>
            </header>
            <div class="agentic-news-card__body">
              <a v-if="item.url" :href="item.url" target="_blank" rel="noopener noreferrer">
                {{ item.title }}
              </a>
              <p v-else>{{ item.title }}</p>
            </div>
            <footer>
              <span>{{ formatDateTime(item.published_at) }}</span>
            </footer>
          </article>
        </div>

        <p v-if="!newsFeedItems.length && !newsFeedLoading" class="agentic-empty">
          Masukkan ticker (contoh: ADRO) dan klik "Cari berita" untuk mendapatkan artikel dari Serper.
        </p>
      </section>
    </div>

    <!-- ═══ Tab: Decision Engine ═══ -->
    <div v-if="activeTab === 'committee'" :key="'committee'" class="agentic-panel">
      <section class="agentic-section">
        <div class="agentic-section__head">
          <div class="agentic-section__title">
            <div class="agentic-section__icon"><i class="ri-team-line" /></div>
            <div>
              <h2>Decision Engine</h2>
              <p>Komite multi-agen menganalisis dari berbagai sudut pandang sebelum mengambil keputusan.</p>
            </div>
          </div>
        </div>

        <div class="agentic-grid-3">
          <label class="agentic-field">
            <span class="agentic-field__label">Ticker saham</span>
            <input v-model="committeeTicker" type="text" maxlength="10" placeholder="ADRO" />
          </label>

          <label class="agentic-field">
            <span class="agentic-field__label">Horizon prediksi</span>
            <select v-model.number="committeeHorizon">
              <option v-for="value in HORIZON_OPTIONS" :key="value" :value="value">{{ value }} hari</option>
            </select>
          </label>

          <label class="agentic-field">
            <span class="agentic-field__label">Mode analisis</span>
            <select v-model="committeeMode">
              <option v-for="value in COMMITTEE_MODES" :key="value" :value="value">{{ value }}</option>
            </select>
          </label>
        </div>

        <div class="agentic-actions">
          <button type="button" class="agentic-btn is-primary" :disabled="committeeLoading" @click="runCommittee">
            <i class="ri-brain-line" />
            {{ committeeLoading ? 'Menganalisis...' : 'Jalankan analisis komite' }}
          </button>
        </div>

        <p v-if="committeeError" class="agentic-notice is-error">{{ committeeError }}</p>

        <!-- Decision Result -->
        <div v-if="committeeFinalDecision" class="agentic-decision">
          <div class="agentic-decision__header">
            <div :class="['agentic-decision__verdict', verdictClass]">{{ verdictLabel }}</div>
            <span style="color: var(--ag-text-dim); font-size: 0.82rem;">
              {{ formatDateTime(committeeGeneratedAt) }}
            </span>
          </div>
          <div class="agentic-decision__stats">
            <div>
              <span>Aksi</span>
              <strong>{{ String(committeeFinalDecision.action || '-').toUpperCase() }}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong>{{ (Number(committeeFinalDecision.confidence || 0) * 100).toFixed(1) }}%</strong>
            </div>
            <div>
              <span>Ticker</span>
              <strong>{{ committeeResult?.ticker || '-' }}</strong>
            </div>
            <div>
              <span>Horizon</span>
              <strong>{{ committeeResult?.horizon || '-' }}D</strong>
            </div>
          </div>
        </div>

        <!-- Agent Traces -->
        <div v-if="committeeTraces.length" class="agentic-trace-list">
          <article v-for="trace in committeeTraces" :key="`${trace.role_name}-${trace.agent_name}`" class="agentic-trace-item">
            <header>
              <div class="agentic-trace-item__avatar">
                <i :class="traceIcon(trace.role_name)" />
              </div>
              <strong>{{ trace.agent_name }}</strong>
              <small>{{ trace.role_name }}</small>
            </header>
            <p>{{ trace.reasoning }}</p>
            <footer>
              <span>Stance: {{ trace.stance }}</span>
              <span>Confidence: {{ (Number(trace.confidence || 0) * 100).toFixed(1) }}%</span>
            </footer>
          </article>
        </div>
      </section>
    </div>

    <!-- ═══ Tab: Risk Shield ═══ -->
    <div v-if="activeTab === 'risk'" :key="'risk'" class="agentic-panel">
      <div class="agentic-grid-2 is-wide-left">
        <!-- Risk Policy -->
        <section class="agentic-section">
          <div class="agentic-section__head">
            <div class="agentic-section__title">
              <div class="agentic-section__icon"><i class="ri-shield-check-line" /></div>
              <div>
                <h2>Kebijakan Risiko</h2>
                <p>Atur batas proteksi untuk setiap order trading otomatis.</p>
              </div>
            </div>
            <button type="button" class="agentic-btn" :disabled="riskPolicyLoading" @click="loadRiskPolicy">
              <i class="ri-refresh-line" />
              {{ riskPolicyLoading ? 'Memuat...' : 'Muat ulang' }}
            </button>
          </div>

          <div class="agentic-risk-grid">
            <label class="agentic-field">
              <span class="agentic-field__label">Max exposure per ticker (%)</span>
              <input v-model.number="riskPolicyForm.max_exposure_per_ticker_pct" type="number" min="1" max="100" step="0.1" />
            </label>
            <label class="agentic-field">
              <span class="agentic-field__label">Max daily loss (%)</span>
              <input v-model.number="riskPolicyForm.max_daily_loss_pct" type="number" min="0.1" max="100" step="0.1" />
            </label>
            <label class="agentic-field">
              <span class="agentic-field__label">Max drawdown (%)</span>
              <input v-model.number="riskPolicyForm.max_drawdown_pct" type="number" min="0.1" max="100" step="0.1" />
            </label>
            <label class="agentic-field">
              <span class="agentic-field__label">Min confidence score</span>
              <input v-model.number="riskPolicyForm.min_confidence_score" type="number" min="0" max="1" step="0.01" />
            </label>
            <label class="agentic-field">
              <span class="agentic-field__label">No-trade zone abs return</span>
              <input v-model.number="riskPolicyForm.no_trade_zone_abs_return" type="number" min="0" max="1" step="0.0001" />
            </label>
            <label class="agentic-switch">
              <input v-model="riskPolicyForm.is_active" type="checkbox" />
              <span>Proteksi risiko aktif</span>
            </label>
          </div>

          <div class="agentic-actions">
            <button type="button" class="agentic-btn is-primary" :disabled="riskPolicySaving" @click="saveRiskPolicy">
              <i class="ri-save-line" />
              {{ riskPolicySaving ? 'Menyimpan...' : 'Simpan kebijakan' }}
            </button>
          </div>

          <p v-if="riskPolicyError" class="agentic-notice is-error">{{ riskPolicyError }}</p>
          <p v-if="riskPolicySuccess" class="agentic-notice is-success">{{ riskPolicySuccess }}</p>
        </section>

        <!-- Risk Events -->
        <section class="agentic-section">
          <div class="agentic-section__head">
            <div class="agentic-section__title">
              <div class="agentic-section__icon"><i class="ri-alarm-warning-line" /></div>
              <div>
                <h2>Peristiwa Risiko</h2>
                <p>Log order yang ditolak oleh sistem proteksi.</p>
              </div>
            </div>
            <div class="agentic-inline">
              <label class="agentic-inline__field">
                <span>Limit</span>
                <input v-model.number="riskEventsLimit" type="number" min="1" max="500" step="1" />
              </label>
              <button type="button" class="agentic-btn" :disabled="riskEventsLoading" @click="loadRiskEvents">
                <i class="ri-refresh-line" />
              </button>
            </div>
          </div>

          <p v-if="riskEventsError" class="agentic-notice is-error">{{ riskEventsError }}</p>

          <div v-if="riskEventItems.length" class="agentic-events">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Ticker</th>
                  <th>Status</th>
                  <th>Alasan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="event in riskEventItems" :key="event.reid">
                  <td>{{ formatDateTime(event.created_at) }}</td>
                  <td>{{ event.ticker }}</td>
                  <td>{{ event.status }}</td>
                  <td>{{ event.reason_detail || event.reason_code }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="agentic-empty">Belum ada peristiwa risiko yang tercatat.</p>
        </section>
      </div>
    </div>

    <!-- ═══ Tab: Analytics ═══ -->
    <div v-if="activeTab === 'reports'" :key="'reports'" class="agentic-panel">
      <section class="agentic-section">
        <div class="agentic-section__head">
          <div class="agentic-section__title">
            <div class="agentic-section__icon"><i class="ri-bar-chart-grouped-line" /></div>
            <div>
              <h2>Laporan Evaluasi &amp; Analisis</h2>
              <p>Generate dan unduh laporan benchmark, komparasi model, ablation, dan walk-forward test.</p>
            </div>
          </div>
        </div>

        <div class="agentic-report-controls">
          <label class="agentic-field">
            <span class="agentic-field__label">Ticker (opsional)</span>
            <input v-model="reportsTicker" type="text" maxlength="10" placeholder="ADRO" />
          </label>
          <label class="agentic-field">
            <span class="agentic-field__label">Horizon (opsional)</span>
            <select v-model="reportsHorizon">
              <option value="">Semua horizon</option>
              <option v-for="value in HORIZON_OPTIONS" :key="`report-${value}`" :value="value">{{ value }} hari</option>
            </select>
          </label>
          <label class="agentic-toggle">
            <input v-model="reportsForceRegenerate" type="checkbox" />
            <span class="agentic-toggle__track"><span class="agentic-toggle__thumb" /></span>
            <span class="agentic-toggle__label">Paksa regenerate</span>
          </label>
          <button type="button" class="agentic-btn is-primary" :disabled="reportsLoading" @click="generateReports">
            <i class="ri-file-chart-line" />
            {{ reportsLoading ? 'Generating...' : 'Generate laporan' }}
          </button>
        </div>

        <p v-if="reportsError" class="agentic-notice is-error">{{ reportsError }}</p>

        <!-- Overview Cards -->
        <div v-if="reportsResult" class="agentic-report-overview">
          <div class="agentic-report-overview__header">
            <h3>Ringkasan Laporan</h3>
            <span>{{ formatDateTime(reportsResult.generated_at) }}</span>
          </div>

          <div class="agentic-bar-chart">
            <div v-for="(value, key) in reportCounts" :key="key" class="agentic-bar-chart__row">
              <div class="agentic-bar-chart__label">
                <span>{{ key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }}</span>
                <strong>{{ value }}</strong>
              </div>
              <div class="agentic-bar-chart__track">
                <div 
                  class="agentic-bar-chart__fill" 
                  :style="{ width: `${(Number(value) || 0) / maxReportCount * 100}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Report File Cards -->
        <div v-if="reportFileEntries.length" class="agentic-report-files">
          <h3>Dokumen yang dihasilkan</h3>
          <p class="agentic-report-files__hint">Klik dokumen untuk melihat isi, atau download langsung.</p>
          <div class="agentic-report-file-grid">
            <article
              v-for="entry in reportFileEntries"
              :key="entry.key"
              class="agentic-report-file-card"
              @click="openReportViewer(entry)"
            >
              <div class="agentic-report-file-card__icon">
                <i :class="entry.icon" />
              </div>
              <div class="agentic-report-file-card__body">
                <strong>{{ entry.label }}</strong>
                <p v-if="entry.desc">{{ entry.desc }}</p>
              </div>
              <div class="agentic-report-file-card__actions">
                <button type="button" class="agentic-icon-btn" title="Lihat" @click.stop="openReportViewer(entry)">
                  <i class="ri-eye-line" />
                </button>
                <button type="button" class="agentic-icon-btn" title="Download" @click.stop="downloadReport(entry.key)">
                  <i class="ri-download-2-line" />
                </button>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>

    <!-- ═══ Report Viewer Modal ═══ -->
    <Teleport to="body">
      <Transition name="ag-modal">
        <div v-if="reportViewerOpen" class="ag-modal-backdrop" @click.self="closeReportViewer">
          <div class="ag-modal">
            <header class="ag-modal__header">
              <div>
                <h3>{{ reportViewerLabel }}</h3>
                <span v-if="reportViewerFilename">{{ reportViewerFilename }}</span>
              </div>
              <div class="ag-modal__header-actions">
                <button type="button" class="agentic-btn" @click="downloadReport(reportViewerKey)">
                  <i class="ri-download-2-line" />
                  Download
                </button>
                <button type="button" class="agentic-icon-btn" @click="closeReportViewer">
                  <i class="ri-close-line" />
                </button>
              </div>
            </header>
            <div class="ag-modal__body">
              <div v-if="reportViewerLoading" class="ag-modal__loading">
                <i class="ri-loader-4-line" />
                Memuat dokumen...
              </div>

              <!-- CSV Viewer -->
              <div v-else-if="parsedReportContent && parsedReportContent.isCsv" class="ag-modal__visuals">
                <div class="agentic-table-wrapper" style="overflow-x: auto;">
                  <table class="agentic-table">
                    <thead>
                      <tr>
                        <th v-for="(col, i) in parsedReportContent.rows[0]" :key="'h'+i">{{ col }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, idx) in parsedReportContent.rows.slice(1)" :key="'r'+idx">
                        <td v-for="(cell, cIdx) in row" :key="'c'+cIdx">{{ cell }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- JSON Viewer -->
              <div v-else-if="parsedReportContent && parsedReportContent.isJson && parsedReportContent.hasVisuals" class="ag-modal__visuals">
                <!-- Data Skalar -->
                <div v-if="Object.keys(parsedReportContent.scalars).length" class="agentic-kv-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-bottom: 24px;">
                  <div v-for="(val, key) in parsedReportContent.scalars" :key="key" class="agentic-kv">
                    <span>{{ key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }}</span>
                    <strong>{{ val }}</strong>
                  </div>
                </div>

                <!-- Line Charts (Series Data) -->
                <div v-if="Object.keys(parsedReportContent.series).length" class="agentic-report-series" style="margin-bottom: 24px; display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));">
                  <div v-for="(arr, key) in parsedReportContent.series" :key="key" class="agentic-series-card" style="padding: 16px; border: 1px solid var(--ag-line); border-radius: 12px; background: var(--ag-card);">
                    <h4 style="margin: 0 0 12px; color: var(--ag-text); font-size: 0.95rem;">{{ key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }}</h4>
                    <svg viewBox="0 0 100 30" preserveAspectRatio="none" style="width: 100%; height: 80px; overflow: visible;">
                      <!-- Gridlines -->
                      <line x1="0" y1="15" x2="100" y2="15" stroke="var(--ag-line)" stroke-dasharray="2,2" stroke-width="0.5" />
                      <!-- Line Chart -->
                      <polyline :points="generatePolyline(arr)" fill="none" stroke="var(--ag-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                      <!-- Fill Gradient -->
                      <polygon :points="`0,30 ${generatePolyline(arr)} 100,30`" fill="var(--ag-accent)" opacity="0.1" />
                    </svg>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 0.75rem; color: var(--ag-text-dim);">
                      <span>{{ arr.length }} titik data</span>
                      <span>Max: {{ Math.max(...arr).toFixed(2) }}</span>
                    </div>
                  </div>
                </div>

                <!-- Metrics Box Bar Chart -->
                <div v-if="parsedReportContent.metrics.length" class="agentic-bar-chart" style="margin-bottom: 24px; padding: 20px; background: var(--ag-card); border-radius: 16px; border: 1px solid var(--ag-line);">
                  <h4 style="margin: 0 0 16px; color: var(--ag-text);">Statistik &amp; Perbandingan Metrik</h4>
                  <div style="display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                    <div v-for="metric in parsedReportContent.metrics" :key="metric.key" class="agentic-bar-chart__row">
                      <div class="agentic-bar-chart__label">
                        <span>{{ metric.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }}</span>
                        <strong :style="{ color: metric.value < 0 ? '#ff9e9c' : 'inherit' }">{{ Number.isInteger(metric.value) ? metric.value : metric.value.toFixed(4) }}</strong>
                      </div>
                      <div class="agentic-bar-chart__track">
                        <div class="agentic-bar-chart__fill" :style="{ 
                          width: `${Math.min((Math.abs(metric.value) / parsedReportContent.maxMetric) * 100, 100)}%`,
                          background: metric.value < 0 ? '#ef5350' : 'var(--ag-accent)'
                        }"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Data Tables Array -->
                <div v-for="(arr, key) in parsedReportContent.tables" :key="key" style="margin-bottom: 24px;">
                  <h4 style="margin: 0 0 12px; color: var(--ag-text); text-transform: capitalize;">{{ key.replace(/_/g, ' ') }}</h4>
                  <div class="agentic-table-wrapper" style="max-height: 400px; overflow-y: auto;">
                    <table class="agentic-table">
                      <thead>
                        <tr>
                          <th v-for="col in Object.keys(arr[0] || {})" :key="col">{{ col.replace(/_/g, ' ') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, idx) in arr" :key="idx">
                          <td v-for="col in Object.keys(row)" :key="col">{{ row[col] }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- Fallback to Raw Text -->
              <pre v-else class="ag-modal__code">{{ reportViewerContent }}</pre>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
