<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { getIdx30Meta, idx30SectorPriority } from '../../constants/idx30Meta'
import { backendApi } from '../../services/backendApi'
import { usePageContext } from '../../composables/usePageContext'
import '/src/styles/pages/portfolio-page.css'

const { setPageContext, clearPageContext } = usePageContext()

const portfolio = ref(null)
const ordersPayload = ref(null)
const marketOverview = ref(null)
const isLoading = ref(true)
const isRefreshing = ref(false)
const loadError = ref('')
const lastUpdatedAt = ref('')
const transactionTab = ref('buy')
const brokenLogos = ref({})
const trendingScroller = ref(null)
const trendCanScrollPrev = ref(false)
const trendCanScrollNext = ref(false)
const trendActiveIndex = ref(0)
const trendHasHydrated = ref(false)
const isDraggingTrend = ref(false)
const trendDragStartX = ref(0)
const trendScrollStart = ref(0)

let refreshTimerId = null

const SECTOR_COLORS = {
  Perbankan: '#4fa8ff',
  Energi: '#f5b94d',
  Telekomunikasi: '#58d0e0',
  Konsumer: '#9b8cff',
  'Material Dasar': '#f5808f',
  Industri: '#7adf9c',
  Teknologi: '#4dd7bf',
  Kesehatan: '#8fdc72',
  Konglomerasi: '#b6bfd2',
  Lainnya: '#6f7c77',
}

const normalizeTicker = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace('.JK', '')

const positions = computed(() => {
  const raw = Array.isArray(portfolio.value?.positions) ? portfolio.value.positions : []
  return raw.map((item) => {
    const ticker = normalizeTicker(item.ticker)
    const meta = getIdx30Meta(ticker)
    return {
      ticker,
      company: meta.company,
      sector: meta.sector,
      logoUrl: meta.logoUrl,
      qty: Number(item.qty || 0),
      avgPrice: Number(item.avg_price || 0),
      lastPrice: Number(item.last_price || 0),
      marketValue: Number(item.market_value || 0),
      unrealizedPnl: Number(item.unrealized_pnl || 0),
    }
  })
})

const orders = computed(() => {
  const raw = Array.isArray(ordersPayload.value?.items) ? ordersPayload.value.items : []
  return raw.map((item) => {
    const ticker = normalizeTicker(item.ticker)
    const meta = getIdx30Meta(ticker)
    return {
      orderId: String(item.order_id || ''),
      ticker,
      company: meta.company,
      sector: meta.sector,
      logoUrl: meta.logoUrl,
      side: String(item.side || '').toLowerCase(),
      qty: Number(item.qty || 0),
      fillPrice: Number(item.fill_price || 0),
      fee: Number(item.fee || 0),
      grossAmount: Number(item.gross_amount || 0),
      createdAt: item.created_at,
      status: String(item.status || '-'),
    }
  })
})

const cashBalance = computed(() => Number(portfolio.value?.cash_balance || 0))
const initialCash = computed(() => Number(portfolio.value?.initial_cash || 0))
const portfolioValue = computed(() => Number(portfolio.value?.portfolio_value || 0))
const realizedPnl = computed(() => Number(portfolio.value?.realized_pnl || 0))
const unrealizedPnl = computed(() => Number(portfolio.value?.unrealized_pnl || 0))
const totalPnl = computed(() => realizedPnl.value + unrealizedPnl.value)
const totalReturnPct = computed(() => Number(portfolio.value?.total_return_pct || 0))
const investedValue = computed(() => positions.value.reduce((sum, item) => sum + item.marketValue, 0))
const cashRatioPct = computed(() => (portfolioValue.value > 0 ? (cashBalance.value / portfolioValue.value) * 100 : 0))

const marketSummary = computed(() => marketOverview.value?.market_summary || {})
const marketBreadthText = computed(() => {
  const advancers = Number(marketSummary.value.advancers || 0)
  const total = Number(marketSummary.value.total_tickers || 0)
  if (!total) return 'Data market belum tersedia'
  return `${advancers}/${total} emiten menguat`
})

const trendCards = computed(() => {
  const gainers = Array.isArray(marketOverview.value?.top_gainers) ? marketOverview.value.top_gainers : []
  const losers = Array.isArray(marketOverview.value?.top_losers) ? marketOverview.value.top_losers : []
  const combined = [...gainers.slice(0, 8), ...losers.slice(0, 6)]

  if (combined.length) {
    const seen = new Set()
    return combined
      .map((item, idx) => {
        const ticker = normalizeTicker(item.ticker)
        const meta = getIdx30Meta(ticker)
        const changePct = Number(item.change_pct || 0)
        return {
          id: `${ticker}-${idx}`,
          ticker,
          company: meta.company,
          logoUrl: meta.logoUrl,
          price: Number(item.price || 0),
          changePct,
          tone: changePct >= 0 ? 'is-up' : 'is-down',
        }
      })
      .filter((item) => {
        if (seen.has(item.ticker)) return false
        seen.add(item.ticker)
        return true
      })
      .slice(0, 10)
  }

  return positions.value
    .slice()
    .sort((a, b) => Math.abs(b.unrealizedPnl) - Math.abs(a.unrealizedPnl))
    .slice(0, 10)
    .map((item, idx) => {
      const base = item.marketValue - item.unrealizedPnl
      const changePct = base > 0 ? (item.unrealizedPnl / base) * 100 : 0
      return {
        id: `${item.ticker}-${idx}`,
        ticker: item.ticker,
        company: item.company,
        logoUrl: item.logoUrl,
        price: item.lastPrice,
        changePct,
        tone: changePct >= 0 ? 'is-up' : 'is-down',
      }
    })
})

const updateTrendScrollState = () => {
  const scroller = trendingScroller.value
  if (!scroller) {
    trendCanScrollPrev.value = false
    trendCanScrollNext.value = false
    trendActiveIndex.value = 0
    return
  }

  const maxScrollLeft = Math.max(scroller.scrollWidth - scroller.clientWidth, 0)
  trendCanScrollPrev.value = scroller.scrollLeft > 8
  trendCanScrollNext.value = maxScrollLeft - scroller.scrollLeft > 8
  trendActiveIndex.value = getNearestTrendIndex(scroller)
}

const getTrendItems = (scroller) => {
  if (!scroller) return []
  return Array.from(scroller.querySelectorAll('.portfolio-trend-item'))
}

const getNearestTrendIndex = (scroller) => {
  const items = getTrendItems(scroller)
  if (!items.length) return 0

  const centerX = scroller.scrollLeft + scroller.clientWidth / 2
  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  items.forEach((item, index) => {
    const itemCenter = item.offsetLeft + item.offsetWidth / 2
    const distance = Math.abs(centerX - itemCenter)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  })
  return nearestIndex
}

const goToTrendSlide = (index, smooth = true) => {
  const scroller = trendingScroller.value
  if (!scroller) return
  const items = getTrendItems(scroller)
  if (!items.length) return

  const clampedIndex = Math.max(0, Math.min(index, items.length - 1))
  const item = items[clampedIndex]
  const targetLeft = item.offsetLeft - (scroller.clientWidth - item.offsetWidth) / 2

  scroller.scrollTo({
    left: Math.max(0, targetLeft),
    behavior: smooth ? 'smooth' : 'auto',
  })
  trendActiveIndex.value = clampedIndex
}

const scrollTrend = (direction) => {
  goToTrendSlide(trendActiveIndex.value + direction, true)
}

const onTrendScroll = () => {
  updateTrendScrollState()
}

const stopTrendDragging = () => {
  if (!isDraggingTrend.value) return
  isDraggingTrend.value = false
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointermove', onTrendPointerMove)
    window.removeEventListener('pointerup', stopTrendDragging)
    window.removeEventListener('pointercancel', stopTrendDragging)
  }
  updateTrendScrollState()
}

const onTrendPointerMove = (event) => {
  if (!isDraggingTrend.value || !trendingScroller.value) return
  const deltaX = event.clientX - trendDragStartX.value
  trendingScroller.value.scrollLeft = trendScrollStart.value - deltaX
}

const onTrendPointerDown = (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  if (!trendingScroller.value) return
  isDraggingTrend.value = true
  trendDragStartX.value = event.clientX
  trendScrollStart.value = trendingScroller.value.scrollLeft

  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', onTrendPointerMove)
    window.addEventListener('pointerup', stopTrendDragging)
    window.addEventListener('pointercancel', stopTrendDragging)
  }
}

const onWindowResize = () => {
  goToTrendSlide(trendActiveIndex.value, false)
  updateTrendScrollState()
}

const refreshTrendLayout = async () => {
  await nextTick()
  if (!trendHasHydrated.value && trendingScroller.value) {
    const items = getTrendItems(trendingScroller.value)
    trendActiveIndex.value = items.length > 1 ? 1 : 0
    trendHasHydrated.value = true
  }
  goToTrendSlide(trendActiveIndex.value, false)
  updateTrendScrollState()
}

const logoHidden = (ticker) => Boolean(brokenLogos.value[ticker])
const onLogoError = (ticker) => {
  brokenLogos.value = {
    ...brokenLogos.value,
    [ticker]: true,
  }
}

const loadPortfolioData = async ({ silent = false } = {}) => {
  if (!silent) isLoading.value = true
  isRefreshing.value = true
  loadError.value = ''

  try {
    const [portfolioRes, ordersRes, overviewRes] = await Promise.all([
      backendApi.getPaperPortfolio(),
      backendApi.getPaperOrders(120),
      backendApi.getMarketOverview().catch(() => null),
    ])
    portfolio.value = portfolioRes || {}
    ordersPayload.value = ordersRes || { total: 0, items: [] }
    marketOverview.value = overviewRes
    lastUpdatedAt.value = portfolioRes?.updated_at || new Date().toISOString()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Gagal memuat data portofolio.'
  } finally {
    isRefreshing.value = false
    isLoading.value = false
    await refreshTrendLayout()
  }
}

const startAutoRefresh = () => {
  if (typeof window === 'undefined') return
  if (refreshTimerId) window.clearInterval(refreshTimerId)
  refreshTimerId = window.setInterval(() => {
    void loadPortfolioData({ silent: true })
  }, 45000)
}

const stopAutoRefresh = () => {
  if (typeof window === 'undefined') return
  if (!refreshTimerId) return
  window.clearInterval(refreshTimerId)
  refreshTimerId = null
}

onMounted(async () => {
  await loadPortfolioData()
  startAutoRefresh()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onWindowResize)
  }
  await refreshTrendLayout()
})

onBeforeUnmount(() => {
  clearPageContext()
  stopAutoRefresh()
  stopTrendDragging()
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', onWindowResize)
  }
})

const marketMetricCards = computed(() => {
  const total = Number(marketSummary.value.total_tickers || 0)
  const advancers = Number(marketSummary.value.advancers || 0)
  const decliners = Number(marketSummary.value.decliners || 0)
  const meanChange = Number(marketSummary.value.mean_change_pct || 0)
  return [
    {
      label: 'Breadth pasar',
      value: total ? `${advancers}/${total}` : '-',
      note: 'Emiten berada di zona hijau',
      tone: advancers >= decliners ? 'is-up' : 'is-down',
    },
    {
      label: 'Rata-rata perubahan',
      value: `${meanChange >= 0 ? '+' : ''}${meanChange.toFixed(2)}%`,
      note: 'Perubahan harian IDX30',
      tone: meanChange >= 0 ? 'is-up' : 'is-down',
    },
    {
      label: 'Tekanan jual',
      value: `${decliners}`,
      note: 'Jumlah emiten melemah',
      tone: decliners > advancers ? 'is-down' : 'is-neutral',
    },
    {
      label: 'Kas terhadap aset',
      value: `${cashRatioPct.value.toFixed(1)}%`,
      note: 'Likuiditas portofolio',
      tone: cashRatioPct.value >= 20 ? 'is-up' : 'is-neutral',
    },
  ]
})

const sectorAllocationRows = computed(() => {
  const bySector = new Map()
  for (const item of positions.value) {
    const current = Number(bySector.get(item.sector) || 0)
    bySector.set(item.sector, current + item.marketValue)
  }

  const total = investedValue.value
  const rows = [...bySector.entries()].map(([sector, value], index) => {
    const weight = total > 0 ? (value / total) * 100 : 0
    return {
      sector,
      value,
      weight,
      color: SECTOR_COLORS[sector] || Object.values(SECTOR_COLORS)[index % Object.keys(SECTOR_COLORS).length],
    }
  })

  rows.sort((a, b) => {
    const aIdx = idx30SectorPriority.indexOf(a.sector)
    const bIdx = idx30SectorPriority.indexOf(b.sector)
    if (aIdx !== -1 && bIdx !== -1 && aIdx !== bIdx) return aIdx - bIdx
    if (aIdx !== -1 && bIdx === -1) return -1
    if (aIdx === -1 && bIdx !== -1) return 1
    return b.value - a.value
  })
  return rows
})

const sectorPieGradient = computed(() => {
  if (!sectorAllocationRows.value.length) {
    return 'conic-gradient(rgba(84, 102, 94, 0.6) 0deg 360deg)'
  }

  let cursor = 0
  const stops = []
  for (const item of sectorAllocationRows.value) {
    const sweep = (item.weight / 100) * 360
    const start = cursor
    const end = cursor + sweep
    stops.push(`${item.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`)
    cursor = end
  }

  if (cursor < 360) {
    stops.push(`rgba(87, 105, 98, 0.42) ${cursor.toFixed(2)}deg 360deg`)
  }
  return `conic-gradient(${stops.join(', ')})`
})

const allocationBars = computed(() => {
  const rows = sectorAllocationRows.value.slice(0, 8)
  if (!rows.length) return []

  const bars = []
  for (const row of rows) {
    const slot = Math.max(1, Math.round((row.weight / 100) * 24))
    for (let index = 0; index < slot; index += 1) {
      bars.push({ color: row.color, sector: row.sector, id: `${row.sector}-${index}` })
    }
  }
  return bars.slice(0, 28)
})

const kpiCards = computed(() => {
  return [
    {
      label: 'Portofolio Ringkasan',
      value: formatCurrency(portfolioValue.value),
      note: `Return total ${formatSignedPct(totalReturnPct.value)}`,
      tone: totalReturnPct.value >= 0 ? 'is-up' : 'is-down',
    },
    {
      label: 'Kas tersedia',
      value: formatCurrency(cashBalance.value),
      note: `Modal awal ${formatCurrency(initialCash.value)}`,
      tone: 'is-neutral',
    },
    {
      label: 'Unrealized P/L',
      value: formatSignedCurrency(unrealizedPnl.value),
      note: 'Nilai berjalan posisi aktif',
      tone: unrealizedPnl.value >= 0 ? 'is-up' : 'is-down',
    },
    {
      label: 'Realized P/L',
      value: formatSignedCurrency(realizedPnl.value),
      note: 'P/L transaksi yang sudah ditutup',
      tone: realizedPnl.value >= 0 ? 'is-up' : 'is-down',
    },
  ]
})

const activePositions = computed(() => {
  return positions.value
    .slice()
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 8)
})

const riskExposureRows = computed(() => {
  const total = investedValue.value
  return positions.value
    .map((item) => {
      const exposurePct = total > 0 ? (item.marketValue / total) * 100 : 0
      const baseline = item.marketValue - item.unrealizedPnl
      const pnlPct = baseline > 0 ? (item.unrealizedPnl / baseline) * 100 : 0
      return {
        ticker: item.ticker,
        company: item.company,
        sector: item.sector,
        logoUrl: item.logoUrl,
        exposurePct,
        pnlPct,
        marketValue: item.marketValue,
      }
    })
    .sort((a, b) => b.exposurePct - a.exposurePct)
    .slice(0, 8)
})

const buyOrdersCount = computed(() => orders.value.filter((item) => item.side === 'buy').length)
const sellOrdersCount = computed(() => orders.value.filter((item) => item.side === 'sell').length)

const filteredOrders = computed(() => {
  if (transactionTab.value === 'buy') return orders.value.filter((item) => item.side === 'buy')
  return orders.value.filter((item) => item.side === 'sell')
})
const isCompactTransactions = computed(() => filteredOrders.value.length <= 2)
const oppositeTabCount = computed(() => {
  if (transactionTab.value === 'buy') return sellOrdersCount.value
  return buyOrdersCount.value
})
const oppositeTabLabel = computed(() => (transactionTab.value === 'buy' ? 'Sold' : 'Bought'))

const WEEKDAY_CONFIG = [
  { label: 'Sen', day: 1 },
  { label: 'Sel', day: 2 },
  { label: 'Rab', day: 3 },
  { label: 'Kam', day: 4 },
  { label: 'Jum', day: 5 },
  { label: 'Sab', day: 6 },
  { label: 'Min', day: 0 },
]

const weeklyTradingActivity = computed(() => {
  const counters = new Map(WEEKDAY_CONFIG.map((item) => [item.day, 0]))

  for (const order of orders.value) {
    const date = new Date(order.createdAt)
    if (Number.isNaN(date.getTime())) continue
    counters.set(date.getDay(), Number(counters.get(date.getDay()) || 0) + 1)
  }

  const totalTrades = [...counters.values()].reduce((sum, value) => sum + value, 0)
  const peak = Math.max(...counters.values(), 1)
  const days = WEEKDAY_CONFIG.map((item) => {
    const count = Number(counters.get(item.day) || 0)
    return {
      ...item,
      count,
      heightPct: (count / peak) * 100,
    }
  })

  return { totalTrades, days }
})

const formatCurrency = (value) => {
  return Number(value || 0).toLocaleString('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  })
}

const formatSignedCurrency = (value) => {
  const numeric = Number(value || 0)
  const sign = numeric > 0 ? '+' : ''
  return `${sign}${formatCurrency(numeric)}`
}

const formatSignedPct = (value, digits = 2) => {
  const numeric = Number(value || 0)
  const sign = numeric > 0 ? '+' : ''
  return `${sign}${numeric.toFixed(digits)}%`
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
    }).format(new Date(value))
  } catch {
    return '-'
  }
}

const transactionFlowLabel = (order) => {
  const gross = Number(order.grossAmount || 0) + Number(order.fee || 0)
  if (order.side === 'buy') return `-${formatCurrency(gross)}`
  return `+${formatCurrency(Math.max(Number(order.grossAmount || 0) - Number(order.fee || 0), 0))}`
}

const transactionQtyLabel = (order) => {
  const qty = Number(order.qty || 0)
  return `${order.side === 'buy' ? '+' : '-'}${qty.toLocaleString('id-ID')}`
}

watch(() => [positions.value, orders.value, kpiCards.value], () => {
  try {
    setPageContext({
      pageName: 'Portofolio',
      activePositions: positions.value.map(p => ({ ticker: p.ticker, qty: p.qty, avgPrice: p.avgPrice, lastPrice: p.lastPrice, unrealizedPnl: p.unrealizedPnl })),
      transactionHistory: orders.value.slice(0, 15).map(o => ({ ticker: o.ticker, side: o.side, qty: o.qty, fillPrice: o.fillPrice, status: o.status, date: o.createdAt })),
      portfolioSummary: {
        portfolioValue: portfolioValue.value,
        cashBalance: cashBalance.value,
        unrealizedPnl: unrealizedPnl.value,
        realizedPnl: realizedPnl.value
      }
    })
  } catch {
    // ignore
  }
}, { deep: true })

</script>

<template>
  <div class="portfolio-page">
    <header class="portfolio-header">
      <div>
        <p class="portfolio-kicker">Portfolio workspace</p>
        <h2>Portofolio IDX30</h2>
        <p class="portfolio-subtitle">
          Ringkasan portofolio, posisi aktif, riwayat transaksi, risk exposure per ticker, serta alokasi sektor bisnis.
        </p>
      </div>

      <div class="portfolio-header__actions">
        <small>Update terakhir: {{ formatDateTime(lastUpdatedAt) }}</small>
        <button type="button" class="portfolio-refresh" :disabled="isRefreshing" @click="loadPortfolioData()">
          {{ isRefreshing ? 'Memuat...' : 'Refresh portofolio' }}
        </button>
      </div>
    </header>

    <p v-if="loadError" class="portfolio-error">{{ loadError }}</p>

    <section class="portfolio-top-row">
      <article class="portfolio-card portfolio-card--trending">
        <div class="portfolio-card__head portfolio-card__head--trending">
          <div>
            <p class="portfolio-kicker">Trending</p>
            <h3>Pergerakan emiten prioritas</h3>
          </div>
          <div class="portfolio-trending-controls">
            <small>{{ marketBreadthText }}</small>
            <div class="portfolio-trending-actions">
              <button type="button" class="portfolio-trending-link">View all</button>
              <div class="portfolio-slider-nav">
                <button
                  type="button"
                  aria-label="Geser kartu ke kiri"
                  :disabled="!trendCanScrollPrev"
                  @click="scrollTrend(-1)"
                >
                  &lsaquo;
                </button>
                <button
                  type="button"
                  aria-label="Geser kartu ke kanan"
                  :disabled="!trendCanScrollNext"
                  @click="scrollTrend(1)"
                >
                  &rsaquo;
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="isLoading" class="portfolio-empty">Memuat daftar emiten...</div>
        <div v-else-if="!trendCards.length" class="portfolio-empty">Belum ada data trending untuk saat ini.</div>
        <div v-else class="portfolio-trending-slider-wrap">
          <div
            ref="trendingScroller"
            class="portfolio-trending-slider"
            :class="{ 'is-dragging': isDraggingTrend }"
            @pointerdown="onTrendPointerDown"
            @scroll.passive="onTrendScroll"
          >
            <article
              v-for="(item, index) in trendCards"
              :key="item.id"
              class="portfolio-trend-item"
              :class="[
                { 'is-active': index === trendActiveIndex },
                item.changePct >= 0 ? 'trend-up' : 'trend-down',
              ]"
            >
              <div class="portfolio-trend-head">
                <div class="portfolio-logo">
                  <img
                    v-if="item.logoUrl && !logoHidden(item.ticker)"
                    :src="item.logoUrl"
                    :alt="`Logo ${item.company}`"
                    loading="lazy"
                    @error="onLogoError(item.ticker)"
                  />
                  <span v-else>{{ item.ticker.slice(0, 2) }}</span>
                </div>
                <div>
                  <strong>{{ item.ticker }}</strong>
                  <small>{{ item.company }}</small>
                </div>
              </div>
              <svg class="portfolio-trend-wave" viewBox="0 0 240 78" aria-hidden="true">
                <path d="M0,52 C16,48 24,70 39,60 C52,52 61,37 74,44 C88,52 96,30 111,32 C125,35 133,50 146,41 C158,33 168,17 182,24 C193,30 204,47 214,39 C222,32 231,28 240,30" />
              </svg>
              <div class="portfolio-trend-price">
                <p>{{ formatCurrency(item.price) }}</p>
                <b :class="item.tone">{{ formatSignedPct(item.changePct) }}</b>
              </div>
            </article>
          </div>
        </div>
        <div v-if="trendCards.length > 1" class="portfolio-trending-dots">
          <button
            v-for="(item, index) in trendCards"
            :key="`dot-${item.id}`"
            type="button"
            :class="{ 'is-active': index === trendActiveIndex }"
            :aria-label="`Pindah ke slide ${index + 1}`"
            @click="goToTrendSlide(index)"
          />
        </div>

        <div class="portfolio-mini-metrics">
          <article v-for="item in marketMetricCards" :key="item.label">
            <span>{{ item.label }}</span>
            <strong :class="item.tone">{{ item.value }}</strong>
            <small>{{ item.note }}</small>
          </article>
        </div>

        <article class="portfolio-activity-card">
          <div class="portfolio-activity-head">
            <div>
              <h4>Trading Activity</h4>
              <small>Senin - Minggu</small>
            </div>
            <p><strong>{{ weeklyTradingActivity.totalTrades }}</strong><span>/trades</span></p>
          </div>
          <div class="portfolio-activity-bars">
            <div v-for="day in weeklyTradingActivity.days" :key="day.label" class="portfolio-activity-bar-item">
              <div class="portfolio-activity-bar-track">
                <span :style="{ height: `${Math.max(day.heightPct, day.count > 0 ? 16 : 6)}%` }" />
              </div>
              <small>{{ day.label }}</small>
            </div>
          </div>
        </article>
      </article>

      <div class="portfolio-right-stack">
        <article class="portfolio-card portfolio-card--overview">
          <div class="portfolio-card__head">
            <div>
              <p class="portfolio-kicker">My Portfolio</p>
              <h3>Alokasi sektor IDX30</h3>
            </div>
            <button type="button" class="portfolio-action">+ Deposit</button>
          </div>

          <div class="portfolio-overview-grid">
            <div class="portfolio-overview-main">
              <strong>{{ formatCurrency(portfolioValue) }}</strong>
              <p :class="totalReturnPct >= 0 ? 'is-up' : 'is-down'">
                {{ formatSignedPct(totalReturnPct) }} dari modal awal
              </p>

              <div class="portfolio-allocation-strip">
                <span v-for="item in allocationBars" :key="item.id" :style="{ background: item.color }" />
              </div>
            </div>

            <div class="portfolio-sector-panel">
              <div class="portfolio-sector-donut" :style="{ background: sectorPieGradient }">
                <div class="portfolio-sector-donut__center">
                  <strong>{{ sectorAllocationRows.length }}</strong>
                  <small>sektor</small>
                </div>
              </div>

              <ul class="portfolio-sector-list">
                <li v-for="item in sectorAllocationRows.slice(0, 6)" :key="item.sector">
                  <span class="portfolio-sector-dot" :style="{ background: item.color }" />
                  <div>
                    <strong>{{ item.sector }}</strong>
                    <small>{{ item.weight.toFixed(1) }}% · {{ formatCurrency(item.value) }}</small>
                  </div>
                </li>
                <li v-if="!sectorAllocationRows.length" class="portfolio-sector-list__empty">
                  Belum ada data alokasi sektor.
                </li>
              </ul>
            </div>
          </div>

          <div class="portfolio-kpi-grid">
            <article v-for="item in kpiCards" :key="item.label">
              <span>{{ item.label }}</span>
              <strong :class="item.tone">{{ item.value }}</strong>
              <small>{{ item.note }}</small>
            </article>
          </div>
        </article>

      <article class="portfolio-card portfolio-card--transactions" :class="{ 'is-compact': isCompactTransactions }">
        <div class="portfolio-card__head portfolio-card__head--transactions">
          <div>
            <p class="portfolio-kicker">My Transactions</p>
            <h3>Riwayat transaksi</h3>
          </div>
          <div class="portfolio-transaction-head-meta">
            <small>{{ orders.length }} transaksi</small>
            <button type="button" class="portfolio-action portfolio-action--subtle">View all</button>
            </div>
          </div>

          <div class="portfolio-transaction-tabs">
            <button
              type="button"
              :class="{ 'is-active': transactionTab === 'buy' }"
              @click="transactionTab = 'buy'"
            >
              Bought ({{ buyOrdersCount }})
            </button>
            <button
              type="button"
              :class="{ 'is-active': transactionTab === 'sell' }"
              @click="transactionTab = 'sell'"
            >
              Sold ({{ sellOrdersCount }})
            </button>
          </div>

          <div v-if="isLoading" class="portfolio-empty">Memuat transaksi...</div>
          <div v-else-if="!filteredOrders.length" class="portfolio-transaction-empty">
            <div class="portfolio-transaction-empty__icon" aria-hidden="true">
              <i class="ri-inbox-archive-line" />
            </div>
            <h4>Belum ada transaksi pada tab {{ transactionTab === 'buy' ? 'Bought' : 'Sold' }}</h4>
            <p>
              Data transaksi akan muncul otomatis setelah order terisi. Kamu bisa cek tab lain untuk melihat riwayat
              yang sudah tercatat.
            </p>
            <button
              v-if="oppositeTabCount > 0"
              type="button"
              class="portfolio-action portfolio-action--ghost"
              @click="transactionTab = transactionTab === 'buy' ? 'sell' : 'buy'"
            >
              Lihat {{ oppositeTabLabel }} ({{ oppositeTabCount }})
            </button>
          </div>
          <div v-else class="portfolio-transaction-list" :class="{ 'is-compact': isCompactTransactions }">
            <div class="portfolio-transaction-canvas">
              <article
                v-for="order in filteredOrders"
                :key="order.orderId"
                class="portfolio-transaction-item"
              >
                <div class="portfolio-logo">
                  <img
                    v-if="order.logoUrl && !logoHidden(order.ticker)"
                    :src="order.logoUrl"
                    :alt="`Logo ${order.company}`"
                    loading="lazy"
                    @error="onLogoError(order.ticker)"
                  />
                  <span v-else>{{ order.ticker.slice(0, 2) }}</span>
                </div>
                <div>
                  <strong>{{ order.ticker }}</strong>
                  <small>{{ order.company }}</small>
                  <small class="portfolio-transaction-date">{{ formatDateTime(order.createdAt) }}</small>
                </div>
                <div class="portfolio-transaction-qty">
                  <strong>{{ transactionQtyLabel(order) }}</strong>
                  <small>Quantity</small>
                </div>
                <div class="portfolio-transaction-value">
                  <strong :class="order.side === 'buy' ? 'is-down' : 'is-up'">{{ transactionFlowLabel(order) }}</strong>
                  <small>Total</small>
                </div>
              </article>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="portfolio-bottom-row">
      <article class="portfolio-card portfolio-card--risk">
        <div class="portfolio-card__head">
          <div>
            <p class="portfolio-kicker">Risk Exposure per Ticker</p>
            <h3>Konsentrasi risiko</h3>
          </div>
          <small>{{ formatCurrency(investedValue) }}</small>
        </div>

        <div v-if="!riskExposureRows.length" class="portfolio-empty">Risk exposure muncul setelah ada posisi aktif.</div>
        <div v-else class="portfolio-risk-list">
          <article v-for="item in riskExposureRows" :key="`risk-${item.ticker}`" class="portfolio-risk-item">
            <div class="portfolio-risk-head">
              <div>
                <strong>{{ item.ticker }}</strong>
                <small>{{ item.sector }}</small>
              </div>
              <b>{{ item.exposurePct.toFixed(1) }}%</b>
            </div>
            <div class="portfolio-risk-bar">
              <span :style="{ width: `${Math.min(Math.max(item.exposurePct, 0), 100)}%` }" />
            </div>
            <div class="portfolio-risk-foot">
              <small>{{ formatCurrency(item.marketValue) }}</small>
              <small :class="item.pnlPct >= 0 ? 'is-up' : 'is-down'">{{ formatSignedPct(item.pnlPct) }}</small>
            </div>
          </article>
        </div>
      </article>

      <article class="portfolio-card portfolio-card--positions">
        <div class="portfolio-card__head">
          <div>
            <p class="portfolio-kicker">Posisi Aktif</p>
            <h3>Holding berjalan</h3>
          </div>
          <small>{{ positions.length }} ticker</small>
        </div>

        <div v-if="isLoading" class="portfolio-empty">Memuat posisi...</div>
        <div v-else-if="!activePositions.length" class="portfolio-empty">Belum ada posisi aktif saat ini.</div>
        <div v-else class="portfolio-position-list">
          <article v-for="item in activePositions" :key="`pos-${item.ticker}`" class="portfolio-position-item">
            <div class="portfolio-logo">
              <img
                v-if="item.logoUrl && !logoHidden(item.ticker)"
                :src="item.logoUrl"
                :alt="`Logo ${item.company}`"
                loading="lazy"
                @error="onLogoError(item.ticker)"
              />
              <span v-else>{{ item.ticker.slice(0, 2) }}</span>
            </div>
            <div>
              <strong>{{ item.ticker }}</strong>
              <small>{{ item.company }} · {{ item.sector }}</small>
            </div>
            <div class="portfolio-position-meta">
              <span>Qty {{ item.qty.toLocaleString('id-ID') }}</span>
              <small>Avg {{ formatCurrency(item.avgPrice) }}</small>
            </div>
            <div class="portfolio-position-value">
              <strong>{{ formatCurrency(item.marketValue) }}</strong>
              <small :class="item.unrealizedPnl >= 0 ? 'is-up' : 'is-down'">{{ formatSignedCurrency(item.unrealizedPnl) }}</small>
            </div>
          </article>
        </div>
      </article>
    </section>
  </div>
</template>
