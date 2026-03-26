import { apiRequest } from './httpClient'

export const backendApi = {
  register: (payload) =>
    apiRequest('/api/v1/auth/register', {
      method: 'POST',
      body: payload,
    }),
  login: ({ credential, password }) =>
    apiRequest('/api/v1/auth/login', {
      method: 'POST',
      body: { credential, password },
    }),
  getSession: () => apiRequest('/api/v1/auth/session'),
  logout: () =>
    apiRequest('/api/v1/auth/logout', {
      method: 'POST',
    }),
  updateProfile: (payload) =>
    apiRequest('/api/v1/auth/profile', {
      method: 'PATCH',
      body: payload,
    }),
  updateEmail: (payload) =>
    apiRequest('/api/v1/auth/email', {
      method: 'PATCH',
      body: payload,
    }),
  updatePassword: (payload) =>
    apiRequest('/api/v1/auth/password', {
      method: 'PATCH',
      body: payload,
    }),

  getRoot: () => apiRequest('/'),
  getHealth: () => apiRequest('/health'),
  getApiHealth: () => apiRequest('/api/v1/health'),
  getDataStatus: () => apiRequest('/api/v1/system/data-status'),

  getMarketOverview: () => apiRequest('/api/v1/market/overview'),
  getStockQuote: (ticker, { fresh = false } = {}) =>
    apiRequest(`/api/v1/stocks/${ticker}/quote`, { query: { fresh } }),
  getStockOhlcv: (ticker, { interval = '1d', range = '30d', fresh = false } = {}) =>
    apiRequest(`/api/v1/stocks/${ticker}/ohlcv`, { query: { interval, range, fresh } }),

  getForecast: (ticker, horizon = 1) =>
    apiRequest(`/api/v1/forecast/${ticker}`, { query: { horizon } }),
  getForecastRuntimeCatalog: () =>
    apiRequest('/api/v1/forecast/runtime-catalog'),
  getExplanation: (ticker, horizon = 1) =>
    apiRequest(`/api/v1/explanations/${ticker}`, { query: { horizon } }),
  getForecastXai: (ticker, horizon = 1) =>
    apiRequest(`/api/v1/forecast-xai/${ticker}`, { query: { horizon } }),

  getEvaluationSummary: () => apiRequest('/api/v1/evaluation/summary'),
  getBacktestSummary: () => apiRequest('/api/v1/backtest/summary'),
  getDashboardOverview: (ticker, horizon = 5, chartRange = '1mo') =>
    apiRequest('/api/v1/dashboard/overview', {
      query: { ticker, horizon, chart_range: chartRange },
    }),

  placePaperOrder: ({ ticker, side, qty }) =>
    apiRequest('/api/v1/paper/orders', {
      method: 'POST',
      body: { ticker, side, qty },
    }),
  getPaperOrders: (limit = 20) =>
    apiRequest('/api/v1/paper/orders', { query: { limit } }),
  getPaperPortfolio: () => apiRequest('/api/v1/paper/portfolio'),

  runReactAgent: ({ user_goal, ticker, horizon }) =>
    apiRequest('/api/v1/agentic/react/run', {
      method: 'POST',
      body: { user_goal, ticker, horizon },
    }),
  runInfoCenter: ({ question, ticker, horizon, context }) =>
    apiRequest('/api/v1/agentic/info-center/run', {
      method: 'POST',
      body: { question, ticker, horizon, ...(context ? { context } : {}) },
    }),

  runResearchIngest: ({ tickers } = {}) =>
    apiRequest('/api/v1/research/ingest/run', {
      method: 'POST',
      body: { ...(Array.isArray(tickers) && tickers.length ? { tickers } : {}) },
    }),
  getResearchIngestStatus: () => apiRequest('/api/v1/research/ingest/status'),
  getResearchIngestFeed: ({ ticker, snapshotLimit = 20 } = {}) =>
    apiRequest('/api/v1/research/ingest/feed', {
      query: {
        ...(ticker ? { ticker } : {}),
        snapshot_limit: snapshotLimit,
      },
    }),

  runResearchCommittee: ({ ticker, horizon, mode }) =>
    apiRequest('/api/v1/research/committee/run', {
      method: 'POST',
      body: { ticker, horizon, ...(mode ? { mode } : {}) },
    }),

  getResearchRiskPolicy: () => apiRequest('/api/v1/research/risk/policy'),
  patchResearchRiskPolicy: (payload) =>
    apiRequest('/api/v1/research/risk/policy', {
      method: 'PATCH',
      body: payload,
    }),
  getResearchRiskEvents: (limit = 100) =>
    apiRequest('/api/v1/research/risk/events', {
      query: { limit },
    }),

  generateResearchReports: ({ ticker, horizon, force_regenerate = true } = {}) =>
    apiRequest('/api/v1/research/reports/generate', {
      method: 'POST',
      body: {
        ...(ticker ? { ticker } : {}),
        ...(horizon ? { horizon } : {}),
        force_regenerate,
      },
    }),
  readReportFile: (fileKey) =>
    apiRequest('/api/v1/research/reports/read', {
      query: { file_key: fileKey },
    }),
  getReportDownloadUrl: (fileKey) =>
    `/api/v1/research/reports/download?file_key=${encodeURIComponent(fileKey)}`,

  getWellKnownAgentCard: () => apiRequest('/.well-known/agent-card.json'),
  getA2aAgentCard: () => apiRequest('/api/v1/agentic/a2a/agent-card'),
  callA2aRpc: (body) =>
    apiRequest('/api/v1/agentic/a2a/rpc', {
      method: 'POST',
      body,
    }),
}
