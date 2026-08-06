// ── VRINGON Design Agent · 도메인 타입 (작업지시서 v5.0) ──────────────

export type Mode = 'trend' | 'series' | 'moodboard'
export type Category = 'jewelry'
export type DesignTier = 'core' | 'push' | 'signature'
export type Stage = 'S1' | 'S2' | 'S3' | 'S4' | 'S5'

export const MODE_LABEL: Record<Mode, string> = {
  trend: 'Trend', series: 'Series', moodboard: 'Moodboard',
}
export const CAT_LABEL: Record<Category, string> = { jewelry: 'Jewelry' }
export const TIER_LABEL: Record<DesignTier, string> = {
  core: 'Core', push: 'Push', signature: 'Signature',
}

// ── 품목 분류 · 카테고리 → 그룹 → 타입 ─────────────────────────────
// en은 이미지 프롬프트에, label은 화면에 쓴다. 한 곳에서만 정의한다.
export interface TypeDef { id: string; label: string; en: string }
export interface GroupDef { id: string; label: string; note: string; types: TypeDef[] }

export const TAXONOMY: Record<Category, GroupDef[]> = {
  jewelry: [
    {
      id: 'ring', label: 'Rings', note: 'Band, solitaire', types: [
        { id: 'band_ring', label: 'Band', en: 'plain band ring' },
        { id: 'solitaire', label: 'Solitaire', en: 'solitaire ring with a single center stone' },
        { id: 'eternity', label: 'Eternity', en: 'eternity ring with stones set all around' },
        { id: 'signet', label: 'Signet', en: 'signet ring with a flat engraved face' },
      ],
    },
    {
      id: 'earring', label: 'Earrings', note: 'Stud, hoop', types: [
        { id: 'stud', label: 'Stud', en: 'stud earrings' },
        { id: 'hoop', label: 'Hoop', en: 'hoop earrings' },
        { id: 'drop', label: 'Drop', en: 'drop earrings' },
        { id: 'ear_cuff', label: 'Ear cuff', en: 'ear cuff' },
      ],
    },
    {
      id: 'necklace', label: 'Necklaces', note: 'Pendant, chain', types: [
        { id: 'pendant', label: 'Pendant', en: 'pendant necklace' },
        { id: 'choker', label: 'Choker', en: 'choker necklace' },
        { id: 'chain_necklace', label: 'Chain', en: 'chain necklace' },
        { id: 'station', label: 'Station', en: 'station necklace with evenly spaced stones' },
      ],
    },
    {
      id: 'bracelet', label: 'Bracelets', note: 'Bangle, cuff', types: [
        { id: 'bangle', label: 'Bangle', en: 'rigid bangle bracelet' },
        { id: 'chain_bracelet', label: 'Chain', en: 'chain bracelet' },
        { id: 'cuff', label: 'Cuff', en: 'open cuff bracelet' },
        { id: 'tennis', label: 'Tennis', en: 'tennis bracelet with a continuous line of stones' },
      ],
    },
    {
      id: 'other', label: 'Other', note: 'Brooch, anklet', types: [
        { id: 'brooch', label: 'Brooch', en: 'brooch' },
        { id: 'anklet', label: 'Anklet', en: 'anklet' },
      ],
    },
  ],
}

export const ALL_TYPES: TypeDef[] = Object.values(TAXONOMY).flatMap(gs => gs.flatMap(g => g.types))
export const TYPE_LABEL: Record<string, string> = Object.fromEntries(ALL_TYPES.map(t => [t.id, t.label]))
export const TYPE_EN: Record<string, string> = Object.fromEntries(ALL_TYPES.map(t => [t.id, t.en]))

export function groupOf(category: Category, typeId: string): GroupDef | undefined {
  return TAXONOMY[category].find(g => g.types.some(t => t.id === typeId))
}
export function firstTypeOf(category: Category, groupId: string): string {
  return TAXONOMY[category].find(g => g.id === groupId)?.types[0].id ?? TAXONOMY[category][0].types[0].id
}

// ── 모드별 입력 · 세 모드는 조사 범위 자체가 다르다 ──────────────────
// 트렌드   : 경쟁사 입력 → 경쟁사 제품 리서치 + 트렌드 리서치 (외부 조사 최대)
// 시리즈   : 시리즈 디자인 업로드 + 가치 기입 → 트렌드 조사까지만 (경쟁사 리서치 없음)
// 무드보드 : 유저 PDF만 → 외부 조사 없음
export interface TrendInput {
  competitors: string[]
  priceBand: 'mass' | 'contemporary' | 'premium' | 'luxury'
  priceMinKrw: number
  priceMaxKrw: number
}
export interface SeriesInput {
  seriesName: string
  archiveFiles: string[]        // 업로드한 시리즈 디자인 파일명
  valueStatement: string        // 시리즈 가치·철학 기입
  trendSearch: boolean          // 트렌드 조사 ON/OFF (시리즈가 하는 유일한 외부 조사)
}
export interface MoodboardInput {
  files: string[]               // 트렌드 리포트·무드보드 PDF
  notes: string
}

export const MODE_SCOPE: Record<Mode, { competitor: boolean; trend: boolean; upload: boolean; note: string }> = {
  trend: { competitor: true, trend: true, upload: false, note: 'Researches competitor products and market trends' },
  series: { competitor: false, trend: true, upload: true, note: 'Reads your series, then checks trends only' },
  moodboard: { competitor: false, trend: false, upload: true, note: 'Uses only the files you upload' },
}

// ── 실행 파라미터 (지시서 2.1) ──────────────────────────────────────
export interface RunParams {
  mode: Mode
  category: Category
  itemType: string
  endStage: Stage
  sketchCount: 6 | 12 | 18 | 24
  tierRatio: [number, number, number]      // Core : Push : Signature
  renderRatio: 0.25 | 0.5 | 0.75
  viewCount: 1 | 3 | 4
  colorwayCount: 0 | 1 | 2 | 3
  topN: number                              // 1~5
  /** 스케치 한 장마다 몇 개의 디자인을 뽑을지. 트렌드 근거로 프롬프트를 바꿔 가며 생성한다. */
  designsPerSketch?: 1 | 2 | 3 | 4
  /** 스케치 한 장에서 갈라지는 제품 베리에이션 수 */
  variationCount: 0 | 2 | 3 | 4 | 6 | 8
  /** 캠페인 컷 · 착용컷과 연출컷을 한 묶음으로 뽑는다 (top 하나당 장수) */
  campaignShots: 0 | 2 | 4 | 6
  /** 옛 샘플 호환 · 저장된 Run이 아직 이 두 값을 들고 있다 */
  wearCuts?: number
  conceptShots?: number
  /** 멀티뷰 → 3D 모델 생성 */
  make3d: boolean
  approvalGate: boolean
  /** 디자인 생성 모델 · 화면에는 성격으로만 노출한다 */
  imageEngine: 'fast' | 'detail'
  /** 실제 생성 상한 (장) · 초과분은 SVG로 폴백. 비용 통제 */
  imageBudget: 0 | 6 | 12 | 24 | 48
  trend: TrendInput
  series: SeriesInput
  moodboard: MoodboardInput
  /** 조사 결과를 쓸 언어. 화면 언어와 별개로 분석 시작 시 정한다. */
  researchLang?: import('./i18n').Lang
  /** 브랜드 아이덴티티 · 모든 결과물에 공통으로 실린다 */
  brand?: import('./brand').BrandIdentity
}


/** 캠페인 컷 수 · 옛 Run은 wearCuts + conceptShots 로 저장돼 있다 */
export function campaignCount(p: Pick<RunParams, 'campaignShots' | 'wearCuts' | 'conceptShots'>): number {
  if (typeof p.campaignShots === 'number') return p.campaignShots
  return (p.wearCuts ?? 0) + (p.conceptShots ?? 0)
}

export const DEFAULT_PARAMS: RunParams = {
  mode: 'trend', category: 'jewelry', itemType: 'band_ring',
  endStage: 'S3', sketchCount: 12, tierRatio: [1, 1, 1],
  renderRatio: 0.5, viewCount: 3, colorwayCount: 2,
  topN: 3, designsPerSketch: 2, variationCount: 3, campaignShots: 4, make3d: true, approvalGate: true,
  imageEngine: 'detail', imageBudget: 12,
  trend: {
    // 기본을 비워둔다. 가상의 브랜드명으로 검색하면 결과가 무의미하고 시간만 든다.
    competitors: [],
    priceBand: 'contemporary', priceMinKrw: 150000, priceMaxKrw: 450000,
  },
  series: {
    seriesName: '', archiveFiles: [], valueStatement: '', trendSearch: true,
  },
  moodboard: { files: [], notes: '' },
}

// ── 신호 (S1) ───────────────────────────────────────────────────────
export interface Signal {
  signal_id: string
  attribute: string
  label: string
  axis: string
  observed_count: number
  sources: string[]
  price_bands: string[]
  confidence: 'high' | 'medium' | 'low'
  direction: 'rising' | 'stable' | 'declining'
  first_seen: string
  dedup_group: string
  oem_group: string | null
  page_ref?: string            // 무드보드 모드: 페이지·위치 참조
  sales_proxy_score?: number   // 트렌드 모드
  proxy_confidence?: 'high' | 'medium' | 'low' | 'none'
  evidence?: string[]          // 웹 수집 시 확인된 근거 문장
}

export interface CompetitorProduct {
  product_id: string
  brand: string
  name: string
  price_krw: number
  sales_proxy_score: number | null
  proxy_signals: string[]
  observation_count: number
  observation_window: string
  confidence: 'high' | 'medium' | 'low' | 'none'
  in_band: boolean
  evidence_strength?: 'strong' | 'moderate' | 'weak' | 'none'
  source_urls?: string[]
  rank_note?: string
  user_sentiment?: 'positive' | 'mixed' | 'negative' | 'unknown'
  praise_points?: string[]
  complaint_points?: string[]
  design_traits?: string[]
  image_urls?: string[]
  product_url?: string
}

export interface Direction {
  id: string
  title: string
  summary: string
  signal_ids: string[]
}

export interface SeriesDnaElement {
  element: string
  label: string
  observed_in: number
  of: number
  confidence: 'high' | 'medium' | 'low'
  must_inherit?: boolean
  variation_range?: string[]
  observed?: (string | number)[]
  note?: string
}

export interface SeriesDna {
  invariant: SeriesDnaElement[]
  variable: SeriesDnaElement[]
  ambiguous: SeriesDnaElement[]
}

export interface ReportBias {
  publisher: string
  perspective: string
  notes: string[]
}

// ── 근거 추적 체인 (지시서 10장) ────────────────────────────────────
export interface ReferenceImage {
  ref_id: string
  source_type: 'competitor' | 'archive' | 'user_upload' | 'trend_report'
  source_url: string
  collected_at: string
  borrowed_attributes: string[]
  usage: 'attribute_only' | 'visual_reference'
  blocked?: boolean            // competitor + visual_reference → 시스템 차단
}

export interface Rationale {
  agent_mode: Mode
  driving_signals: { signal_id: string; weight: number }[]
  reference_images: ReferenceImage[]
  reference_prompts: { text: string; origin: string; applied_as: string[] }[]
  series_dna_inherited: string[]
  type_placement_reason: string
  narrative: string[]          // 발표 노트 3~4문장
}

// ── 룰·검증 ─────────────────────────────────────────────────────────
export interface RuleResult {
  rule: string
  severity: 'fail' | 'warn'
  message: string
}

export interface QAResult {
  check: string
  target: string
  observed: string
  pass: boolean
}

export interface CostEstimate {
  lines: { label: string; krw: number }[]
  tooling: {
    total_tooling_krw: number
    mold_count_required: number
    size_run_count?: number
    amortization_volume: number
    tooling_per_unit_krw: number
  }
  estimated_total_krw: number
  estimated_band_krw: [number, number]
  cap_ratio: number            // 원가 상한 대비 (1.0 = 100%)
  confidence: 'low' | 'medium' | 'high'
  assumptions: string[]
  excluded_costs: string[]
}

// ── 디자인 (스펙 + 산출물) ──────────────────────────────────────────
export interface DesignSpec {
  design_id: string
  tier: DesignTier
  category: Category
  itemType: string
  fields: Record<string, string | number | boolean>
  fieldsLocked: string[]       // 시리즈 DNA로 잠긴 필드
}

/** 실제 생성된 이미지 · origin은 지시서 9장 이미지 원장 */
export interface DesignImage {
  view: string
  colorway?: string
  url: string
  hash: string
  origin: 'generated' | 'edited_from' | 'regenerated_hq'
  /** 베리에이션 축 이름 · 어떤 축을 바꾼 안인지 */
  variantOf?: string
  variantAxis?: string
  /** 이 이미지를 만든 프롬프트 · 근거 표시용. 없으면 옛 데이터다. */
  promptUsed?: string
  /** 컨셉 촬영 컷 라벨과 가상 인물 */
  conceptLabel?: string
  persona?: string
  editedFrom?: string
}

export interface Design {
  spec: DesignSpec
  ruleResults: RuleResult[]
  rejected: boolean            // 룰 탈락
  cost: CostEstimate
  rationale: Rationale
  qa: QAResult[]
  viewMismatch: boolean        // S3 2회 재시도 실패 플래그
  // 결정적 지표 (계층 1)
  metrics: { label: string; value: string }[]
  // 모델 평가 (계층 2)
  modelEval: { label: string; value: string; basis: string }[]
  colorways: string[]          // hue names
  images: DesignImage[]        // 실제 생성 이미지 (비면 SVG 시뮬레이션 표시)
  /** 멀티뷰에서 만든 3D 모델 (GLB) */
  model?: { url: string; hash: string; format: string; views: number; note?: string }
  imageError?: string          // 부분 실패 격리 · 이 건만 실패, 나머지는 진행
  isTop: boolean
  topDistance?: number         // Top N 상호 스펙 거리
  // 품평 게이트 (계층 3)
  verdict?: 'approve' | 'reject'
  verdictTags?: string[]
}

// ── 파이프라인 이벤트 ───────────────────────────────────────────────
export type PipelineEvent =
  | { kind: 'log'; stage: Stage | 'S0'; text: string }
  | { kind: 'stage-start'; stage: Stage }
  | { kind: 'stage-done'; stage: Stage }
  | { kind: 'progress'; stage: Stage; pct: number }
  | { kind: 'signals'; signals: Signal[] }
  | { kind: 'competitors'; items: CompetitorProduct[] }
  | { kind: 'directions'; items: Direction[] }
  | { kind: 'series-dna'; dna: SeriesDna }
  | { kind: 'dna-conflict'; brandClaim: string; observed: string }
  | { kind: 'report-bias'; bias: ReportBias }
  | { kind: 'trend-report'; report: unknown }
  | { kind: 'report-pending'; on: boolean }
  | { kind: 'dossier'; dossier: unknown }
  | { kind: 'dossier-pending'; on: boolean }
  | { kind: 'design'; design: Design }
  | { kind: 'design-update'; design: Design }
  | { kind: 'gate'; stage: Stage }         // 승인 게이트 대기
  | { kind: 'checkpoint'; label: string }
  | { kind: 'done'; endStage: Stage }

export interface RunState {
  params: RunParams
  stageStatus: Record<Stage, 'idle' | 'running' | 'done' | 'gated'>
  logs: { stage: string; text: string; t: number }[]
  signals: Signal[]
  competitors: CompetitorProduct[]
  directions: Direction[]
  seriesDna: SeriesDna | null
  dnaConflict: { brandClaim: string; observed: string; resolved?: string } | null
  reportBias: ReportBias | null
  trendReport: unknown | null
  /** 시즌 도시에 · MICAM 형식의 구조화된 트렌드 자료 */
  dossier: unknown | null
  dossierPending: boolean
  reportPending: boolean
  designs: Design[]
  checkpoints: string[]
  finished: boolean
  /** 미리 만들어 둔 예시 Run · 삭제되지 않는다 */
  sample?: boolean
  sampleTitle?: string
  savedAtISO?: string
}

export const VERDICT_TAGS = ['Form', 'Material', 'Colour', 'Cost', 'Brand tone', 'Manufacturing', 'Too familiar', 'Timing']
