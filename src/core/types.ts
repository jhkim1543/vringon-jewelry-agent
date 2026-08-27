// ── VRINGON Jewelry Agent · 도메인 타입 (3-에이전트 개편) ─────────────
// 에이전트: 경쟁사 트렌드 / 패션 트렌드 / 주얼리 컬렉션.
// 흐름: 수집 → 트렌드 리포트 → 레퍼런스 → 프롬프트 쌍 → 디자인 생성.
// 스펙 생성·룰 엔진·MD·브랜드 계층은 이 개편에서 제거됐다 — 디자인은
// 레퍼런스 DNA 와 프롬프트 쌍에서 나오고, 근거는 조사 산출물에 남는다.

import { t } from './i18n'
import type { MakeSpec } from './cost'

export type { MakeSpec } from './cost'

export type Mode = 'competitor' | 'fashion' | 'collection'

// ── 검색 지역 ────────────────────────────────────────────────────────
// 값은 언제나 이 영문 표준명으로 담는다. 화면에 보이는 이름만 언어를 따른다.
// 번역된 글자를 담으면 화면 언어를 바꾼 순간 선택이 풀리고, 같은 지역이
// 언어마다 다른 조사 캐시를 만든다. 자유 입력도 그대로 살려 둔다 —
// 권역이 아니라 특정 도시만 보고 싶을 때가 있다.
export const REGIONS = [
  { id: 'KR', label: 'Korea' },
  { id: 'JP', label: 'Japan' },
  { id: 'EU', label: 'Europe' },
  { id: 'AS', label: 'Asia' },
  { id: 'ME', label: 'Middle East' },
  { id: 'US', label: 'United States' },
] as const

/** 담긴 값을 화면 언어로 보여 준다. 표준명이 아니면(자유 입력) 그대로 둔다. */
export function regionLabel(stored?: string): string {
  if (!stored) return ''
  const hit = REGIONS.find(r => r.label === stored)
  return hit ? t(hit.label) : stored
}

/** 화면에 보이는 이름을 담을 값으로 되돌린다. */
export function regionValue(shown: string): string {
  return REGIONS.find(r => t(r.label) === shown)?.label ?? shown
}

/** 지역 목록 · 다중 선택을 지원한다. 옛 저장본은 country 한 칸뿐이라 그걸 감싼다. */
export function regionsOf(p: { countries?: string[]; country?: string }): string[] {
  if (p.countries?.length) return p.countries
  return p.country ? [p.country] : []
}

/** 지역 목록을 화면 언어로 이어 붙인다 */
export function regionsLabel(p: { countries?: string[]; country?: string }): string {
  return regionsOf(p).map(regionLabel).join(' · ')
}

export const MODE_LABEL: Record<Mode, string> = {
  competitor: 'Competitor Trend', fashion: 'Fashion Trend', collection: 'Jewelry Collection',
}

// ── 분석 언어 · 조사·리포트가 이 언어로 나온다 (화면 언어와 별개) ──────
export type AnalysisLang = 'ko' | 'ja' | 'en' | 'zh' | 'fr' | 'it'
export const ANALYSIS_LANGS: { id: AnalysisLang; label: string }[] = [
  { id: 'ko', label: '한국어' }, { id: 'ja', label: '日本語' }, { id: 'en', label: 'English' },
  { id: 'zh', label: '中文' }, { id: 'fr', label: 'Français' }, { id: 'it', label: 'Italiano' },
]
/** 서버 프롬프트에 넣는 언어 이름 */
export const ANALYSIS_LANG_NAME: Record<AnalysisLang, string> = {
  ko: 'Korean (한국어)', ja: 'Japanese (日本語)', en: 'English',
  zh: 'Chinese (中文)', fr: 'French (Français)', it: 'Italian (Italiano)',
}

// ── 품목 · 스펙 기준 5종 (에이전트 1·2 는 단일 선택, 컬렉션은 다중) ────
export interface ItemDef { id: string; label: string; en: string }
export const ITEMS: ItemDef[] = [
  { id: 'ring', label: 'Ring', en: 'ring' },
  { id: 'earrings', label: 'Earrings', en: 'pair of earrings' },
  { id: 'necklace', label: 'Necklace', en: 'necklace' },
  { id: 'pendant', label: 'Pendant', en: 'pendant necklace' },
  { id: 'bracelet', label: 'Bracelet', en: 'bracelet' },
]
export const ITEM_LABEL: Record<string, string> = Object.fromEntries(ITEMS.map(i => [i.id, i.label]))
export const ITEM_EN: Record<string, string> = Object.fromEntries(ITEMS.map(i => [i.id, i.en]))
/** 조사 프롬프트에 쓰는 한국어 품목명 · 검색은 한국어가 더 잘 잡힌다 */
export const ITEM_KO: Record<string, string> = {
  ring: '반지', earrings: '귀걸이', necklace: '목걸이', pendant: '펜던트', bracelet: '브레이슬릿',
}

export type DesignCount = 10 | 20 | 30 | 40
export type SetCount = 1 | 3 | 5

/** 수량 → 변형 종류 · 10개 단위로 층이 붙는다 */
export type VariantKind = 'base' | 'commercial' | 'form' | 'material'
export const VARIANTS_FOR: Record<DesignCount, VariantKind[]> = {
  10: ['base'],
  20: ['base', 'commercial'],
  30: ['base', 'commercial', 'form'],
  40: ['base', 'commercial', 'form', 'material'],
}
/** 고른 수량에 맞는 변형 목록 · 목록에 없는 수(저장본·API 직접 호출)에서도 죽지 않는다.
 *  실측: designCount 6 이 들어오자 VARIANTS_FOR[6] 가 undefined 가 되어, 40분짜리 조사를
 *  전부 끝낸 뒤 마지막 단계에서 통째로 날렸다. 가까운 아래 단계로 내려 잡는다. */
export function variantsFor(count: number): VariantKind[] {
  const steps: DesignCount[] = [10, 20, 30, 40]
  const hit = [...steps].reverse().find(s => count >= s) ?? 10
  return VARIANTS_FOR[hit]
}

/** 화면이 주는 세트 수는 1/3/5 뿐이다. 그 밖의 값이 들어오면 가까운 아래 값으로 잡는다.
 *  실측: 4 가 들어오자 모델이 4세트를 만들지 않아 사용자가 고른 수와 결과가 어긋났다. */
export function clampSetCount(n: number): SetCount {
  const steps: SetCount[] = [1, 3, 5]
  return [...steps].reverse().find(s => n >= s) ?? 1
}

export const VARIANT_LABEL: Record<VariantKind, string> = {
  base: 'Core design', commercial: 'Commercial variant', form: 'Form experiment', material: 'Material experiment',
}

/** 나이대는 여러 개를 고를 수 있다(ages). age 는 옛 저장분·샘플이 쓰던 단수 필드로,
 *  읽을 때만 참고한다 — 새로 쓰는 쪽은 ages 만 채운다. */
export interface TargetCustomer { age?: string; ages?: string[]; gender: 'female' | 'male' | 'unisex' }
export const GENDER_LABEL: Record<TargetCustomer['gender'], string> = {
  female: 'Women', male: 'Men', unisex: 'Unisex',
}
/** 고른 나이대 · 옛 저장분은 단수 age 하나로 읽힌다 */
export function agesOf(t: TargetCustomer): string[] {
  if (t.ages?.length) return t.ages
  return t.age ? [t.age] : []
}
export function targetText(t: TargetCustomer): string {
  return `${agesOf(t).join(', ')} · ${GENDER_LABEL[t.gender]}`
}

/** 컬렉션 고급 설정 · 비우면 에이전트가 정한다 */
export interface CollectionAdvanced {
  expression?: 'abstract' | 'balanced' | 'literal'
  positioning?: 'daily' | 'premium' | 'luxury' | 'artpiece'
  metalsPrefer?: string
  metalsAvoid?: string
  stonesPrefer?: string
  stonesAvoid?: string
  priceTarget?: string
  manufacturing?: string
}

export interface RunParams {
  algo: 2                       // 알고리즘 세대 · 옛 저장본(스펙·룰 파이프라인)과 구분한다
  mode: Mode
  /** 검색 지역 · 여러 권역을 함께 고를 수 있다. 지역 수만큼 편집샵·확산 조사가 늘어난다. */
  countries: string[]
  /** @deprecated 옛 저장본 호환용 · 새 코드는 countries 를 쓴다 */
  country?: string
  analysisLang: AnalysisLang
  /** 조사 방향 (경쟁사·패션) / 컬렉션 키워드·스토리 */
  direction: string
  itemType: string              // 에이전트 1·2 단일 품목
  items: string[]               // 컬렉션 다중 품목
  designCount: DesignCount
  setCount: SetCount
  target: TargetCustomer
  competitors: string[]         // 경쟁사 에이전트 전용
  collectionAdv?: CollectionAdvanced
  imageEngine: 'fast' | 'detail'
}

export const DEFAULT_PARAMS: RunParams = {
  algo: 2, mode: 'competitor', countries: ['Korea'], analysisLang: 'ko',
  direction: '', itemType: 'ring', items: ['ring', 'earrings', 'necklace'],
  designCount: 10, setCount: 3,
  target: { ages: ['26-29', '30-34'], gender: 'female' },
  competitors: [],
  imageEngine: 'fast',
}

// ── 수집 산출물 ──────────────────────────────────────────────────────
/** 크롤된 제품 · 경쟁사와 편집샵이 같은 카드 형태를 쓴다 */
export interface CrawledProduct {
  id: string
  source: 'competitor' | 'shop'
  brand: string
  shopName?: string
  name: string
  /** 경쟁사: representative/best/new · 편집샵: rankBasis 로 구분 */
  group?: 'representative' | 'best' | 'new'
  rankBasis?: 'official_best' | 'exposure'
  rankNote?: string
  price: number
  currency: string
  imageUrl: string              // 원본 원격 주소
  shot?: string                 // 로컬로 구운 사본 (배포용)
  productUrl: string
}

export interface CompetitorCrawl { brand: string; note: string; items: CrawledProduct[]; sources: string[] }
export interface ShopCrawl { name: string; url: string; note: string; items: CrawledProduct[]; failed?: string; region?: string }

// ── 트렌드 리포트 ────────────────────────────────────────────────────
export interface TrendItem { label: string; evidence: string; mentions: number; source_urls: string[]; image_url: string }
export interface TrendElement { axis: string; trends: TrendItem[] }
export interface TrendReportData {
  headline: string
  summary: string
  elements: TrendElement[]
  sources: string[]
  sub_questions?: string[]
  searches?: number
  collected_at?: string
}

// ── 다음 시즌 예측 · 예측은 예측이라 말한다 (확신도·근거·관찰 지표 필수) ──
export interface ForecastPrediction {
  axis: string; call: string; why: string
  confidence: 'high' | 'medium' | 'low'; watch: string
}
export interface ForecastData {
  horizon: string; thesis: string
  predictions: ForecastPrediction[]; risks: string[]; sources: string[]
  searches?: number
}
export const CONFIDENCE_LABEL: Record<ForecastPrediction['confidence'], string> = {
  high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence',
}

// ── 패션 전용 ────────────────────────────────────────────────────────
export interface FashionLook {
  brand: string; collection: string; season: string; look_note: string
  image_url: string; source_url: string
  colors: string[]; materials: string[]; silhouette: string; styling: string
  jewelry_zone: string
  shot?: string
  region?: string
}
export interface RunwayData { looks: FashionLook[]; season_now: string; season_next: string; sources: string[] }
export interface AdoptionSignal { label: string; basis: 'official_best' | 'exposure' | 'editorial' | 'search' | 'street'; evidence: string; source_url: string; image_url: string; region?: string }
export const BASIS_LABEL: Record<AdoptionSignal['basis'], string> = {
  official_best: 'Official bestseller', exposure: 'Site exposure', editorial: 'Editorial mention',
  search: 'Search interest', street: 'Street style',
}

// ── 컬렉션 전용 ──────────────────────────────────────────────────────
export interface KeywordInsight {
  meaning: string; cultural: string; background: string
  symbols: string[]; emotions: string[]; colors: string[]; materials: string[]
  forms: string[]; motion: string[]; cliches: string[]; cautions: string[]
  abstraction: { axis: string; notes: string[] }[]
  sources: string[]
}
export interface ConceptArt { form: string; motion: string; material: string; atmosphere: string }
export interface CollectionSet {
  name: string; kind: string; concept: string; story: string
  palette: string[]; metal: string; surface: string; stones: string
  silhouette: string; motif: string; rhythm: string; structure: string
  avoid: string[]
  design_dna: string[]
  concept_art: ConceptArt
  /** 생성된 콘셉트 이미지 (Form/Motion/Material/Atmosphere) */
  art?: Partial<Record<keyof ConceptArt, { url: string; hash: string }>>
  /** 세트 전체 라인업 이미지 */
  lineup?: { url: string; hash: string }
}

// ── 레퍼런스 · 프롬프트 쌍 ───────────────────────────────────────────
export interface Reference {
  slot: number
  candidateId: string
  title: string                 // 제품명 또는 브랜드·컬렉션
  subtitle: string              // 브랜드·가격 등 한 줄
  trendCombo: string[]
  reason: string
  imageUrl: string
  shot?: string
  price?: number
  currency?: string
  sourceUrl: string
}

export interface PromptDirection {
  preserve: string; transform: string; replace: string; combine: string; complement: string; avoid: string
}

export interface DesignVersion { url: string; hash: string; prompt: string; at: string }

export interface DesignPair {
  id: string                    // D01 ...
  refSlot: number               // 레퍼런스 슬롯 (컬렉션은 세트 번호)
  variant: VariantKind
  /** 컬렉션 전용 · 어느 세트의 어느 품목인가 */
  setName?: string
  item?: string
  title: string
  dna?: Record<string, unknown>
  direction?: PromptDirection
  prompt: string                // 현재 프롬프트 (수정 가능)
  versions: DesignVersion[]     // 생성 이력 · 마지막이 현재
  score?: number
  scoreNote?: string
  error?: string
  feature?: string              // 컬렉션 · 한 문장 특징
  /** 제작 사양 · 원가 계산과 테크팩이 이것을 먹는다.
   *  옛 저장본에는 없다 — 화면은 없을 때를 처리해야 한다. */
  spec?: MakeSpec
}

// ── 실행 상태 ────────────────────────────────────────────────────────
export type Stage = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'
/** 단계 이름은 에이전트마다 다르다 · 화면은 이 표로 부른다 */
export const STAGE_LABELS: Record<Mode, Record<Stage, string>> = {
  competitor: { S1: 'Crawl', S2: 'Trend report', S3: 'References', S4: 'Prompts', S5: 'Designs' },
  fashion: { S1: 'Runway and adoption', S2: 'Trend report', S3: 'References', S4: 'Prompts', S5: 'Designs' },
  collection: { S1: 'Keyword research', S2: 'Set concepts', S3: 'Concept art', S4: 'Prompts', S5: 'Designs' },
}

export interface LogLine { stage: Stage; text: string; t: number }

export interface RunState {
  algo: 2
  params: RunParams
  stageStatus: Record<Stage, 'idle' | 'running' | 'done'>
  logs: LogLine[]
  // 에이전트 1
  crawl?: CompetitorCrawl[]
  shops?: ShopCrawl[]
  // 에이전트 2
  runway?: RunwayData
  adoption?: AdoptionSignal[]
  // 공통 리포트
  trendReport?: TrendReportData
  forecast?: ForecastData
  // 에이전트 3
  insight?: KeywordInsight
  sets?: CollectionSet[]
  // 공통 산출
  references: Reference[]
  pairs: DesignPair[]
  searches: number
  finished: boolean
  failedNote?: string
  // 샘플 표시
  sample?: boolean
  sampleTitle?: string
  savedAtISO?: string
}

export function freshState(params: RunParams): RunState {
  return {
    algo: 2, params,
    stageStatus: { S1: 'idle', S2: 'idle', S3: 'idle', S4: 'idle', S5: 'idle' },
    logs: [], references: [], pairs: [], searches: 0, finished: false,
  }
}

// ── 파이프라인 이벤트 ────────────────────────────────────────────────
export type PipelineEvent =
  | { kind: 'log'; stage: Stage; text: string }
  | { kind: 'stage-start'; stage: Stage }
  | { kind: 'stage-done'; stage: Stage }
  | { kind: 'progress'; stage: Stage; pct: number }
  | { kind: 'crawl'; crawl: CompetitorCrawl[] }
  | { kind: 'shops'; shops: ShopCrawl[] }
  | { kind: 'runway'; runway: RunwayData }
  | { kind: 'adoption'; signals: AdoptionSignal[] }
  | { kind: 'trend-report'; report: TrendReportData }
  | { kind: 'forecast'; forecast: ForecastData }
  | { kind: 'insight'; insight: KeywordInsight }
  | { kind: 'sets'; sets: CollectionSet[] }
  | { kind: 'set-art'; setName: string; art: NonNullable<CollectionSet['art']>; lineup?: CollectionSet['lineup'] }
  | { kind: 'references'; references: Reference[] }
  | { kind: 'pair'; pair: DesignPair }
  | { kind: 'pair-update'; pair: DesignPair }
  | { kind: 'searches'; n: number }
  | { kind: 'failed'; note: string }
  | { kind: 'done' }

// ── 디자인 수량 → 실제 생성 개수 계산 ────────────────────────────────
export function plannedPairCount(p: RunParams): number {
  if (p.mode === 'collection') return p.setCount * p.items.length
  return p.designCount
}

/** 단계별 예상 시간(분) · 실측 실행에서 잡은 범위다.
 *  근거(2026-08 실측): 경쟁사 크롤 브랜드당 4~8분 · 편집샵 지역당 6~12분 ·
 *  리포트(gpt-5) 10~16분 · 런웨이+확산 지역당 5~9분 · 키워드 5~9분 ·
 *  콘셉트 아트 세트당 2~4분 · 디자인 장당 0.5~1.2분.
 *  깊은 조사(gpt-5-pro)는 리포트 단계가 25~60분으로 바뀐다 — 단건 호출 4분 안팎 ×
 *  (하위 질문 병렬 한 겹 + 긴 종합). 실측에서 depth 2 로도 35분을 넘겼다.
 *  느린 대신 자세하다. 그래서 이 범위를 화면에 숨기지 않고 단계마다 붙여 보여 준다. */
export interface StageEstimate { min: number; max: number }
export function estimateStages(p: RunParams, deep = false): Record<Stage, StageEstimate> {
  const regions = Math.max(1, regionsOf(p).length)
  const designs = plannedPairCount(p)
  const report: StageEstimate = deep ? { min: 25, max: 60 } : { min: 10, max: 16 }
  const gen: StageEstimate = { min: Math.max(1, designs * 0.5), max: designs * 1.2 }
  if (p.mode === 'competitor') {
    return {
      S1: { min: p.competitors.length * 4 + regions * 6, max: p.competitors.length * 8 + regions * 12 },
      S2: report,
      S3: { min: 2, max: 5 },
      S4: { min: 2, max: 6 },
      S5: gen,
    }
  }
  if (p.mode === 'fashion') {
    return {
      S1: { min: regions * 5, max: regions * 9 },
      S2: report,
      S3: { min: 2, max: 5 },
      S4: { min: 2, max: 6 },
      S5: gen,
    }
  }
  return {
    S1: { min: 5, max: 9 },
    S2: { min: 2, max: 4 },
    S3: { min: p.setCount * 2, max: p.setCount * 4 },
    S4: { min: 1, max: 3 },
    S5: { min: Math.max(1, designs * 0.6), max: designs * 1.4 },
  }
}

/** 전체 예상 시간(분) · 단계 범위의 합. 한 곳에서만 계산해야 화면끼리 안 어긋난다. */
export function estimateMinutes(p: RunParams, deep = false): { min: number; max: number } {
  const st = estimateStages(p, deep)
  const lo = Object.values(st).reduce((n, s) => n + s.min, 0)
  const hi = Object.values(st).reduce((n, s) => n + s.max, 0)
  return { min: Math.max(1, Math.round(lo)), max: Math.round(hi) }
}
