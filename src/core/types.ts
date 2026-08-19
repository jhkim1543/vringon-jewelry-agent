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
/** 업로드된 파일 한 건 · 실제 내용은 서버 `.cache/uploads` 에 있고 해시로 가리킨다.
 *  (base64 를 그대로 들고 있으면 localStorage 용량이 즉시 터진다.) */
// derived: 앱이 만든 것(PDF 쪽 그림 등)이지 사용자가 올린 파일이 아니다.
// 구분하지 않으면 PDF 한 장을 올려도 "9개 업로드"라고 세게 된다.
export interface UploadRef { name: string; hash: string; mime?: string; size?: number; url?: string; derived?: boolean }

/** 사용자가 실제로 올린 것만 · 앱이 떠 둔 쪽 그림은 뺀다.
 *  옛 저장본의 문자열 항목은 파일명뿐이라 파생본일 수 없으므로 그대로 남긴다. */
export function userUploads(list: (string | UploadRef)[]): (string | UploadRef)[] {
  return list.filter(x => typeof x === 'string' || !x.derived)
}

/** 올린 것 중 화면에 그릴 수 있는 이미지만 · PDF 는 여기서 빠진다 */
export function uploadImages(list: (string | UploadRef)[]): UploadRef[] {
  return list.filter((x): x is UploadRef =>
    typeof x === 'object' && !!x?.url && (x.mime ?? '').startsWith('image/'))
}

export interface SeriesInput {
  seriesName: string
  /** 업로드한 시리즈 디자인. 옛 저장본은 파일명 문자열 배열이라 둘 다 받는다. */
  archiveFiles: (string | UploadRef)[]
  valueStatement: string        // 시리즈 가치·철학 기입
  trendSearch: boolean          // 트렌드 조사 ON/OFF (시리즈가 하는 유일한 외부 조사)
}
export interface MoodboardInput {
  files: (string | UploadRef)[] // 트렌드 리포트·무드보드 PDF
  notes: string
}

/** 옛 저장본 호환 · 문자열만 있던 시절 것은 내용이 없으므로 읽을 수 없다.
 *  해시가 있는데 주소가 없는 저장본이 있다(무드보드 PDF 가 그랬다). 서버가 해시로 서빙하므로
 *  여기서 채워 준다 — 주소가 없으면 근거로 인용할 수 없어 참조 패널이 통째로 빈다. */
export function uploadRefs(list: (string | UploadRef)[]): UploadRef[] {
  return list
    .filter((x): x is UploadRef => typeof x === 'object' && !!x?.hash)
    .map(x => x.url ? x : { ...x, url: `/api/upload/file/${x.hash}` })
}
export function uploadName(x: string | UploadRef): string {
  return typeof x === 'string' ? x : x.name
}

export const MODE_SCOPE: Record<Mode, { competitor: boolean; trend: boolean; upload: boolean; note: string }> = {
  trend: { competitor: true, trend: true, upload: false, note: 'Researches competitor products and market trends' },
  series: { competitor: false, trend: true, upload: true, note: 'Reads your series, then checks trends only' },
  moodboard: { competitor: false, trend: false, upload: true, note: 'Uses only the files you upload' },
}

// ── 주얼리 라인 프로필 ──────────────────────────────────────────────
// 925실버+무스톤과 925실버+랩다이아는 경쟁 브랜드·가격 구조·소비자 기대가
// 완전히 다른 시장이다. 조사 전에 이 축들이 확정되어야 한다.
export type BaseMetal = '925_silver' | '14k_gold' | '18k_gold' | 'gold_filled' | 'plated_brass'
export type Coating = 'none' | 'rhodium' | 'gold_vermeil' | 'gold_plated' | 'oxidized'
export type StoneProgram = 'none' | 'cz' | 'lab_diamond' | 'natural_diamond' | 'ruby' | 'sapphire' | 'pearl' | 'crystal'

// 전문가 설정 · 같은 랩다이아 라인도 D-F/VS와 I-J/SI는 경쟁군과 원가가 다르다.
// 모르는 값은 비워 둔다 — 사진에서 등급을 추정해 채우지 않는다.
export interface StoneGrade { color?: string; clarity?: string; cut?: string; caratCt?: number }
/** 진주 7요소 (GIA) · 종류·크기·형태·색·광택·표면·진주층 */
export interface PearlSpec {
  type?: string; sizeMm?: number; shape?: string; color?: string
  luster?: string; surface?: string; nacre?: string
}

export interface LineProfile {
  preset: string; baseMetal: BaseMetal; coating: Coating; stone: StoneProgram
  /** 도금 두께 μm · 0.5μm 플래시와 2.5μm 버메일은 내구성·가격이 다른 시장이다 */
  coatingMicrons?: number
  /** 다이아 4Cs · lab/natural diamond 라인에서만 의미 */
  stoneGrade?: StoneGrade
  pearl?: PearlSpec
  /** 총캐럿(TCW) 상한 · 멀티스톤 설계의 원가 상한이자 조사 필터 */
  tcwMaxCt?: number
  /** 컴플라이언스 · EU REACH 니켈 용출, 카드뮴·납 함량 규제. 수출 라인이면 사실상 필수 */
  compliance?: ('nickel_free' | 'cadmium_free' | 'lead_free')[]
}

export const COMPLIANCE_EN: Record<string, string> = {
  nickel_free: 'nickel-safe (EU REACH nickel release)',
  cadmium_free: 'cadmium-free', lead_free: 'lead-free',
}

/** 조사 프롬프트에 싣는 영문 표현 · 모델이 검색어를 만들 때 그대로 쓴다 */
export const METAL_EN: Record<BaseMetal, string> = {
  '925_silver': '925 sterling silver', '14k_gold': '14K solid gold', '18k_gold': '18K solid gold',
  gold_filled: 'gold-filled', plated_brass: 'plated brass',
}
export const COATING_EN: Record<Coating, string> = {
  none: '', rhodium: 'rhodium plated', gold_vermeil: '18K gold vermeil',
  gold_plated: 'gold plated', oxidized: 'oxidized',
}
export const STONE_EN: Record<StoneProgram, string> = {
  none: 'no stone', cz: 'cubic zirconia', lab_diamond: 'laboratory-grown diamond',
  natural_diamond: 'natural diamond', ruby: 'natural ruby', sapphire: 'natural sapphire',
  pearl: 'cultured pearl', crystal: 'crystal',
}
export function metalProgramOf(l: LineProfile): string {
  let c = COATING_EN[l.coating]
  if (c && l.coatingMicrons) c += ` ${l.coatingMicrons} micron`
  let s = c ? `${METAL_EN[l.baseMetal]}, ${c}` : METAL_EN[l.baseMetal]
  if (l.compliance?.length) s += `, ${l.compliance.map(x => COMPLIANCE_EN[x]).join(', ')}`
  return s
}
// 전문가 값은 프로그램 문자열에 눌러 담는다. 이 문자열이 조사 프롬프트와 캐시 키의
// 입력이라, 값이 바뀌면 캐시가 저절로 갈라진다 — 버전 태그를 올릴 필요가 없다.
export function stoneProgramOf(l: LineProfile): string {
  let s = STONE_EN[l.stone]
  if ((l.stone === 'lab_diamond' || l.stone === 'natural_diamond') && l.stoneGrade) {
    const g = l.stoneGrade
    const bits = [
      g.color && `${g.color} colour`, g.clarity, g.cut && `${g.cut} cut`,
      g.caratCt && `~${g.caratCt}ct centre stone`,
    ].filter(Boolean)
    if (bits.length) s += ` (${bits.join(', ')})`
  }
  if (l.stone === 'pearl' && l.pearl) {
    const p = l.pearl
    const bits = [
      p.type, p.sizeMm && `${p.sizeMm}mm`, p.shape, p.color,
      p.luster && `${p.luster} luster`, p.surface && `${p.surface} surface`, p.nacre && `${p.nacre} nacre`,
    ].filter(Boolean)
    if (bits.length) s += ` (${bits.join(', ')})`
  }
  if (l.stone !== 'none' && l.tcwMaxCt) s += `, total carat weight up to ${l.tcwMaxCt}ct`
  return s
}

/** 근거 ID · 소유자 ID + 순번으로 파생시킨다. 저장된 옛 Run을 고치지 않고도
 *  보드·화면·PDF가 같은 근거를 같은 이름으로 가리킬 수 있다. */
export function evidenceId(ownerId: string, i: number): string { return `${ownerId}.e${i + 1}` }

/** 프리셋은 배타 분류가 아니라 입력값을 미리 채우는 번들이다. 고른 뒤에도 축은 바꿀 수 있다. */
export const LINE_PRESETS: { id: string; label: string; line: Omit<LineProfile, 'preset'> }[] = [
  { id: 'sterling_core', label: 'Sterling Silver Core', line: { baseMetal: '925_silver', coating: 'rhodium', stone: 'none' } },
  { id: 'gold_vermeil', label: 'Gold Vermeil', line: { baseMetal: '925_silver', coating: 'gold_vermeil', stone: 'none' } },
  { id: 'solid_gold', label: 'Solid Gold Fine', line: { baseMetal: '14k_gold', coating: 'none', stone: 'none' } },
  { id: 'diamond', label: 'Diamond Essentials', line: { baseMetal: '925_silver', coating: 'rhodium', stone: 'lab_diamond' } },
  { id: 'colored_gem', label: 'Colored Gemstone', line: { baseMetal: '14k_gold', coating: 'none', stone: 'ruby' } },
  { id: 'pearl', label: 'Pearl', line: { baseMetal: '925_silver', coating: 'rhodium', stone: 'pearl' } },
  { id: 'fashion_crystal', label: 'Fashion & Crystal', line: { baseMetal: 'plated_brass', coating: 'gold_plated', stone: 'crystal' } },
]

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
  /** 주얼리 라인 프로필 · 실버·골드는 금속 축, 다이아·루비·진주는 스톤 축.
   *  하나의 선택지 그룹으로 합치면 서로 다른 시장이 섞인다. */
  line?: LineProfile
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
  line: { preset: 'sterling_core', baseMetal: '925_silver', coating: 'rhodium', stone: 'none' },
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
  /** 라인 대비 경쟁군 분류 · direct(동일 라인) / aspirational(상위 참고) / directional(디자인 참고) */
  competitor_class?: 'direct' | 'aspirational' | 'directional'
  line_match?: boolean
  image_urls?: string[]
  product_url?: string
}

export interface Direction {
  id: string
  title: string
  summary: string
  signal_ids: string[]
}

/** 백화점·명품몰 베스트셀러 · "조사 시점에 잘 팔린다고 표기된 것"의 스냅샷.
 *  경쟁 브랜드 조사와 축이 다르다 — 이쪽은 유통사 랭킹이 기준이다. */
export interface BestsellerProduct {
  product_id: string                 // bs_1 …
  retailer: string
  retailer_scope: 'domestic_dept' | 'global_dept' | 'luxury_etail'
  brand: string
  name: string
  price_krw: number
  /** 사이트에 표기된 순위·배지 그대로. 노출 위치 추정 금지 */
  rank_note: string
  popularity_basis: string[]
  design_traits: string[]
  image_urls: string[]
  product_url: string
  source_urls: string[]
  collected_at: string
}

export interface SeriesDnaElement {
  element: string
  label: string
  observed_in: number
  of: number
  // 판독본에는 신뢰도가 없다 · 있는 척 비워 두고 찍으면 화면에 빈칸이 남는다
  confidence?: 'high' | 'medium' | 'low'
  must_inherit?: boolean
  /** 판독이 이 요소를 어디서 봤는지 · 사람이 되짚을 수 있는 문장 */
  evidence?: string
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
  source_type: 'competitor' | 'bestseller' | 'archive' | 'user_upload' | 'trend_report'
  source_url: string
  collected_at: string
  borrowed_attributes: string[]
  usage: 'attribute_only' | 'visual_reference'
  blocked?: boolean            // competitor + visual_reference → 시스템 차단
  /** 화면에 보이는 이름 · 브랜드+제품명 또는 파일명. 없으면 옛 저장본이다. */
  label?: string
  /** 이 참조가 이 디자인에 닿은 경로 · 레시피 조합, 시리즈 DNA, 신호 id */
  linked_via?: string
  /** 문서 근거의 위치 · 무드보드 PDF 의 쪽 */
  page_ref?: string
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

/** 수집된 근거인가 · 출처가 하나도 없으면 예시 데이터다.
 *  저장된 옛 Run 도 고치지 않고 같은 기준으로 판정된다 (evidenceId 와 같은 파생식 원칙). */
export function isCollectedSignal(s: { sources?: string[]; page_ref?: string }): boolean {
  return (s.sources?.length ?? 0) > 0 || !!s.page_ref
}
export function isCollectedProduct(p: { source_urls?: string[]; product_url?: string }): boolean {
  return (p.source_urls?.length ?? 0) > 0 || !!p.product_url
}

export interface QAResult {
  check: string
  target: string
  observed: string
  pass: boolean
  /** 검사 결과 · unknown 은 "확인 못 했다"이지 통과가 아니다.
   *  선택 필드다 — 옛 저장본과 샘플에는 없고, 그때는 pass 만 읽힌다. */
  status?: 'pass' | 'fail' | 'unknown'
  /** 어느 컷에서 봤는가 */
  view?: string
  /** 모델이 남긴 한 줄 · 무엇이 어떻게 보였는지 */
  note?: string
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
  fieldsLocked: string[]       // 잠긴 필드
  // 무엇이 잠갔는지 · 라인 프로필과 시리즈 DNA 는 출처가 다르다.
  // 둘을 뭉뚱그려 "DNA" 로 표기하면 시리즈 판독을 하지도 않은 모드에서 DNA 를 물려받은 척하게 된다.
  lockedBy?: Record<string, 'dna' | 'line'>
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
  /** QA 가 어긋난 컷을 고쳐 끼웠을 때, 교체 전 해시 · 이미지 계보를 잃지 않게 남긴다 */
  qaRemadeFrom?: string
}

export interface Design {
  spec: DesignSpec
  ruleResults: RuleResult[]
  rejected: boolean            // 룰 탈락
  cost: CostEstimate
  rationale: Rationale
  qa: QAResult[]
  viewMismatch: boolean        // S3 2회 재시도 실패 플래그
  /** 비전 QA 가 아예 못 돈 이유 · 있으면 화면에 통과가 아니라 미확인으로 표시된다 */
  qaError?: string
  /** 브랜드의 "절대 안 하는 것"을 스펙이 어긴 항목 · 룰 엔진과 별개 층이다.
   *  브랜드 설정 화면이 "어기면 카드에 표시된다"고 약속하므로 실제로 표시되어야 한다. */
  brandViolations?: string[]
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
  /** 이 디자인에 배정된 조건 레시피 · 조사 결과의 어떤 조합에서 나온 컨셉인지 */
  recipe?: { title: string; shape: 'solo' | 'pair' | 'fusion'; atoms: { kind: string; label: string }[] }
  /** MD 페르소나의 셀렉 피드백 · 지표와 별개 층, 절대 합산하지 않는다 */
  mdReview?: { verdict: 'pick' | 'hold' | 'drop'; reason: string; fix?: string }
}

// ── 파이프라인 이벤트 ───────────────────────────────────────────────
export type PipelineEvent =
  | { kind: 'log'; stage: Stage | 'S0'; text: string }
  | { kind: 'stage-start'; stage: Stage }
  | { kind: 'stage-done'; stage: Stage }
  | { kind: 'progress'; stage: Stage; pct: number }
  | { kind: 'signals'; signals: Signal[] }
  | { kind: 'competitors'; items: CompetitorProduct[] }
  | { kind: 'bestsellers'; items: BestsellerProduct[] }
  | { kind: 'report-art'; cover?: string; sections?: Record<string, string> }
  | { kind: 'md-rationale'; text: string }
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
  // 승인 게이트 대기 · reason 이 'dna' 면 디자인 승인이 아니라 DNA 충돌 선택을 기다리는 것이다
  | { kind: 'gate'; stage: Stage; reason?: 'designs' | 'dna' }
  | { kind: 'checkpoint'; label: string }
  | { kind: 'done'; endStage: Stage }

export interface RunState {
  params: RunParams
  stageStatus: Record<Stage, 'idle' | 'running' | 'done' | 'gated'>
  logs: { stage: string; text: string; t: number }[]
  signals: Signal[]
  competitors: CompetitorProduct[]
  /** 백화점·명품몰 베스트셀러 · 옛 저장본에는 없다 */
  bestsellers?: BestsellerProduct[]
  directions: Direction[]
  seriesDna: SeriesDna | null
  dnaConflict: { brandClaim: string; observed: string; resolved?: string } | null
  reportBias: ReportBias | null
  trendReport: unknown | null
  /** 리포트를 여는 무드컷 · 조사 사진과 달리 증거가 아니라 편집 아트다 */
  reportArt?: { cover?: string; sections?: Record<string, string> }
  /** MD 총평 · 어떤 기준으로 픽이 갈렸는지 페르소나의 말로 */
  mdPickRationale?: string
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
