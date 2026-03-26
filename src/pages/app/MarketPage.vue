<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { usePageContext } from '../../composables/usePageContext'
import { backendApi } from '../../services/backendApi'
import '../../styles/pages/market-page.css'

const { setPageContext, clearPageContext } = usePageContext()

const route = useRoute()
const router = useRouter()

const IDX30_FALLBACK = [
  'ADRO', 'AMMN', 'ANTM', 'ASII', 'BBCA', 'BBNI', 'BBRI', 'BBTN', 'BMRI', 'BRIS',
  'BRPT', 'CPIN', 'ESSA', 'EXCL', 'GOTO', 'ICBP', 'INCO', 'INDF', 'ISAT', 'KLBF',
  'MAPI', 'MDKA', 'MEDC', 'PGAS', 'PTBA', 'SMGR', 'TLKM', 'TPIA', 'UNTR', 'UNVR',
]

const IDR_PER_USD = 15750
const USD_PER_BTC = 68000
const SMART_ANALYSIS_STORAGE_KEY = 'idx30.market.smart-analysis.v1'

const chartWidth = 980
const chartHeight = 380
const padLeft = 68
const padRight = 24
const padTop = 24
const padBottom = 64
const chartBottom = chartHeight - padBottom
const chartRight = chartWidth - padRight
const DEFAULT_MAX_ZOOM_LEVEL = 40
const DEFAULT_MIN_VISIBLE_POINTS = 8
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
const computeVisiblePointCount = (total, zoom, minVisible = DEFAULT_MIN_VISIBLE_POINTS) => {
  if (total <= minVisible) return total
  return clamp(Math.floor(total / zoom), minVisible, total)
}
const defaultZoomForGranularity = (granularityValue) => {
  const value = String(granularityValue || '').toLowerCase()
  if (value === '1m' || value === '5m' || value === '15m') return 7
  return 1
}
const normalizeCurrency = (value) => {
  const lower = String(value || '').toLowerCase()
  return ['idr', 'usd', 'btc'].includes(lower) ? lower : 'idr'
}

const selectedTicker = ref(String(route.query.ticker || 'ADRO').toUpperCase())
const selectedRange = ref(String(route.query.range || '1mo'))
const selectedGranularity = ref(String(route.query.granularity || route.query.interval || '60m'))
const selectedHorizon = ref(Number(route.query.horizon || 5) || 5)
const selectedChartType = ref('price')
const selectedCurrency = ref(normalizeCurrency(route.query.currency || 'idr'))
const selectedPointIndex = ref(0)
const zoomLevel = ref(clamp(defaultZoomForGranularity(selectedGranularity.value), 1, DEFAULT_MAX_ZOOM_LEVEL))
const windowStart = ref(0)
const isChartDragging = ref(false)
const dragStartX = ref(0)
const dragStartWindowStart = ref(0)
const isChartFullscreen = ref(false)
const isBookmarked = ref(false)
const isScrollbarVisible = ref(false)
let scrollbarHideTimer = null
let isScrollbarDragging = false
let scrollbarDragStartX = 0
let scrollbarDragStartWindowStart = 0
const isLiveMode = ref(String(route.query.live || 'on').toLowerCase() !== 'off')
const isLiveRefreshing = ref(false)
const liveError = ref('')
const lastLiveUpdateAt = ref('')
let liveRefreshTimer = null
let liveRequestInFlight = false

const isLoading = ref(true)
const loadError = ref('')
const marketOverview = ref(null)
const quote = ref(null)
const ohlcv = ref(null)
const forecast = ref(null)
const explanation = ref(null)
const evaluation = ref(null)
const forecastCatalog = ref(null)
const ingestFeed = ref(null)
const ingestFeedLoading = ref(false)
const ingestFeedError = ref('')
const smartAnalysisLoading = ref(false)
const smartAnalysisError = ref('')
const smartAnalysisRaw = ref('')
const smartAnalysisUpdatedAt = ref('')
const smartAnalysisContextKey = ref('')

const persistSmartAnalysisState = () => {
  if (typeof window === 'undefined') return
  try {
    const payload = {
      raw: smartAnalysisRaw.value,
      updatedAt: smartAnalysisUpdatedAt.value,
      contextKey: smartAnalysisContextKey.value,
    }
    window.localStorage.setItem(SMART_ANALYSIS_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore localStorage failures in browser private mode or quota issues.
  }
}

const restoreSmartAnalysisState = () => {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(SMART_ANALYSIS_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    smartAnalysisRaw.value = String(parsed.raw || '')
    smartAnalysisUpdatedAt.value = String(parsed.updatedAt || '')
    smartAnalysisContextKey.value = String(parsed.contextKey || '')
  } catch {
    // Ignore invalid cache payload.
  }
}

const timeframeOptions = [
  { id: '1D', range: '1d' },
  { id: '1M', range: '1mo' },
  { id: '3M', range: '3mo' },
  { id: '1Y', range: '1y' },
  { id: 'YTD', range: 'ytd' },
  { id: 'ALL', range: 'max' },
]

const granularityOptions = [
  { id: '1m', label: '1 menit' },
  { id: '5m', label: '5 menit' },
  { id: '15m', label: '15 menit' },
  { id: '30m', label: '30 menit' },
  { id: '60m', label: '1 jam' },
  { id: '1d', label: '1 hari' },
]

const tickerOptions = computed(() => {
  const fromOverview = [
    ...(marketOverview.value?.top_gainers || []).map((item) => String(item.ticker || '').toUpperCase()),
    ...(marketOverview.value?.top_losers || []).map((item) => String(item.ticker || '').toUpperCase()),
  ]
  return [...new Set([...IDX30_FALLBACK, ...fromOverview].filter(Boolean))]
})

const activeTimeframeId = computed(() => {
  const found = timeframeOptions.find((item) => item.range === selectedRange.value)
  return found?.id || 'Custom'
})

const quoteData = computed(() => quote.value || {})
const forecastData = computed(() => forecast.value || {})
const marketSummary = computed(() => marketOverview.value?.market_summary || {})

const signalLabel = computed(() => {
  const signal = String(forecastData.value.final_signal || 'hold').toLowerCase()
  if (signal === 'buy') return 'Naik'
  if (signal === 'sell') return 'Turun'
  return 'Netral'
})

const isUp = computed(() => Number(quoteData.value.change_pct || 0) >= 0)

const quoteUpdated = computed(() => {
  const timestamp = quoteData.value.quote_timestamp
  if (!timestamp) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp))
  } catch {
    return '-'
  }
})

const selectedMetric = computed(() => {
  const model = String(forecastData.value.selected_model || '')
  const horizon = Number(forecastData.value.horizon || selectedHorizon.value || 5)
  const items = evaluation.value?.items || []
  return items.find((item) => String(item.model || '').toLowerCase() === model.toLowerCase() && Number(item.horizon) === horizon) || null
})

const points = computed(() => ohlcv.value?.points || [])
const visiblePointCount = computed(() => computeVisiblePointCount(points.value.length, zoomLevel.value, minVisiblePoints.value))
const maxWindowStart = computed(() => Math.max(points.value.length - visiblePointCount.value, 0))
const windowStartClamped = computed(() => clamp(windowStart.value, 0, maxWindowStart.value))
const displayPoints = computed(() => {
  const start = windowStartClamped.value
  return points.value.slice(start, start + visiblePointCount.value)
})
const hasChartData = computed(() => displayPoints.value.length > 1)

const currencyMeta = computed(() => {
  if (selectedCurrency.value === 'idr') {
    return {
      code: 'IDR',
      symbol: 'Rp ',
      factor: 1,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }
  }
  if (selectedCurrency.value === 'btc') {
    return {
      code: 'BTC',
      symbol: 'BTC',
      factor: 1 / (IDR_PER_USD * USD_PER_BTC),
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    }
  }
  return {
    code: 'USD',
    symbol: '$',
    factor: 1 / IDR_PER_USD,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }
})

const toSelectedCurrency = (valueIdr) => Number(valueIdr || 0) * currencyMeta.value.factor

const priceSeriesRaw = computed(() => displayPoints.value.map((point) => Number(point.close || 0)))
const marketCapSeriesRaw = computed(() => displayPoints.value.map((point) => Number(point.close || 0) * Number(point.volume || 0)))

const lineSeriesRaw = computed(() => {
  if (selectedChartType.value === 'market_cap') return marketCapSeriesRaw.value
  return priceSeriesRaw.value
})

const lineSeries = computed(() => lineSeriesRaw.value.map((value) => toSelectedCurrency(value)))

const candleSeries = computed(() => {
  return displayPoints.value.map((point) => ({
    open: toSelectedCurrency(point.open),
    high: toSelectedCurrency(point.high),
    low: toSelectedCurrency(point.low),
    close: toSelectedCurrency(point.close),
  }))
})

const INTRADAY_INTERVALS = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h'])

const resolveIntervalForRange = (rangeValue, intervalValue) => {
  const range = String(rangeValue || '').toLowerCase()
  const interval = String(intervalValue || '').toLowerCase()
  const isIntraday = INTRADAY_INTERVALS.has(interval)

  if (!isIntraday) return '1d'

  // yfinance intraday lebih cocok untuk range <= 1 bulan (bukan 1 tahun/YTD/ALL)
  if (range === '3mo' || range === '1y' || range === 'ytd' || range === 'max' || range === '2y') return '1d'

  // interval 1m umumnya hanya aman untuk range sangat pendek
  if (interval === '1m' && range === '1mo') return '5m'
  return interval
}

const selectedInterval = computed(() => resolveIntervalForRange(selectedRange.value, selectedGranularity.value))
const isIntradayInterval = computed(() => INTRADAY_INTERVALS.has(String(selectedInterval.value || '').toLowerCase()))
const maxZoomLevel = computed(() => (isIntradayInterval.value ? 40 : 24))
const minVisiblePoints = computed(() => {
  if (selectedChartType.value === 'candle') return isIntradayInterval.value ? 6 : 10
  return isIntradayInterval.value ? 8 : 14
})

const intervalNotice = computed(() => {
  if (selectedInterval.value === selectedGranularity.value) return ''
  return `Granularitas ${selectedGranularity.value} tidak didukung untuk range ${activeTimeframeId.value}. Sistem gunakan ${selectedInterval.value} agar data tetap tersedia dari yfinance.`
})

const intervalLabel = computed(() => {
  const found = granularityOptions.find((option) => option.id === selectedInterval.value)
  return found?.label || selectedInterval.value
})

const liveRefreshIntervalMs = computed(() => {
  const interval = String(selectedInterval.value || '').toLowerCase()
  if (interval === '1m' || interval === '2m') return 10000
  if (interval === '5m') return 15000
  if (interval === '15m') return 20000
  if (interval === '30m') return 25000
  if (interval === '60m' || interval === '90m' || interval === '1h') return 30000
  return 90000
})

const liveUpdatedLabel = computed(() => {
  if (!lastLiveUpdateAt.value) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(lastLiveUpdateAt.value))
  } catch {
    return '-'
  }
})

const chartLabels = computed(() => {
  const includeTime = selectedInterval.value.includes('m') || selectedInterval.value.includes('h')
  return displayPoints.value.map((point) => formatTimestamp(point.timestamp, includeTime))
})

const formatTimestamp = (timestamp, withTime = false) => {
  if (!timestamp) return '-'
  try {
    if (withTime) {
      return new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(timestamp))
    }
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    }).format(new Date(timestamp))
  } catch {
    return '-'
  }
}

const formatSeriesValue = (value) => {
  const options = {
    minimumFractionDigits: currencyMeta.value.minimumFractionDigits,
    maximumFractionDigits: currencyMeta.value.maximumFractionDigits,
  }
  const numeric = Number(value || 0)
  if (currencyMeta.value.code === 'BTC') {
    return `${currencyMeta.value.symbol} ${numeric.toLocaleString('en-US', options)}`
  }
  if (currencyMeta.value.code === 'IDR') {
    return `${currencyMeta.value.symbol}${numeric.toLocaleString('id-ID', options)}`
  }
  return `${currencyMeta.value.symbol}${numeric.toLocaleString('en-US', options)}`
}

const resolveAxisFractionDigits = (value) => {
  const absolute = Math.abs(Number(value || 0))
  const spread = Math.abs(Number(activeBounds.value.max || 0) - Number(activeBounds.value.min || 0))

  if (currencyMeta.value.code === 'BTC') {
    if (absolute >= 1) return 4
    if (absolute >= 0.1) return 5
    if (absolute >= 0.01) return 6
    return 7
  }

  if (currencyMeta.value.code === 'IDR') {
    return spread < 50 ? 2 : 0
  }

  if (absolute >= 1000) return 0
  if (absolute >= 100) return 1
  if (absolute >= 10) return 2
  if (absolute >= 1) return 2
  if (absolute >= 0.1) return 3
  if (absolute >= 0.01) return 4
  return 6
}

const formatLargeSeriesValue = (value) => {
  const numeric = Number(value || 0)
  const digits = resolveAxisFractionDigits(numeric)
  if (currencyMeta.value.code === 'BTC') {
    return `BTC ${numeric.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
  }
  if (currencyMeta.value.code === 'IDR') {
    return `Rp ${numeric.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
  }
  return `$${numeric.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

const normalizeLinePoints = (series, bounds) => {
  const values = Array.isArray(series) ? series : []
  if (!values.length) return []

  const min = bounds.min
  const max = bounds.max
  const spread = max - min || Math.max(Math.abs(max), 1)
  const stepX = (chartRight - padLeft) / Math.max(values.length - 1, 1)

  return values.map((value, index) => {
    const x = padLeft + index * stepX
    const ratio = (Number(value) - min) / spread
    const y = padTop + (1 - ratio) * (chartBottom - padTop)
    return { x, y, value: Number(value || 0) }
  })
}

const lineBounds = computed(() => {
  const values = lineSeries.value
  if (!values.length) return { min: 0, max: 1 }
  const min = Math.min(...values)
  const max = Math.max(...values)
  return { min, max: max === min ? min + 1 : max }
})

const candleBounds = computed(() => {
  const lows = candleSeries.value.map((item) => item.low)
  const highs = candleSeries.value.map((item) => item.high)
  if (!lows.length || !highs.length) return { min: 0, max: 1 }
  const min = Math.min(...lows)
  const max = Math.max(...highs)
  return { min, max: max === min ? min + 1 : max }
})

const linePoints = computed(() => normalizeLinePoints(lineSeries.value, lineBounds.value))

const toY = (value, bounds) => {
  const min = bounds.min
  const max = bounds.max
  const spread = max - min || Math.max(Math.abs(max), 1)
  const ratio = (Number(value) - min) / spread
  return padTop + (1 - ratio) * (chartBottom - padTop)
}

const candlePoints = computed(() => {
  const bounds = candleBounds.value
  const bars = candleSeries.value
  if (!bars.length) return []
  const stepX = (chartRight - padLeft) / Math.max(bars.length - 1, 1)
  const bodyWidth = Math.max(3, Math.min(22, stepX * 0.64))
  return bars.map((item, index) => {
    const x = padLeft + index * stepX
    const openY = toY(item.open, bounds)
    const closeY = toY(item.close, bounds)
    const highY = toY(item.high, bounds)
    const lowY = toY(item.low, bounds)
    return {
      ...item,
      x,
      openY,
      closeY,
      highY,
      lowY,
      width: bodyWidth,
      isUp: item.close >= item.open,
    }
  })
})

const activeBounds = computed(() => (selectedChartType.value === 'candle' ? candleBounds.value : lineBounds.value))
const activePoints = computed(() => {
  if (selectedChartType.value === 'candle') {
    return candlePoints.value.map((bar) => ({ x: bar.x, y: bar.closeY, value: bar.close }))
  }
  return linePoints.value
})

const clampedPointIndex = computed(() => {
  const maxIndex = Math.max(activePoints.value.length - 1, 0)
  return Math.min(Math.max(selectedPointIndex.value, 0), maxIndex)
})

const selectedPoint = computed(() => activePoints.value[clampedPointIndex.value] || { x: 0, y: 0, value: 0 })

const toPolyline = (points) => points.map((point) => `${point.x},${point.y}`).join(' ')
const linePath = computed(() => toPolyline(linePoints.value))
const lineAreaPath = computed(() => {
  const pts = linePoints.value
  if (pts.length < 2) return ''
  const first = pts[0]
  const last = pts[pts.length - 1]
  return [
    `M ${first.x},${chartBottom}`,
    ...pts.map((p) => `L ${p.x},${p.y}`),
    `L ${last.x},${chartBottom}`,
    'Z',
  ].join(' ')
})

const yTicks = computed(() => {
  const bounds = activeBounds.value
  if (!activePoints.value.length) return []
  const min = bounds.min
  const max = bounds.max
  const steps = 4
  return Array.from({ length: steps + 1 }, (_, idx) => {
    const ratio = idx / steps
    const value = max - (max - min) * ratio
    const y = padTop + ratio * (chartBottom - padTop)
    return { y, value }
  })
})

const xTicks = computed(() => {
  const labels = chartLabels.value
  const points = activePoints.value
  const count = Math.min(labels.length, points.length)
  if (!count) return []

  const intervalValue = String(selectedInterval.value || '').toLowerCase()
  const isIntraday = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h'].includes(intervalValue)
  const targetTicks = isIntraday ? 6 : 8
  const minGapPx = isIntraday ? 92 : 74
  const step = Math.max(1, Math.ceil(count / targetTicks))

  const candidateIndexes = []
  for (let idx = 0; idx < count; idx += step) {
    candidateIndexes.push(idx)
  }

  const lastIdx = count - 1
  if (!candidateIndexes.includes(lastIdx)) candidateIndexes.push(lastIdx)

  const ticks = []
  let lastAcceptedX = Number.NEGATIVE_INFINITY
  for (const idx of candidateIndexes) {
    const x = points[idx]?.x || padLeft
    if (x - lastAcceptedX < minGapPx) continue
    ticks.push({ idx, label: labels[idx], x })
    lastAcceptedX = x
  }

  if (!ticks.length) {
    return [{ idx: lastIdx, label: labels[lastIdx], x: points[lastIdx]?.x || chartRight }]
  }

  const lastTick = ticks[ticks.length - 1]
  const lastX = points[lastIdx]?.x || chartRight
  if (lastTick.idx !== lastIdx) {
    if (lastX - lastTick.x < minGapPx) {
      ticks[ticks.length - 1] = { idx: lastIdx, label: labels[lastIdx], x: lastX }
    } else {
      ticks.push({ idx: lastIdx, label: labels[lastIdx], x: lastX })
    }
  }

  const firstX = points[0]?.x || padLeft
  if (ticks[0]?.idx !== 0 && ticks[0]?.x - firstX >= minGapPx) {
    ticks.unshift({ idx: 0, label: labels[0], x: firstX })
  }

  return ticks
})

const selectedTooltip = computed(() => {
  const idx = clampedPointIndex.value
  const raw = displayPoints.value[idx]
  if (!raw) return { title: '-', main: '-', sub: '-', extra: '' }

  const title = formatTimestamp(raw.timestamp, true)
  if (selectedChartType.value === 'market_cap') {
    const marketCap = toSelectedCurrency(Number(raw.close || 0) * Number(raw.volume || 0))
    return {
      title,
      main: `Market Cap: ${formatLargeSeriesValue(marketCap)}`,
      sub: `Harga: ${formatSeriesValue(toSelectedCurrency(raw.close))}`,
      extra: `Volume: ${Number(raw.volume || 0).toLocaleString('id-ID')}`,
    }
  }

  if (selectedChartType.value === 'candle') {
    return {
      title,
      main: `Close: ${formatSeriesValue(toSelectedCurrency(raw.close))}`,
      sub: `High/Low: ${formatSeriesValue(toSelectedCurrency(raw.high))} · ${formatSeriesValue(toSelectedCurrency(raw.low))}`,
      extra: `Open: ${formatSeriesValue(toSelectedCurrency(raw.open))}`,
    }
  }

  return {
    title,
    main: `Price: ${formatSeriesValue(toSelectedCurrency(raw.close))}`,
    sub: `Vol 24j: ${Number(raw.volume || 0).toLocaleString('id-ID')}`,
    extra: '',
  }
})

const selectedYLabel = computed(() => formatSeriesValue(selectedPoint.value.value))
const selectedXLabel = computed(() => selectedTooltip.value.title)

const estMarketCap = computed(() => {
  const price = Number(quoteData.value.price || 0)
  const volume = Number(quoteData.value.volume || 0)
  return price * volume
})

const estDilutedCap = computed(() => estMarketCap.value * 1.03)
const estSupply = computed(() => {
  const price = Number(quoteData.value.price || 1)
  return estMarketCap.value / Math.max(price, 1)
})

const topGainers = computed(() => marketOverview.value?.top_gainers || [])
const topLosers = computed(() => marketOverview.value?.top_losers || [])
const ingestNewsItems = computed(() => {
  const items = Array.isArray(ingestFeed.value?.news_items) ? ingestFeed.value.news_items : []
  return items.slice(0, 6)
})
const ingestSentimentItems = computed(() => {
  const items = Array.isArray(ingestFeed.value?.sentiment_snapshots) ? ingestFeed.value.sentiment_snapshots : []
  return [...items]
    .sort((left, right) => Math.abs(Number(right.sentiment_score || 0)) - Math.abs(Number(left.sentiment_score || 0)))
    .slice(0, 6)
})
const ingestFeedCounts = computed(() => ingestFeed.value?.counts || {})
const ingestFeedUpdatedLabel = computed(() => {
  if (!ingestNewsItems.value.length && !ingestSentimentItems.value.length) return '-'
  const latestNews = ingestNewsItems.value[0]?.published_at
  const latestSentiment = ingestSentimentItems.value[0]?.snapshot_at
  const source = latestNews || latestSentiment
  if (!source) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(source))
  } catch {
    return '-'
  }
})
const ingestFeedMarketTone = computed(() => {
  const score = Number(ingestFeedCounts.value.sentiment_snapshots || 0)
  if (score > 0) return 'Market digest aktif'
  return 'Menunggu ingest terbaru'
})
const xaiDrivers = computed(() => {
  const local = Array.isArray(explanation.value?.local_features) ? explanation.value.local_features.slice(0, 4) : []
  if (local.length) return local
  return Array.isArray(explanation.value?.global_features) ? explanation.value.global_features.slice(0, 4) : []
})
const xaiFallbackNote = computed(() => {
  const reason = String(explanation.value?.reason_summary || '').trim()
  if (reason) return reason
  return 'Faktor dominan belum tersedia untuk model atau horizon yang dipilih.'
})

const xaiImpactClass = (direction) => {
  const value = String(direction || '').toLowerCase()
  if (['positive', 'bullish', 'up'].includes(value)) return 'is-up'
  if (['negative', 'bearish', 'down'].includes(value)) return 'is-down'
  return 'is-neutral'
}

const sentimentClass = (value) => {
  const score = Number(value || 0)
  if (score > 0.08) return 'is-up'
  if (score < -0.08) return 'is-down'
  return 'is-neutral'
}

const formatIngestDate = (value) => {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '-'
  }
}

const fallbackModelFeatures = [
  'return_1d', 'return_5d', 'log_close', 'log_return_1d',
  'range_pct', 'open_close_pct', 'sma_5', 'sma_20',
  'ema_12', 'ema_26', 'macd', 'volatility_5', 'volatility_20',
  'momentum_5', 'momentum_10', 'rsi_14', 'volume_log', 'volume_z20',
  'ticker_id', 'dow_sin', 'dow_cos', 'month_sin', 'month_cos',
]

const runtimeFeatureColumns = computed(() => {
  const fromCatalog = Array.isArray(forecastCatalog.value?.feature_columns) ? forecastCatalog.value.feature_columns : []
  if (fromCatalog.length) return [...new Set(fromCatalog.map((value) => String(value).trim()).filter(Boolean))]
  return fallbackModelFeatures
})

const dynamicXaiVariableNames = computed(() => {
  const fromLocal = Array.isArray(explanation.value?.local_features) ? explanation.value.local_features : []
  const fromGlobal = Array.isArray(explanation.value?.global_features) ? explanation.value.global_features : []
  return [...new Set([...fromLocal, ...fromGlobal].map((item) => String(item?.feature || '').trim()).filter(Boolean))]
})

const analysisFieldGroups = computed(() => {
  const marketCore = [
    'date', 'ticker', 'open', 'high', 'low', 'close', 'adj_close', 'volume', 'change_pct',
  ]
  const modelOutput = [
    'selected_model', 'predicted_return', 'final_signal', 'confidence_score',
    'rmse', 'mae', 'accuracy', 'sharpe_ratio', 'cumulative_return',
    'roi_pct', 'rri', 'volatility_pct',
  ]
  const xaiFields = [
    'reason_summary', 'local_features', 'global_features',
    ...dynamicXaiVariableNames.value,
  ]

  const normalize = (items) => [...new Set(items.map((value) => String(value).trim()).filter(Boolean))]
  return [
    {
      title: 'Variabel pasar inti',
      note: 'Data harga dan transaksi dari feed market.',
      items: normalize(marketCore),
    },
    {
      title: 'Variabel fitur model',
      note: 'Fitur yang dipakai mesin forecasting untuk inferensi.',
      items: normalize(runtimeFeatureColumns.value),
    },
    {
      title: 'Variabel evaluasi & risiko',
      note: 'Metrik kualitas model dan kesehatan strategi.',
      items: normalize(modelOutput),
    },
    {
      title: 'Variabel transparansi (XAI)',
      note: 'Faktor dominan untuk menjelaskan arah model.',
      items: normalize(xaiFields),
    },
  ]
})

const totalAnalysisVariableCount = computed(() => {
  const all = analysisFieldGroups.value.flatMap((group) => group.items)
  return new Set(all).size
})

const smartAnalysisCurrentContextKey = computed(
  () => `${selectedTicker.value}|${selectedHorizon.value}|${selectedRange.value}|${selectedGranularity.value}`,
)

const smartAnalysisIsStale = computed(() => {
  if (!smartAnalysisRaw.value) return false
  return smartAnalysisContextKey.value !== smartAnalysisCurrentContextKey.value
})

const analysisFocusPoint = computed(() => {
  const idx = clampedPointIndex.value
  return displayPoints.value[idx] || displayPoints.value[displayPoints.value.length - 1] || null
})

const chartWindowStats = computed(() => {
  const window = displayPoints.value.slice(-Math.min(20, displayPoints.value.length))
  if (!window.length) {
    return {
      startTs: '',
      endTs: '',
      trendPct: 0,
      high: 0,
      low: 0,
      rangePct: 0,
      avgVolume: 0,
      latestVolumeRatio: 1,
      upCandles: 0,
      downCandles: 0,
    }
  }

  const first = window[0]
  const last = window[window.length - 1]
  const highs = window.map((point) => Number(point.high || 0))
  const lows = window.map((point) => Number(point.low || 0))
  const volumes = window.map((point) => Number(point.volume || 0))
  const high = Math.max(...highs)
  const low = Math.min(...lows)
  const avgVolume = volumes.reduce((sum, value) => sum + value, 0) / Math.max(volumes.length, 1)
  const latestVolume = Number(last.volume || 0)
  const upCandles = window.filter((point) => Number(point.close || 0) >= Number(point.open || 0)).length
  const baseClose = Number(first.close || 0)
  const lastClose = Number(last.close || 0)
  const trendPct = baseClose ? ((lastClose - baseClose) / baseClose) * 100 : 0
  const rangePct = low ? ((high - low) / low) * 100 : 0

  return {
    startTs: first.timestamp || '',
    endTs: last.timestamp || '',
    trendPct,
    high,
    low,
    rangePct,
    avgVolume,
    latestVolumeRatio: avgVolume ? latestVolume / avgVolume : 1,
    upCandles,
    downCandles: Math.max(window.length - upCandles, 0),
  }
})

const performanceSnapshot = computed(() => {
  const window = displayPoints.value.slice(-Math.min(40, displayPoints.value.length))
  if (window.length < 2) {
    return {
      roiPct: 0,
      rri: 0,
      volatilityPct: 0,
      samplePoints: window.length,
      periodStartTs: window[0]?.timestamp || '',
      periodEndTs: window[window.length - 1]?.timestamp || '',
    }
  }

  const closes = window.map((point) => Number(point.close || 0))
  const firstClose = closes[0]
  const lastClose = closes[closes.length - 1]
  const roiPct = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0

  const returns = []
  for (let idx = 1; idx < closes.length; idx += 1) {
    const prev = closes[idx - 1]
    if (prev <= 0) continue
    returns.push((closes[idx] - prev) / prev)
  }

  const meanReturn = returns.length
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : 0
  const variance = returns.length
    ? returns.reduce((sum, value) => sum + (value - meanReturn) ** 2, 0) / returns.length
    : 0
  const volatilityPct = Math.sqrt(Math.max(variance, 0)) * 100
  const rri = volatilityPct > 0 ? roiPct / volatilityPct : 0

  return {
    roiPct,
    rri,
    volatilityPct,
    samplePoints: window.length,
    periodStartTs: window[0]?.timestamp || '',
    periodEndTs: window[window.length - 1]?.timestamp || '',
  }
})

const performanceMetricRows = computed(() => {
  const roi = Number(performanceSnapshot.value.roiPct || 0)
  const rri = Number(performanceSnapshot.value.rri || 0)
  const volatility = Number(performanceSnapshot.value.volatilityPct || 0)
  const formatSigned = (value, digits = 2, suffix = '') => {
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(digits)}${suffix}`
  }
  const tone = (value) => (value > 0 ? 'is-up' : value < 0 ? 'is-down' : 'is-neutral')

  return [
    { code: 'ROI', label: 'Return on Investment', value: formatSigned(roi, 2, '%'), tone: tone(roi) },
    { code: 'RRI', label: 'Risk-Return Index', value: formatSigned(rri, 2), tone: tone(rri) },
    { code: 'V', label: 'Volatility (%)', value: formatSigned(volatility, 2, '%'), tone: tone(-volatility) },
  ]
})

const performanceMetricDate = computed(() => {
  const source = performanceSnapshot.value.periodEndTs || analysisFocusPoint.value?.timestamp || ''
  if (!source) return '-'
  return formatTimestamp(source, false)
})

const performanceSparkGeometry = computed(() => {
  const window = displayPoints.value.slice(-Math.min(28, displayPoints.value.length))
  if (window.length < 2) {
    return {
      polyline: '',
      areaPath: '',
      lastPoint: null,
      baseY: 98,
      gridY: [],
    }
  }

  const values = window.map((point) => Number(point.close || 0))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min || 1
  const width = 300
  const height = 110
  const padX = 6
  const padY = 10
  const baseY = height - padY
  const innerWidth = width - padX * 2
  const innerHeight = height - padY * 2

  const coords = values.map((value, idx) => {
    const x = padX + (idx / Math.max(values.length - 1, 1)) * innerWidth
    const y = padY + ((max - value) / spread) * innerHeight
    return { x, y, value }
  })

  const polyline = coords.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
  const areaPath = [
    `M ${coords[0].x.toFixed(2)} ${baseY.toFixed(2)}`,
    ...coords.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
    `L ${coords[coords.length - 1].x.toFixed(2)} ${baseY.toFixed(2)}`,
    'Z',
  ].join(' ')

  const gridY = [0.2, 0.5, 0.8].map((ratio) => (padY + innerHeight * ratio).toFixed(2))
  return {
    polyline,
    areaPath,
    lastPoint: coords[coords.length - 1],
    baseY,
    gridY,
  }
})

const performanceSparkLastLabel = computed(() => {
  const point = displayPoints.value[displayPoints.value.length - 1]
  if (!point) return '-'
  return formatSeriesValue(toSelectedCurrency(point.close))
})

const modelSummaryRows = computed(() => {
  const predictedReturnPct = Number(forecastData.value.predicted_return || 0) * 100
  const confidencePct = Number(forecastData.value.confidence_score || 0) * 100
  const accuracyPct = Number(selectedMetric.value?.accuracy || 0) * 100
  const sharpe = Number(selectedMetric.value?.sharpe_ratio || 0)
  const rmse = Number(selectedMetric.value?.rmse || 0)
  const mae = Number(selectedMetric.value?.mae || 0)

  const toneClass = (value, invert = false) => {
    if (value === 0) return 'is-neutral'
    if (invert) return value < 0 ? 'is-up' : 'is-down'
    return value > 0 ? 'is-up' : 'is-down'
  }

  return [
    {
      label: 'Prediksi return',
      value: `${predictedReturnPct > 0 ? '+' : ''}${predictedReturnPct.toFixed(2)}%`,
      tone: toneClass(predictedReturnPct),
    },
    {
      label: 'Confidence',
      value: `${confidencePct.toFixed(1)}%`,
      tone: confidencePct >= 60 ? 'is-up' : confidencePct >= 40 ? 'is-neutral' : 'is-down',
    },
    {
      label: 'Akurasi arah',
      value: `${accuracyPct.toFixed(1)}%`,
      tone: accuracyPct >= 52 ? 'is-up' : accuracyPct >= 48 ? 'is-neutral' : 'is-down',
    },
    {
      label: 'RMSE',
      value: rmse.toFixed(4),
      tone: toneClass(rmse, true),
    },
    {
      label: 'MAE',
      value: mae.toFixed(4),
      tone: toneClass(mae, true),
    },
    {
      label: 'Sharpe',
      value: `${sharpe > 0 ? '+' : ''}${sharpe.toFixed(2)}`,
      tone: toneClass(sharpe),
    },
  ]
})

const modelModeLabel = computed(() => {
  const mode = String(forecastData.value.mode || '').toLowerCase()
  if (mode === 'hybrid') return 'Hybrid'
  if (mode === 'global') return 'Global'
  if (mode === 'per_ticker') return 'Per ticker'
  return 'Mode default'
})

const modelSignalLabel = computed(() => {
  const signal = String(forecastData.value.final_signal || 'hold').toLowerCase()
  if (signal === 'buy') return 'Bias naik'
  if (signal === 'sell') return 'Bias turun'
  return 'Bias netral'
})

const performanceTrendLabel = computed(() => {
  const roi = Number(performanceSnapshot.value.roiPct || 0)
  if (roi > 0.5) return 'Momentum menguat'
  if (roi < -0.5) return 'Momentum melemah'
  return 'Pergerakan konsolidasi'
})

const performanceTrendTone = computed(() => {
  const roi = Number(performanceSnapshot.value.roiPct || 0)
  if (roi > 0) return 'is-up'
  if (roi < 0) return 'is-down'
  return 'is-neutral'
})

const smartAnalysisClientContext = computed(() => {
  const focus = analysisFocusPoint.value
  const modelMetric = selectedMetric.value || {}
  const predictedReturnPct = Number(forecastData.value.predicted_return || 0) * 100
  const confidencePct = Number(forecastData.value.confidence_score || 0) * 100

  return {
    chart_snapshot: {
      timeframe: activeTimeframeId.value,
      granularity: intervalLabel.value,
      chart_type: selectedChartType.value,
      currency: currencyMeta.value.code,
      point_focus: {
        timestamp: focus?.timestamp || '',
        close: Number(focus?.close || 0),
        change_pct: Number(focus?.change_pct || 0),
        volume: Number(focus?.volume || 0),
      },
      window_stats: {
        start_ts: chartWindowStats.value.startTs,
        end_ts: chartWindowStats.value.endTs,
        trend_pct: Number(chartWindowStats.value.trendPct || 0),
        high: Number(chartWindowStats.value.high || 0),
        low: Number(chartWindowStats.value.low || 0),
        range_pct: Number(chartWindowStats.value.rangePct || 0),
        avg_volume: Number(chartWindowStats.value.avgVolume || 0),
        latest_volume_ratio: Number(chartWindowStats.value.latestVolumeRatio || 1),
        up_candles: Number(chartWindowStats.value.upCandles || 0),
        down_candles: Number(chartWindowStats.value.downCandles || 0),
      },
    },
    xai_snapshot: xaiDrivers.value.slice(0, 5).map((item) => ({
      feature: String(item.feature || ''),
      shap_value: Number(item.shap_value || 0),
      direction: String(item.direction || ''),
    })),
    model_snapshot: {
      selected_model: String(forecastData.value.selected_model || 'N/A'),
      predicted_return: predictedReturnPct,
      confidence_pct: confidencePct,
      rmse: Number(modelMetric.rmse || 0),
      mae: Number(modelMetric.mae || 0),
      accuracy_pct: Number(modelMetric.accuracy || 0) * 100,
      sharpe_ratio: Number(modelMetric.sharpe_ratio || 0),
      cumulative_return_pct: Number(modelMetric.cumulative_return || 0) * 100,
    },
    performance_snapshot: {
      roi_pct: Number(performanceSnapshot.value.roiPct || 0),
      rri: Number(performanceSnapshot.value.rri || 0),
      volatility_pct: Number(performanceSnapshot.value.volatilityPct || 0),
      sample_points: Number(performanceSnapshot.value.samplePoints || 0),
      period_start_ts: performanceSnapshot.value.periodStartTs,
      period_end_ts: performanceSnapshot.value.periodEndTs,
    },
  }
})

const smartAnalysisPrompt = computed(() => {
  const modelName = String(forecastData.value.selected_model || 'N/A')
  const signal = String(signalLabel.value || 'Netral')
  const confidence = Number((forecastData.value.confidence_score || 0) * 100).toFixed(1)
  const timeframe = activeTimeframeId.value
  const granularity = intervalLabel.value
  return (
    `Lakukan analisis cerdas untuk ${selectedTicker.value} dengan horizon ${selectedHorizon.value} hari. ` +
    `Konteks saat ini: sinyal ${signal}, confidence ${confidence}%, model ${modelName}, range ${timeframe}, granularitas ${granularity}. ` +
    'Berikan brief keputusan yang bisa langsung dipakai analis: prolog singkat, detail pendukung, dan langkah lanjutan yang konkret ' +
    '(prioritas skenario, trigger harga, checklist proteksi risiko, serta pembacaan ROI/RRI/volatility).'
  )
})

const parseSmartAnalysis = (text) => {
  const source = String(text || '').trim()
  if (!source) return { prolog: '', details: [], actions: [] }

  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean)
  const prologLines = []
  const details = []
  const actions = []
  let mode = 'prolog'

  for (const line of lines) {
    if (/^(\*{0,2})detail pendukung(\*{0,2})\s*:?\s*$/i.test(line)) {
      mode = 'details'
      continue
    }
    if (/^(\*{0,2})langkah lanjutan(\*{0,2})\s*:?\s*$/i.test(line)) {
      mode = 'actions'
      continue
    }

    const bulletMatch = line.match(/^[-•]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/)
    if (bulletMatch) {
      const item = String(bulletMatch[1] || '').trim()
      if (!item) continue
      if (mode === 'actions') actions.push(item)
      else details.push(item)
      continue
    }

    if (mode === 'prolog') prologLines.push(line)
    else if (mode === 'actions') actions.push(line)
    else details.push(line)
  }

  const prolog = prologLines.join(' ').trim()
  return { prolog, details, actions }
}

const smartAnalysisSections = computed(() => parseSmartAnalysis(smartAnalysisRaw.value))

const smartAnalysisUpdatedLabel = computed(() => {
  if (!smartAnalysisUpdatedAt.value) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(smartAnalysisUpdatedAt.value))
  } catch {
    return '-'
  }
})

const runSmartAnalysis = async () => {
  if (smartAnalysisLoading.value) return
  smartAnalysisLoading.value = true
  smartAnalysisError.value = ''

  try {
    const result = await backendApi.runInfoCenter({
      question: smartAnalysisPrompt.value,
      ticker: selectedTicker.value,
      horizon: selectedHorizon.value,
      context: smartAnalysisClientContext.value,
    })
    smartAnalysisRaw.value = String(result?.answer || '').trim()
    smartAnalysisUpdatedAt.value = new Date().toISOString()
    smartAnalysisContextKey.value = smartAnalysisCurrentContextKey.value
    persistSmartAnalysisState()
  } catch (error) {
    smartAnalysisError.value = error instanceof Error ? error.message : 'Analisis cerdas gagal dijalankan.'
  } finally {
    smartAnalysisLoading.value = false
  }
}

const applyTimeframe = (item) => {
  selectedRange.value = item.range
}

const toggleBookmark = () => {
  isBookmarked.value = !isBookmarked.value
}

const resetToMonthly = () => {
  const monthly = timeframeOptions.find((item) => item.id === '1M')
  if (monthly) applyTimeframe(monthly)
}

const toggleChartFullscreen = () => {
  isChartFullscreen.value = !isChartFullscreen.value
}

const exportSeriesCsv = () => {
  const rows = points.value
  if (!rows.length) return

  const header = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
  const body = rows.map((row) => {
    return [
      row.timestamp,
      row.open,
      row.high,
      row.low,
      row.close,
      row.volume,
    ].join(',')
  })
  const csv = [header.join(','), ...body].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${selectedTicker.value}_${selectedRange.value}_${selectedInterval.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

const onMoreActions = async () => {
  await loadMarketData()
}

const stopLiveAutoRefresh = () => {
  if (liveRefreshTimer) {
    clearInterval(liveRefreshTimer)
    liveRefreshTimer = null
  }
}

const syncViewportAfterPointUpdate = () => {
  const totalPoints = points.value.length
  const visible = computeVisiblePointCount(totalPoints, zoomLevel.value, minVisiblePoints.value)
  const newMaxStart = Math.max(totalPoints - visible, 0)
  windowStart.value = newMaxStart
  selectedPointIndex.value = Math.max(visible - 1, 0)
}

const applyLivePayload = ({ quotePayload, ohlcvPayload }) => {
  const atRightEdge = windowStartClamped.value >= maxWindowStart.value - 1
  const previousPointCount = points.value.length

  quote.value = quotePayload
  ohlcv.value = ohlcvPayload

  if (atRightEdge || ohlcvPayload.points.length >= previousPointCount) {
    syncViewportAfterPointUpdate()
  } else {
    windowStart.value = clamp(windowStart.value, 0, Math.max(ohlcvPayload.points.length - visiblePointCount.value, 0))
    selectedPointIndex.value = clamp(selectedPointIndex.value, 0, Math.max(activePoints.value.length - 1, 0))
  }
}

const refreshLiveMarketData = async () => {
  if (!isLiveMode.value || isLoading.value || liveRequestInFlight) return
  liveRequestInFlight = true
  isLiveRefreshing.value = true
  liveError.value = ''

  try {
    const ticker = String(selectedTicker.value || 'ADRO').toUpperCase().replace('.JK', '')
    const [quoteRes, ohlcvRes] = await Promise.all([
      backendApi.getStockQuote(ticker, { fresh: true }),
      backendApi.getStockOhlcv(ticker, {
        interval: selectedInterval.value,
        range: selectedRange.value,
        fresh: true,
      }),
    ])
    applyLivePayload({ quotePayload: quoteRes, ohlcvPayload: ohlcvRes })
    lastLiveUpdateAt.value = new Date().toISOString()
  } catch (error) {
    liveError.value = error instanceof Error ? error.message : 'Live update market gagal.'
  } finally {
    isLiveRefreshing.value = false
    liveRequestInFlight = false
  }
}

const startLiveAutoRefresh = () => {
  stopLiveAutoRefresh()
  if (!isLiveMode.value) return

  liveRefreshTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    void refreshLiveMarketData()
  }, liveRefreshIntervalMs.value)
}

const toggleLiveMode = () => {
  isLiveMode.value = !isLiveMode.value
  if (isLiveMode.value) {
    void refreshLiveMarketData()
    startLiveAutoRefresh()
  } else {
    stopLiveAutoRefresh()
  }
}

const panBy = (deltaPoints) => {
  if (!displayPoints.value.length) return
  windowStart.value = clamp(windowStartClamped.value + deltaPoints, 0, maxWindowStart.value)
}

const panLeft = () => {
  const step = Math.max(1, Math.round(visiblePointCount.value * 0.2))
  panBy(-step)
}

const panRight = () => {
  const step = Math.max(1, Math.round(visiblePointCount.value * 0.2))
  panBy(step)
}

const changeZoom = (nextZoom, anchorRatio = 0.5) => {
  const total = points.value.length
  if (!total) return

  const clampedZoom = clamp(Math.round(nextZoom), 1, maxZoomLevel.value)
  if (clampedZoom === zoomLevel.value) return

  const oldVisible = visiblePointCount.value
  const oldStart = windowStartClamped.value
  const safeAnchor = clamp(anchorRatio, 0, 1)
  const anchorGlobalIdx = oldStart + Math.round((oldVisible - 1) * safeAnchor)

  zoomLevel.value = clampedZoom

  const newVisible = computeVisiblePointCount(total, clampedZoom, minVisiblePoints.value)
  const newMaxStart = Math.max(total - newVisible, 0)
  const newStart = clamp(
    anchorGlobalIdx - Math.round((newVisible - 1) * safeAnchor),
    0,
    newMaxStart,
  )
  windowStart.value = newStart
  selectedPointIndex.value = clamp(anchorGlobalIdx - newStart, 0, Math.max(newVisible - 1, 0))
}

const zoomIn = (anchorRatio = 0.5) => {
  changeZoom(zoomLevel.value + 1, anchorRatio)
}

const zoomOut = (anchorRatio = 0.5) => {
  changeZoom(zoomLevel.value - 1, anchorRatio)
}

const showScrollbarBriefly = () => {
  isScrollbarVisible.value = true
  if (scrollbarHideTimer) clearTimeout(scrollbarHideTimer)
  scrollbarHideTimer = setTimeout(() => {
    if (!isScrollbarDragging) isScrollbarVisible.value = false
  }, 1200)
}

const scrollbarThumb = computed(() => {
  const total = points.value.length
  const visible = visiblePointCount.value
  if (!total || visible >= total) return { left: 0, width: 100, show: false }
  const width = Math.max((visible / total) * 100, 6)
  const maxStart = Math.max(total - visible, 1)
  const left = (windowStartClamped.value / maxStart) * (100 - width)
  return { left, width, show: true }
})

const onScrollbarPointerDown = (event) => {
  event.preventDefault()
  event.stopPropagation()
  isScrollbarDragging = true
  scrollbarDragStartX = event.clientX
  scrollbarDragStartWindowStart = windowStartClamped.value
  showScrollbarBriefly()

  const onMove = (moveEvent) => {
    const track = event.currentTarget?.parentElement
    if (!track) return
    const rect = track.getBoundingClientRect()
    const deltaRatio = (moveEvent.clientX - scrollbarDragStartX) / Math.max(rect.width, 1)
    const total = points.value.length
    const visible = visiblePointCount.value
    const maxStart = Math.max(total - visible, 0)
    windowStart.value = clamp(
      scrollbarDragStartWindowStart + Math.round(deltaRatio * maxStart),
      0,
      maxStart,
    )
    selectedPointIndex.value = clamp(selectedPointIndex.value, 0, Math.max(visible - 1, 0))
  }

  const onUp = () => {
    isScrollbarDragging = false
    showScrollbarBriefly()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const onScrollbarTrackClick = (event) => {
  const track = event.currentTarget
  if (!track) return
  const rect = track.getBoundingClientRect()
  const clickRatio = (event.clientX - rect.left) / Math.max(rect.width, 1)
  const total = points.value.length
  const visible = visiblePointCount.value
  const maxStart = Math.max(total - visible, 0)
  const targetCenter = Math.round(clickRatio * total)
  windowStart.value = clamp(targetCenter - Math.floor(visible / 2), 0, maxStart)
  selectedPointIndex.value = clamp(selectedPointIndex.value, 0, Math.max(visible - 1, 0))
  showScrollbarBriefly()
}

const noop = () => {
}

let wheelAccumulator = 0
let wheelCooldownTimer = null
const WHEEL_ZOOM_THRESHOLD = 80
const WHEEL_ZOOM_COOLDOWN_MS = 180

const onChartWheel = (event) => {
  if (!displayPoints.value.length) return
  const rect = event.currentTarget?.getBoundingClientRect()
  if (!rect) return

  // Horizontal trackpad swipe → pan the chart immediately
  const absX = Math.abs(event.deltaX)
  const absY = Math.abs(event.deltaY)
  if (absX > absY && absX > 2) {
    const total = points.value.length
    const visible = visiblePointCount.value
    const maxStart = Math.max(total - visible, 0)
    const panSensitivity = Math.max(1, Math.round(visible * 0.04))
    const panDelta = event.deltaX > 0 ? panSensitivity : -panSensitivity
    windowStart.value = clamp(windowStartClamped.value + panDelta, 0, maxStart)
    selectedPointIndex.value = clamp(selectedPointIndex.value, 0, Math.max(visible - 1, 0))
    showScrollbarBriefly()
    return
  }

  // Vertical scroll → zoom with accumulation
  const x = ((event.clientX - rect.left) / rect.width) * chartWidth
  const ratio = clamp((x - padLeft) / Math.max(chartRight - padLeft, 1), 0, 1)

  wheelAccumulator += event.deltaY

  if (wheelCooldownTimer) return

  const absAccum = Math.abs(wheelAccumulator)
  if (absAccum < WHEEL_ZOOM_THRESHOLD) return

  const direction = wheelAccumulator < 0 ? 'in' : 'out'
  wheelAccumulator = 0

  if (direction === 'in') {
    zoomIn(ratio)
  } else {
    zoomOut(ratio)
  }

  showScrollbarBriefly()

  wheelCooldownTimer = setTimeout(() => {
    wheelCooldownTimer = null
  }, WHEEL_ZOOM_COOLDOWN_MS)
}

const onChartPointerDown = (event) => {
  if (typeof event.button === 'number' && event.button !== 0) return
  if (!displayPoints.value.length) return
  isChartDragging.value = true
  dragStartX.value = event.clientX
  dragStartWindowStart.value = windowStartClamped.value
  event.currentTarget?.setPointerCapture?.(event.pointerId)
  showScrollbarBriefly()
}

const onChartPointerDrag = (event) => {
  if (!isChartDragging.value) return
  const rect = event.currentTarget?.getBoundingClientRect()
  if (!rect) return
  const deltaX = event.clientX - dragStartX.value
  const deltaRatio = deltaX / Math.max(rect.width, 1)
  const deltaPoints = Math.round(-deltaRatio * Math.max(visiblePointCount.value - 1, 1))
  windowStart.value = clamp(
    dragStartWindowStart.value + deltaPoints,
    0,
    maxWindowStart.value,
  )
  showScrollbarBriefly()
}

const onChartPointerUp = (event) => {
  isChartDragging.value = false
  event.currentTarget?.releasePointerCapture?.(event.pointerId)
}

const onChartPointerMove = (event) => {
  if (isChartDragging.value) return
  const rect = event.currentTarget?.getBoundingClientRect()
  if (!rect || !activePoints.value.length) return
  const x = ((event.clientX - rect.left) / rect.width) * chartWidth
  const step = (chartRight - padLeft) / Math.max(activePoints.value.length - 1, 1)
  selectedPointIndex.value = Math.round((x - padLeft) / step)
}

const syncQuery = async () => {
  await router.replace({
    query: {
      ...route.query,
      ticker: selectedTicker.value,
      range: selectedRange.value,
      interval: selectedInterval.value,
      granularity: selectedGranularity.value,
      currency: selectedCurrency.value,
      zoom: String(zoomLevel.value),
      live: isLiveMode.value ? 'on' : 'off',
      horizon: String(selectedHorizon.value),
    },
  })
}

const loadResearchIngestFeed = async (ticker) => {
  ingestFeedLoading.value = true
  ingestFeedError.value = ''
  try {
    ingestFeed.value = await backendApi.getResearchIngestFeed({
      ticker,
      newsLimit: 12,
      snapshotLimit: 12,
    })
  } catch (error) {
    ingestFeedError.value = error instanceof Error ? error.message : 'Feed riset belum tersedia.'
  } finally {
    ingestFeedLoading.value = false
  }
}

const loadMarketData = async ({ sync = true } = {}) => {
  isLoading.value = true
  loadError.value = ''

  try {
    const ticker = String(selectedTicker.value || 'ADRO').toUpperCase().replace('.JK', '')
    const [overviewRes, quoteRes, ohlcvRes, forecastRes, explainRes, evalRes, catalogRes] = await Promise.all([
      backendApi.getMarketOverview(),
      backendApi.getStockQuote(ticker, { fresh: true }),
      backendApi.getStockOhlcv(ticker, { interval: selectedInterval.value, range: selectedRange.value, fresh: true }),
      backendApi.getForecast(ticker, selectedHorizon.value),
      backendApi.getExplanation(ticker, selectedHorizon.value).catch(() => null),
      backendApi.getEvaluationSummary().catch(() => null),
      backendApi.getForecastRuntimeCatalog().catch(() => null),
    ])

    marketOverview.value = overviewRes
    quote.value = quoteRes
    ohlcv.value = ohlcvRes
    forecast.value = forecastRes
    explanation.value = explainRes
    evaluation.value = evalRes
    forecastCatalog.value = catalogRes
    windowStart.value = maxWindowStart.value
    selectedPointIndex.value = Math.max(activePoints.value.length - 1, 0)
    selectedTicker.value = ticker
    lastLiveUpdateAt.value = new Date().toISOString()
    await loadResearchIngestFeed(ticker)
    if (sync) await syncQuery()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Gagal memuat data market.'
  } finally {
    isLoading.value = false
    startLiveAutoRefresh()
  }
}

const onTickerCommit = async () => {
  selectedTicker.value = String(selectedTicker.value || '').toUpperCase().replace('.JK', '')
  if (!selectedTicker.value) selectedTicker.value = 'ADRO'
  await loadMarketData()
}

watch([selectedRange, selectedGranularity, selectedHorizon], async ([, granularityValue]) => {
  zoomLevel.value = clamp(defaultZoomForGranularity(granularityValue), 1, maxZoomLevel.value)
  await loadMarketData()
})

watch([selectedChartType, selectedCurrency], () => {
  selectedPointIndex.value = Math.max(activePoints.value.length - 1, 0)
})

watch([points, zoomLevel], () => {
  windowStart.value = clamp(windowStart.value, 0, maxWindowStart.value)
  selectedPointIndex.value = clamp(selectedPointIndex.value, 0, Math.max(activePoints.value.length - 1, 0))
})

watch(maxZoomLevel, (value) => {
  zoomLevel.value = clamp(zoomLevel.value, 1, value)
})

watch([quote, forecast, explanation, smartAnalysisRaw, ingestFeed], () => {
  try {
    setPageContext({
      pageName: 'Market Watch',
      marketWatchState: smartAnalysisClientContext.value,
      liveNewsContext: ingestNewsItems.value,
    })
  } catch {
    // ignore
  }
}, { deep: true })

onMounted(() => {
  restoreSmartAnalysisState()
  void loadMarketData({ sync: false })
})

onBeforeUnmount(() => {
  clearPageContext()
  stopLiveAutoRefresh()
  if (wheelCooldownTimer) {
    clearTimeout(wheelCooldownTimer)
    wheelCooldownTimer = null
  }
  if (scrollbarHideTimer) {
    clearTimeout(scrollbarHideTimer)
    scrollbarHideTimer = null
  }
})
</script>

<template>
  <div class="market-page">
    <p v-if="loadError" class="market-error">{{ loadError }}</p>

    <section class="market-shell">
      <header class="market-shell__topbar">
        <label class="market-search">
          <i class="ri-search-line" aria-hidden="true" />
          <input
            v-model="selectedTicker"
            list="market-ticker-options"
            placeholder="Cari ticker IDX30"
            @change="onTickerCommit"
            @blur="onTickerCommit"
            @keyup.enter="onTickerCommit"
          />
          <datalist id="market-ticker-options">
            <option v-for="ticker in tickerOptions" :key="ticker" :value="ticker" />
          </datalist>
        </label>

        <div class="market-shell__actions">
          <label class="market-mini-control">
            <span>Horizon</span>
            <select v-model.number="selectedHorizon">
              <option v-for="h in [1, 5, 10]" :key="h" :value="h">{{ h }} hari</option>
            </select>
          </label>
          <label class="market-mini-control">
            <span>Granularitas</span>
            <select v-model="selectedGranularity">
              <option v-for="option in granularityOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
            </select>
          </label>
          <button
            type="button"
            class="market-action"
            :class="{ 'market-action--secondary-active': isBookmarked }"
            @click="toggleBookmark"
          >
            {{ isBookmarked ? 'Tersimpan' : 'Watchlist' }}
          </button>
          <button type="button" class="market-action market-action--primary" :disabled="isLoading" @click="loadMarketData()">
            {{ isLoading ? 'Memuat...' : 'Refresh' }}
          </button>
        </div>
      </header>

      <section class="market-instrument">
        <div class="market-instrument__identity">
          <div class="market-instrument__avatar">{{ selectedTicker.slice(0, 2) }}</div>
          <div>
            <p>{{ selectedTicker }} IDX30 · harga terkini</p>
            <h2>
              Rp {{ Number(quoteData.price || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              <small :class="isUp ? 'is-up' : 'is-down'">{{ isUp ? '+' : '' }}{{ Number(quoteData.change_pct || 0).toFixed(2) }}%</small>
            </h2>
            <span>Update {{ quoteUpdated }}</span>
          </div>
        </div>
        <div class="market-instrument__signal">
          <p>Sinyal model</p>
          <strong>{{ signalLabel }} · {{ ((forecastData.confidence_score || 0) * 100).toFixed(1) }}%</strong>
          <small>{{ forecastData.selected_model || 'Model belum tersedia' }}</small>
        </div>
      </section>

      <section class="market-stat-strip">
        <article>
          <span>Market cap estimasi</span>
          <strong>Rp {{ estMarketCap.toLocaleString('id-ID', { maximumFractionDigits: 0 }) }}</strong>
          <small>{{ marketSummary.advancers || 0 }} saham menguat</small>
        </article>
        <article>
          <span>Volume transaksi</span>
          <strong>{{ Number(quoteData.volume || 0).toLocaleString('id-ID') }}</strong>
          <small>{{ marketSummary.decliners || 0 }} saham melemah</small>
        </article>
        <article>
          <span>Fully diluted cap</span>
          <strong>Rp {{ estDilutedCap.toLocaleString('id-ID', { maximumFractionDigits: 0 }) }}</strong>
          <small>Perkiraan berbasis harga-volume</small>
        </article>
        <article>
          <span>Circulating supply</span>
          <strong>{{ estSupply.toLocaleString('id-ID', { maximumFractionDigits: 0 }) }}</strong>
          <small>Satuan lot ekuivalen</small>
        </article>
      </section>

      <section class="market-chart-panel">
        <header class="market-chart-panel__header">
          <div>
            <p>Market chart</p>
            <h3>{{ selectedTicker }} {{ currencyMeta.code }} to {{ currencyMeta.code }} Chart · {{ intervalLabel }}</h3>
          </div>
          <div class="market-live-indicator">
            <span class="market-live-dot" :class="{ 'is-off': !isLiveMode }" />
            <strong>{{ isLiveMode ? (isLiveRefreshing ? 'Live syncing' : 'Live aktif') : 'Live nonaktif' }}</strong>
            <small>Update {{ liveUpdatedLabel }}</small>
          </div>
        </header>

        <div class="market-chart-toolbar">
          <div class="market-tabset market-tabset--metric">
            <button :class="{ 'is-active': selectedChartType === 'price' }" @click="selectedChartType = 'price'">Price</button>
            <button :class="{ 'is-active': selectedChartType === 'market_cap' }" @click="selectedChartType = 'market_cap'">Market Cap</button>
            <button :class="{ 'is-active': selectedChartType === 'candle' }" @click="selectedChartType = 'candle'">Candle Chart</button>
          </div>

          <div class="market-toolbar-right">
            <div class="market-timeframe">
              <button
                v-for="item in timeframeOptions"
                :key="item.id"
                :class="{ 'is-active': activeTimeframeId === item.id }"
                @click="applyTimeframe(item)"
              >
                {{ item.id }}
              </button>
            </div>

            <div class="market-icon-actions">
              <button type="button" title="Kembali ke 1M" @click="resetToMonthly">
                <i class="ri-calendar-2-line" aria-hidden="true" />
              </button>
              <button type="button" :class="{ 'is-active': isBookmarked }" title="Simpan watchlist" @click="toggleBookmark">
                <i class="ri-star-line" aria-hidden="true" />
              </button>
              <button type="button" title="Unduh data CSV" @click="exportSeriesCsv">
                <i class="ri-download-2-line" aria-hidden="true" />
              </button>
              <button type="button" :class="{ 'is-active': isChartFullscreen }" title="Perbesar chart" @click="toggleChartFullscreen">
                <i class="ri-fullscreen-line" aria-hidden="true" />
              </button>
              <button type="button" title="Aksi lainnya" @click="onMoreActions">
                <i class="ri-more-fill" aria-hidden="true" />
              </button>
              <button type="button" :class="{ 'is-active': isLiveMode }" :title="isLiveMode ? 'Matikan live update' : 'Hidupkan live update'" @click="toggleLiveMode">
                <i class="ri-radar-line" aria-hidden="true" />
              </button>
            </div>

            <div class="market-zoom-actions">
              <button type="button" title="Geser kiri" @click="panLeft">
                <i class="ri-arrow-left-s-line" aria-hidden="true" />
              </button>
              <button type="button" title="Zoom out" @click="zoomOut()">
                <i class="ri-zoom-out-line" aria-hidden="true" />
              </button>
              <span>{{ zoomLevel }}x / {{ maxZoomLevel }}x</span>
              <button type="button" title="Zoom in" @click="zoomIn()">
                <i class="ri-zoom-in-line" aria-hidden="true" />
              </button>
              <button type="button" title="Geser kanan" @click="panRight">
                <i class="ri-arrow-right-s-line" aria-hidden="true" />
              </button>
            </div>

            <div class="market-currency-toggle market-currency-toggle--inline">
              <button :class="{ 'is-active': selectedCurrency === 'idr' }" @click="selectedCurrency = 'idr'">Rupiah</button>
              <button :class="{ 'is-active': selectedCurrency === 'usd' }" @click="selectedCurrency = 'usd'">USD</button>
              <button :class="{ 'is-active': selectedCurrency === 'btc' }" @click="selectedCurrency = 'btc'">BTC</button>
            </div>
          </div>
        </div>

        <p v-if="intervalNotice" class="market-chart-note">{{ intervalNotice }}</p>
        <p v-if="liveError" class="market-chart-note market-chart-note--error">{{ liveError }}</p>

        <div class="market-chart-wrap" :class="{ 'is-fullscreen': isChartFullscreen }">
          <svg
            viewBox="0 0 980 380"
            role="img"
            aria-label="Grafik market"
            @pointerdown="onChartPointerDown"
            @pointermove="
              (event) => {
                onChartPointerDrag(event)
                onChartPointerMove(event)
              }
            "
            @pointerup="onChartPointerUp"
            @pointercancel="onChartPointerUp"
            @wheel.prevent="onChartWheel"
          >
            <line
              v-for="(tick, idx) in yTicks"
              :key="`y-${idx}`"
              class="market-grid-line"
              :x1="padLeft"
              :x2="chartRight"
              :y1="tick.y"
              :y2="tick.y"
            />

            <template v-if="selectedChartType === 'candle'">
              <g v-for="(bar, idx) in candlePoints" :key="`bar-${idx}`">
                <line :class="['market-candle-wick', bar.isUp ? 'market-candle-wick--up' : 'market-candle-wick--down']" :x1="bar.x" :x2="bar.x" :y1="bar.highY" :y2="bar.lowY" />
                <rect
                  :x="bar.x - bar.width / 2"
                  :y="Math.min(bar.openY, bar.closeY)"
                  :width="bar.width"
                  :height="Math.max(Math.abs(bar.closeY - bar.openY), 1.5)"
                  :class="['market-candle-body', bar.isUp ? 'market-candle-body--up' : 'market-candle-body--down']"
                />
              </g>
            </template>
            <template v-else>
              <defs>
                <linearGradient id="mkLineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--mk-line-stroke)" stop-opacity="0.18" />
                  <stop offset="100%" stop-color="var(--mk-line-stroke)" stop-opacity="0.01" />
                </linearGradient>
              </defs>
              <path v-if="lineAreaPath" class="market-chart__area" :d="lineAreaPath" />
              <polyline class="market-chart__line" :points="linePath" />
            </template>

            <line class="market-chart__cursor" :x1="selectedPoint.x" :x2="selectedPoint.x" :y1="padTop" :y2="chartBottom" />
            <line class="market-chart__cursor" :x1="padLeft" :x2="chartRight" :y1="selectedPoint.y" :y2="selectedPoint.y" />
            <circle class="market-chart__dot" :cx="selectedPoint.x" :cy="selectedPoint.y" r="5" />
          </svg>

          <div v-if="!hasChartData && !isLoading" class="market-chart-empty">
            <i class="ri-line-chart-line" aria-hidden="true" />
            <p>Data chart belum tersedia untuk kombinasi filter ini.</p>
          </div>

          <div v-if="isLoading" class="market-chart-loading">
            <div class="market-chart-loading__pulse" />
            <div class="market-chart-loading__pulse" />
            <div class="market-chart-loading__pulse" />
            <span>Memuat data market...</span>
          </div>

          <ul class="market-y-axis">
            <li v-for="(tick, idx) in yTicks" :key="`ylabel-${idx}`" :style="{ top: `${tick.y - 8}px` }">
              <span>{{ formatLargeSeriesValue(tick.value) }}</span>
            </li>
          </ul>

          <div v-if="activePoints.length" class="market-y-focus" :style="{ top: `${selectedPoint.y}px` }">
            {{ selectedYLabel }}
          </div>

          <div v-if="activePoints.length" class="market-x-focus" :style="{ left: `${selectedPoint.x}px` }">
            {{ selectedXLabel }}
          </div>

          <div
            v-if="activePoints.length"
            class="market-tooltip"
            :style="{
              left: `${Math.min(Math.max(selectedPoint.x - 128, 18), 760)}px`,
              top: `${Math.max(selectedPoint.y - 102, 14)}px`,
            }"
          >
            <small>{{ selectedTooltip.title }}</small>
            <strong>{{ selectedTooltip.main }}</strong>
            <p>{{ selectedTooltip.sub }}</p>
            <p v-if="selectedTooltip.extra">{{ selectedTooltip.extra }}</p>
          </div>
          <div
            v-if="scrollbarThumb.show"
            :class="['market-chart-scrollbar', isScrollbarVisible ? 'is-visible' : '']"
            @click.self="onScrollbarTrackClick"
          >
            <div
              class="market-chart-scrollbar__thumb"
              :style="{ left: scrollbarThumb.left + '%', width: scrollbarThumb.width + '%' }"
              @pointerdown="onScrollbarPointerDown"
            />
          </div>
        </div>

        <div class="market-x-axis">
          <span v-for="tick in xTicks" :key="`x-${tick.idx}`" :style="{ left: `${tick.x}px` }">{{ tick.label }}</span>
        </div>
      </section>

      <section class="market-lower-grid">
        <article class="market-lower-card market-lower-card--model">
          <p>Ringkasan model</p>
          <div class="market-model-head">
            <h4>{{ forecastData.selected_model || 'N/A' }}</h4>
            <div class="market-model-head__chips">
              <span class="market-model-chip">{{ modelModeLabel }}</span>
              <span class="market-model-chip">H{{ selectedHorizon }}</span>
            </div>
          </div>

          <div class="market-model-grid">
            <article v-for="item in modelSummaryRows" :key="item.label" class="market-model-grid__item">
              <span>{{ item.label }}</span>
              <strong :class="item.tone">{{ item.value }}</strong>
            </article>
          </div>

          <div class="market-model-note">
            <span class="market-model-signal">{{ modelSignalLabel }}</span>
            <small>{{ forecastData.notes || 'Model runtime aktif untuk inferensi ticker ini.' }}</small>
          </div>
        </article>

        <article class="market-lower-card market-lower-card--performance">
          <div class="market-performance-head">
            <div>
              <p>Performance analysis</p>
              <h4>ROI · RRI · Volatility</h4>
            </div>
            <small>{{ performanceMetricDate }}</small>
          </div>
          <ul class="market-performance-list">
            <li v-for="item in performanceMetricRows" :key="item.code">
              <div class="market-performance-label">
                <span class="market-performance-code">{{ item.code }}</span>
                <span>{{ item.label }}</span>
              </div>
              <strong :class="item.tone">{{ item.value }}</strong>
            </li>
          </ul>
          <div v-if="performanceSparkGeometry.polyline" class="market-performance-spark">
            <svg viewBox="0 0 300 110" preserveAspectRatio="none">
              <defs>
                <linearGradient id="marketPerfFill" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="rgba(224,95,121,0.42)" />
                  <stop offset="100%" stop-color="rgba(224,95,121,0.03)" />
                </linearGradient>
              </defs>

              <line
                v-for="(gridY, idx) in performanceSparkGeometry.gridY"
                :key="`perf-grid-${idx}`"
                class="market-performance-grid"
                x1="6"
                x2="294"
                :y1="gridY"
                :y2="gridY"
              />

              <path class="market-performance-area" :d="performanceSparkGeometry.areaPath" />
              <polyline :points="performanceSparkGeometry.polyline" />
              <circle
                v-if="performanceSparkGeometry.lastPoint"
                class="market-performance-point"
                :cx="performanceSparkGeometry.lastPoint.x"
                :cy="performanceSparkGeometry.lastPoint.y"
                r="4.5"
              />
            </svg>
            <div class="market-performance-spark__foot">
              <span :class="['market-performance-pill', performanceTrendTone]">{{ performanceTrendLabel }}</span>
              <span>{{ performanceSparkLastLabel }}</span>
            </div>
          </div>
        </article>

        <article class="market-lower-card">
          <p>Top movers IDX30</p>
          <div class="market-mini-columns">
            <div>
              <h5>Gainers</h5>
              <ul>
                <li v-for="item in topGainers.slice(0, 4)" :key="`g-${item.ticker}`">
                  <span>{{ item.ticker }}</span>
                  <strong class="is-up">+{{ Number(item.change_pct || 0).toFixed(2) }}%</strong>
                </li>
              </ul>
            </div>
            <div>
              <h5>Losers</h5>
              <ul>
                <li v-for="item in topLosers.slice(0, 4)" :key="`l-${item.ticker}`">
                  <span>{{ item.ticker }}</span>
                  <strong class="is-down">{{ Number(item.change_pct || 0).toFixed(2) }}%</strong>
                </li>
              </ul>
            </div>
          </div>
        </article>

        <article class="market-lower-card">
          <p>Faktor dominan XAI</p>
          <ul>
            <li v-for="item in xaiDrivers" :key="item.feature">
              <span>{{ item.feature }}</span>
              <strong :class="xaiImpactClass(item.direction)">
                {{ Number(item.shap_value || 0).toFixed(4) }}
              </strong>
            </li>
          </ul>
          <small v-if="!xaiDrivers.length">{{ xaiFallbackNote }}</small>
        </article>
      </section>

      <section class="market-smart-grid">
        <article class="market-smart-card market-smart-card--variables">
          <span class="market-smart-kicker">Peta variabel analisis</span>
          <h4>Seluruh variabel yang digunakan dalam analisis market</h4>
          <div class="market-smart-kpis">
            <div>
              <span>Total variabel</span>
              <strong>{{ totalAnalysisVariableCount }}</strong>
            </div>
            <div>
              <span>Variabel fitur model</span>
              <strong>{{ runtimeFeatureColumns.length }}</strong>
            </div>
            <div>
              <span>Faktor XAI aktif</span>
              <strong>{{ dynamicXaiVariableNames.length }}</strong>
            </div>
          </div>

          <div class="market-variable-groups">
            <article v-for="group in analysisFieldGroups" :key="group.title" class="market-variable-group">
              <header>
                <h5>{{ group.title }}</h5>
                <span>{{ group.items.length }} variabel</span>
              </header>
              <p>{{ group.note }}</p>
              <ul>
                <li v-for="item in group.items" :key="`${group.title}-${item}`">{{ item }}</li>
              </ul>
            </article>
          </div>
        </article>

        <article class="market-smart-card market-smart-card--agent">
          <header class="market-smart-head">
            <span class="market-smart-kicker">Analisis cerdas</span>
            <span class="market-smart-mode">Trigger manual</span>
          </header>
          <h4>Brief keputusan berbasis agent</h4>
          <p class="market-smart-description">
            Jalankan analisis sekali klik untuk merangkum kondisi ticker, kualitas model, faktor utama, dan arahan tindak lanjut.
          </p>

          <button
            type="button"
            class="market-smart-trigger"
            :class="{ 'is-loading': smartAnalysisLoading }"
            :disabled="smartAnalysisLoading"
            @click="runSmartAnalysis"
          >
            <i class="ri-brain-line" aria-hidden="true" />
            <span>{{ smartAnalysisLoading ? 'Sedang menganalisis...' : 'Lakukan Analisis Cerdas' }}</span>
          </button>

          <div v-if="smartAnalysisLoading" class="market-smart-loading-card" aria-live="polite">
            <div class="market-smart-loading-title">
              <i class="ri-loader-4-line" aria-hidden="true" />
              <strong>Agent sedang menyusun analisis</strong>
            </div>
            <div class="market-smart-loading-bars">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div class="market-smart-loading-skeleton">
              <span />
              <span />
              <span />
            </div>
          </div>

          <p v-if="smartAnalysisError" class="market-smart-error">{{ smartAnalysisError }}</p>
          <p v-if="smartAnalysisIsStale && !smartAnalysisLoading" class="market-smart-stale">
            Hasil analisis terakhir belum sesuai filter terbaru. Jalankan ulang untuk konteks terkini.
          </p>

          <transition name="market-smart-fade">
            <section v-if="smartAnalysisRaw" class="market-smart-result" :class="{ 'is-muted': smartAnalysisLoading }">
              <p v-if="smartAnalysisSections.prolog" class="market-smart-prolog">
                {{ smartAnalysisSections.prolog }}
              </p>

              <article v-if="smartAnalysisSections.details.length" class="market-smart-block">
                <h5>Detail pendukung</h5>
                <ul>
                  <li v-for="(item, idx) in smartAnalysisSections.details" :key="`detail-${idx}`">{{ item }}</li>
                </ul>
              </article>

              <article v-if="smartAnalysisSections.actions.length" class="market-smart-block">
                <h5>Langkah lanjutan</h5>
                <ol>
                  <li v-for="(item, idx) in smartAnalysisSections.actions" :key="`action-${idx}`">{{ item }}</li>
                </ol>
              </article>

              <small>Terakhir dianalisis: {{ smartAnalysisUpdatedLabel }}</small>
            </section>
          </transition>
        </article>
      </section>
    </section>
  </div>
</template>
