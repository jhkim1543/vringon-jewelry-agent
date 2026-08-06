import { getLang, LANG_NAME } from './i18n'
import type { Lang } from './i18n'

/** 이 분석이 쓰는 언어. 파이프라인이 시작할 때 한 번 정하고 끝까지 유지한다. */
let runLang: Lang | null = null
export function setRunLang(l: Lang | null) { runLang = l }
// ── 리서치 클라이언트 · 서버가 웹 검색으로 실제 수집한 결과를 받는다 ──
import type { CompetitorProduct, ReportBias, Signal } from './types'

export interface CompetitorProductRaw {
  brand: string
  model_name: string
  price_krw: number
  released: string
  popularity_evidence: string[]
  evidence_strength: 'strong' | 'moderate' | 'weak' | 'none'
  rank_note: string
  user_sentiment: 'positive' | 'mixed' | 'negative' | 'unknown'
  praise_points: string[]
  complaint_points: string[]
  design_traits: string[]
  image_urls: string[]
  product_url: string
  source_urls: string[]
}

export interface CompetitorResearch {
  products: CompetitorProductRaw[]
  notes: string
  searches: number
  collected_at: string
  cached?: boolean
}

export interface TrendReport {
  title: string
  executive_view: string
  body_markdown: string
  design_implications: { area: string; guidance: string; basis: string }[]
  open_questions: string[]
  sources: string[]
}

/** 수집한 원격 이미지는 서버 캐시를 거쳐 불러온다 */
export const shotUrl = (u: string) => `/api/shot?u=${encodeURIComponent(u)}`

export interface TrendResearch {
  signals: {
    label: string
    axis: string
    attribute: string
    direction: 'rising' | 'stable' | 'declining'
    observed_count: number
    evidence: string[]
    source_urls: string[]
    confidence: 'high' | 'medium' | 'low'
  }[]
  report_perspective: string
  notes: string
  searches: number
  collected_at: string
  cached?: boolean
  engine?: 'deep' | 'multi' | 'fast'
  report?: TrendReport
  sub_questions?: string[]
}

async function post<T>(url: string, body: unknown): Promise<T> {
  // 조사 결과의 언어는 분석을 시작할 때 정한다. 화면 언어를 그때그때 따라가면
  // 도중에 언어를 바꿨을 때 한 리포트 안에 두 언어가 섞인다.
  const lang = runLang ?? getLang()
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(body as object), lang, langName: LANG_NAME[lang] }),
  })
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error ?? `${url} ${r.status}`)
  return j as T
}

export const fetchCompetitors = (b: {
  brands: string[]; categoryKo: string; typeKo: string; priceMin: number; priceMax: number
}) => post<CompetitorResearch>('/api/research/competitors', b)

export const fetchTrends = (b: {
  categoryKo: string; typeKo: string; brands?: string[]; season: string
  priceBandKo?: string; wantReport?: boolean; depth?: number
}) => post<TrendResearch>('/api/research/trends', b)

// ── 수집 결과 → 도메인 타입 ─────────────────────────────────────────
// 판매 프록시는 만들지 않는다. 1회 수집으로는 시계열이 성립하지 않는다.
export function toCompetitors(r: CompetitorResearch, priceMin: number, priceMax: number): CompetitorProduct[] {
  const lo = priceMin * 0.7, hi = priceMax * 1.3
  return r.products.map((p, i) => ({
    product_id: `cp_${i + 1}`,
    brand: p.brand,
    name: p.model_name,
    price_krw: p.price_krw,
    sales_proxy_score: null,
    proxy_signals: p.popularity_evidence,
    observation_count: 1,
    observation_window: `${r.collected_at}, single pass`,
    confidence: 'none',
    in_band: p.price_krw === 0 ? true : p.price_krw >= lo && p.price_krw <= hi,
    evidence_strength: p.evidence_strength,
    source_urls: p.source_urls,
    rank_note: p.rank_note,
    user_sentiment: p.user_sentiment,
    praise_points: p.praise_points,
    complaint_points: p.complaint_points,
    design_traits: p.design_traits,
    image_urls: p.image_urls,
    product_url: p.product_url,
  }))
}

// 모델이 가끔 "확인하지 못했다"를 신호로 올린다. 그건 신호가 아니라 조사의 한계라
// 리포트 본문에만 남기고 신호 목록에서는 걸러낸다.
const NOT_A_SIGNAL = /\b(not computable|undetermined|visibility gap|not available|no data|unavailable|inconsistent|not standardi[sz]ed|coverage gap|access constraint)\b/i

export function toSignals(r: TrendResearch): Signal[] {
  return r.signals
    .filter(s => s.observed_count > 0 && !NOT_A_SIGNAL.test(s.label))
    .map((s, i) => ({
    signal_id: `sg_${String(i + 1).padStart(3, '0')}`,
    attribute: s.attribute,
    label: s.label,
    axis: s.axis,
    observed_count: s.observed_count,
    sources: s.source_urls,
    price_bands: [],
    confidence: s.confidence,
    direction: s.direction,
    first_seen: r.collected_at,
    dedup_group: `dg_${i + 1}`,
    oem_group: null,
    evidence: s.evidence,
  }))
}

export function toBias(r: TrendResearch): ReportBias {
  return {
    publisher: `Web, collected ${r.collected_at} across ${r.searches} searches`,
    perspective: r.report_perspective,
    notes: r.notes ? [r.notes] : [],
  }
}

// ── 시즌 도시에 · MICAM 형식 ────────────────────────────────────────
export interface DossierMetric {
  label: string
  yoy_percent: number | null
  /** 공개 수치를 못 찾았을 때도 방향과 세기는 항상 채워진다 */
  magnitude: 'surging' | 'rising' | 'steady' | 'softening'
  source_kind: 'market' | 'social' | 'shows' | 'consumer'
  source_url: string
  observed_note: string
}
export interface DossierColor { name: string; pantone_tcx: string; hex: string }
export type TrendGrade = 'edgy' | 'early_sign' | 'safe' | 'big' | 'stable' | 'last_call'
export interface DossierKeyItem {
  segment: 'women' | 'men' | 'kids'
  name: string
  description: string
  metric: DossierMetric
  grade: TrendGrade
  silhouette_spec: string
}
export interface Macrotrend {
  name: string
  statement: string
  narrative: string
  sub_trends: string[]
  drivers: DossierMetric[]
  palette: DossierColor[]
  materials: DossierMetric[]
  details: DossierMetric[]
  key_items: DossierKeyItem[]
  grade: TrendGrade
}
export interface SeasonDossier {
  season: string
  season_title: string
  powershift: string
  season_narrative: string
  macrotrends: Macrotrend[]
  yearly_context: { season: string; headline: string; what_changed: string; source_url: string }[]
  method_note: string
  open_questions: string[]
  sources: { title: string; url: string; used_for: string }[]
  searches: number
  collected_at: string
  cached?: boolean
}

export const fetchDossier = (b: {
  categoryEn: string; season: string; priceBand?: string; brands?: string[]
}) => post<SeasonDossier>('/api/research/dossier', b)

export const GRADE_LABEL: Record<TrendGrade, string> = {
  edgy: 'Edgy', early_sign: 'Early sign', safe: 'Safe',
  big: 'Big trend', stable: 'Stable', last_call: 'Last call',
}
export const SOURCE_LABEL: Record<DossierMetric['source_kind'], string> = {
  market: 'E-commerce', social: 'Instagram', shows: 'Runway', consumer: 'Search',
}

export const MAG_LABEL: Record<DossierMetric['magnitude'], string> = {
  surging: 'Surging', rising: 'Rising', steady: 'Steady', softening: 'Softening',
}
/** 화면 표기 · 공개된 %가 있으면 그것을, 없으면 강도를 쓴다 */
export function metricText(m: Pick<DossierMetric, 'yoy_percent' | 'magnitude'>): string {
  if (m.yoy_percent != null) return `${m.yoy_percent > 0 ? '+' : ''}${m.yoy_percent}%`
  return MAG_LABEL[m.magnitude] ?? '—'
}
