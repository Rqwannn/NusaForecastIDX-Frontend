const IDX30_COMPANY_META = {
  ADRO: { company: 'Adaro Energy Indonesia', sector: 'Energi', domain: 'adaro.com' },
  AMMN: { company: 'Amman Mineral Internasional', sector: 'Material Dasar', domain: 'amman.co.id' },
  ANTM: { company: 'Aneka Tambang', sector: 'Material Dasar', domain: 'antam.com' },
  ASII: { company: 'Astra International', sector: 'Konglomerasi', domain: 'astra.co.id' },
  BBCA: { company: 'Bank Central Asia', sector: 'Perbankan', domain: 'bca.co.id' },
  BBNI: { company: 'Bank Negara Indonesia', sector: 'Perbankan', domain: 'bni.co.id' },
  BBRI: { company: 'Bank Rakyat Indonesia', sector: 'Perbankan', domain: 'bri.co.id' },
  BBTN: { company: 'Bank Tabungan Negara', sector: 'Perbankan', domain: 'btn.co.id' },
  BMRI: { company: 'Bank Mandiri', sector: 'Perbankan', domain: 'bankmandiri.co.id' },
  BRIS: { company: 'Bank Syariah Indonesia', sector: 'Perbankan', domain: 'bankbsi.co.id' },
  BRPT: { company: 'Barito Pacific', sector: 'Industri', domain: 'barito-pacific.com' },
  CPIN: { company: 'Charoen Pokphand Indonesia', sector: 'Konsumer', domain: 'cp.co.id' },
  ESSA: { company: 'ESSA Industries Indonesia', sector: 'Energi', domain: 'essa.id' },
  EXCL: { company: 'XL Axiata', sector: 'Telekomunikasi', domain: 'xl.co.id' },
  GOTO: { company: 'GoTo Gojek Tokopedia', sector: 'Teknologi', domain: 'goto.com' },
  ICBP: { company: 'Indofood CBP Sukses Makmur', sector: 'Konsumer', domain: 'icbp.com' },
  INCO: { company: 'Vale Indonesia', sector: 'Material Dasar', domain: 'vale.com' },
  INDF: { company: 'Indofood Sukses Makmur', sector: 'Konsumer', domain: 'indofood.com' },
  ISAT: { company: 'Indosat Ooredoo Hutchison', sector: 'Telekomunikasi', domain: 'indosatooredoo.com' },
  KLBF: { company: 'Kalbe Farma', sector: 'Kesehatan', domain: 'kalbe.co.id' },
  MAPI: { company: 'Mitra Adiperkasa', sector: 'Konsumer', domain: 'map.co.id' },
  MDKA: { company: 'Merdeka Copper Gold', sector: 'Material Dasar', domain: 'merdekacoppergold.com' },
  MEDC: { company: 'Medco Energi Internasional', sector: 'Energi', domain: 'medcoenergi.com' },
  PGAS: { company: 'Perusahaan Gas Negara', sector: 'Energi', domain: 'pgn.co.id' },
  PTBA: { company: 'Bukit Asam', sector: 'Energi', domain: 'ptba.co.id' },
  SMGR: { company: 'Semen Indonesia', sector: 'Industri', domain: 'sig.id' },
  TLKM: { company: 'Telkom Indonesia', sector: 'Telekomunikasi', domain: 'telkom.co.id' },
  TPIA: { company: 'Chandra Asri Pacific', sector: 'Industri', domain: 'chandra-asri.com' },
  UNTR: { company: 'United Tractors', sector: 'Industri', domain: 'unitedtractors.com' },
  UNVR: { company: 'Unilever Indonesia', sector: 'Konsumer', domain: 'unilever.co.id' },
}

const FALLBACK_META = {
  company: 'Emiten IDX30',
  sector: 'Lainnya',
  domain: '',
}

const normalizeTicker = (value) => {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace('.JK', '')
}

export const getIdx30Meta = (ticker) => {
  const normalized = normalizeTicker(ticker)
  const item = IDX30_COMPANY_META[normalized] || FALLBACK_META
  const logoUrl = item.domain ? `https://logo.clearbit.com/${item.domain}` : ''
  return {
    ticker: normalized,
    company: item.company,
    sector: item.sector,
    domain: item.domain,
    logoUrl,
  }
}

export const idx30SectorPriority = [
  'Perbankan',
  'Energi',
  'Telekomunikasi',
  'Konsumer',
  'Material Dasar',
  'Industri',
  'Teknologi',
  'Kesehatan',
  'Konglomerasi',
  'Lainnya',
]
