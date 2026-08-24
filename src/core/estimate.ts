// ── 예상 시간·비용 · 설정을 바꾸면 즉시 다시 계산된다 (지시서 2.2) ──
import { campaignCount, MODE_SCOPE } from './types'
import { ENGINES } from './imageEngines'
import { t } from './i18n'
import type { Mode, RunParams, Stage } from './types'

export interface Estimate {
  perStage: { stage: Stage; label: string; minutes: number; usd: number; images: number; real: number }[]
  totalMinutes: number
  totalUsd: number
  totalImages: number
  realImages: number
}

const RETRY = 1.2                 // 재시도분
const USD_PER_SEARCH_BATCH = 0.35 // 웹 검색 리서치 1회분 근사 단가
const MIN_PER_SEARCH_BATCH = 1.6  // 검색·정리에 걸리는 시간

export function estimate(p: RunParams): Estimate {
  const scope = MODE_SCOPE[p.mode]
  const n = p.sketchCount
  const renders = Math.max(1, Math.round(n * p.renderRatio))
  // 스케치당 디자인 수 · 옛 저장본에는 없으므로 1로 떨어진다
  const dps = p.designsPerSketch ?? 1
  // 추가 디자인은 같은 스케치에 다른 트렌드 프롬프트를 넣어 만든다
  const extraDesigns = renders * Math.max(0, dps - 1)
  const extraViews = renders * Math.max(0, p.viewCount - 1)
  const colorways = renders * p.colorwayCount
  const variations = renders * p.variationCount
  const campaignImgs = p.topN * campaignCount(p)
  const models = p.make3d ? p.topN : 0

  // ── S1 조사 · 모드마다 실제로 수행하는 조사가 다르다
  let s1Min = 1.2, s1Usd = 0.15
  if (scope.competitor) {
    // 브랜드 수에 비례해 검색량이 늘어난다
    const batches = Math.max(1, Math.ceil(p.trend.competitors.length / 2))
    s1Min += batches * MIN_PER_SEARCH_BATCH
    s1Usd += batches * USD_PER_SEARCH_BATCH
  }
  if (scope.trend && (p.mode !== 'series' || p.series.trendSearch)) {
    s1Min += MIN_PER_SEARCH_BATCH
    s1Usd += USD_PER_SEARCH_BATCH
  }
  if (scope.upload) {
    const files = p.mode === 'series' ? p.series.archiveFiles.length : p.moodboard.files.length
    s1Min += 0.8 + files * 0.12
    s1Usd += 0.1 + files * 0.02
  }
  // 리포트 표지·섹션 배너 · 실제로 만드는 이미지다. 추정에서 빼 두면
  // 화면의 장수와 금액이 실제보다 작아진다 (표지 1 + 매크로 3).
  const s1Art = scope.trend ? 4 : 0

  // ── 실제 생성 장수 · 상한과 실제 필요량 중 작은 쪽
  const wantS2 = n
  const wantS3 = renders + extraDesigns + extraViews + colorways + variations
  const budget = p.imageBudget
  const realS2 = Math.min(wantS2, budget)
  const realS3 = Math.min(wantS3, Math.max(0, budget - realS2))
  const realS4 = Math.min(campaignImgs, Math.max(0, budget - realS2 - realS3))
  const realS5 = 0                              // 3D 쇼룸은 이미지를 만들지 않는다

  const eng = ENGINES[p.imageEngine]
  const USD_PER_IMAGE = eng.usdPerImage
  const MIN_PER_IMAGE = eng.secPerImage / 60 / Math.max(1, eng.concurrency / 2)

  const stages: Estimate['perStage'] = [
    {
      stage: 'S1', label: 'Research',
      minutes: s1Min + s1Art * MIN_PER_IMAGE,
      usd: s1Usd + s1Art * USD_PER_IMAGE,
      images: s1Art, real: s1Art,
    },
    {
      stage: 'S2', label: 'Sketch',
      minutes: 0.8 + realS2 * MIN_PER_IMAGE + n * 0.03,
      usd: 0.12 + realS2 * USD_PER_IMAGE,
      images: n,
      real: realS2,
    },
    {
      stage: 'S3', label: 'Design',
      minutes: 0.8 + realS3 * MIN_PER_IMAGE,
      usd: 0.1 + realS3 * USD_PER_IMAGE * RETRY,
      images: wantS3,
      real: realS3,
    },
    {
      stage: 'S4', label: 'Campaign',
      minutes: 0.7 + realS4 * MIN_PER_IMAGE,
      usd: 0.1 + realS4 * USD_PER_IMAGE * RETRY,
      images: campaignImgs,
      real: realS4,
    },
    {
      // 컨셉 촬영은 생성 이미지다. 영상은 로컬 오픈소스라 과금이 붙지 않는다.
      stage: 'S5', label: '3D showroom',
      // 4면 정사영 뷰(모델당 4장 편집) + Tripo 생성
      minutes: 1.2 + models * (1.6 + 4 * MIN_PER_IMAGE),
      usd: 0.25 + models * (0.08 + 4 * USD_PER_IMAGE * RETRY),
      images: 0,
      real: realS5,
    },
  ]

  const order: Stage[] = ['S1', 'S2', 'S3', 'S4', 'S5']
  const upto = order.indexOf(p.endStage)
  const active = stages.slice(0, upto + 1)
  const realInScope = s1Art + (upto >= 1 ? realS2 : 0) + (upto >= 2 ? realS3 : 0)
    + (upto >= 3 ? realS4 : 0) + (upto >= 4 ? realS5 : 0)
  return {
    perStage: stages,
    totalMinutes: Math.max(1, Math.round(active.reduce((s, x) => s + x.minutes, 0))),
    totalUsd: Math.round(active.reduce((s, x) => s + x.usd, 0) * 100) / 100,
    totalImages: active.reduce((s, x) => s + x.images, 0),
    realImages: realInScope,
  }
}

export function cumulative(p: RunParams): { stage: Stage; label: string; minutes: number; usd: number }[] {
  const e = estimate(p)
  let m = 0, u = 0
  return e.perStage.map(s => {
    m += s.minutes; u += s.usd
    return { stage: s.stage, label: s.label, minutes: Math.max(1, Math.round(m)), usd: Math.round(u * 100) / 100 }
  })
}

/** 스콥 선택지에 붙는 설명. "S3까지"가 아니라 "무엇까지 나오는가"로 읽혀야 한다. */
export const SCOPE_COPY: Record<Stage, { title: string; gets: string }> = {
  S1: { title: 'Research only', gets: 'Competitors, trend signals and the season dossier. No images.' },
  // ↑ 기본값은 트렌드 모드 기준이다. 모드마다 실제로 나오는 것이 다르므로 scopeGets 를 쓴다.
  S2: { title: 'Sketches', gets: 'Everything above, plus specs, rule checks and hand-drawn sketches.' },
  S3: { title: 'Designs', gets: 'Sketches turned into finished renders, extra views and product variations.' },
  S4: { title: 'Campaign shots', gets: 'Top picks scored, then worn on a virtual model and staged in studio and on location.' },
  S5: { title: '3D showroom', gets: 'The final designs become 3D models you can turn and download on the board.' },
}

/**
 * 모드가 정하는 것은 S1 에서 무엇이 나오느냐다. 시리즈는 경쟁사 조사를 하지 않고,
 * 무드보드는 조사 자체를 하지 않는다. 세 모드에 같은 문구를 걸면 하지 않을 일을 약속하게 된다.
 */
export function scopeGets(stage: Stage, mode: Mode): string {
  if (stage !== 'S1') return SCOPE_COPY[stage].gets
  const s = MODE_SCOPE[mode]
  if (!s.competitor && !s.trend) return t('A read of the files you upload — what is constant, what varies, what is unclear. No outside research, no images.')
  if (!s.competitor) return t('A read of your series plus trend signals and the season dossier. No competitor products, no images.')
  return SCOPE_COPY.S1.gets
}

/**
 * 범위가 정하는 것 · "조사만" 을 골랐는데 3D 쇼룸을 켤 수 있으면 둘 중 하나는 거짓말이다.
 * 범위를 고르는 순간 그 뒤 단계의 설정은 의미를 잃으므로, 여기서 한 곳에 모아 판정한다.
 * 화면은 이 값으로 컨트롤을 잠그고, 파라미터도 같이 정리한다.
 */
export interface ScopeCaps {
  sketches: boolean      // S2 이상 · 스케치를 만드는가
  renders: boolean       // S3 이상 · 디자인 렌더·뷰·컬러웨이·베리에이션
  campaign: boolean      // S4 이상 · 착용·컨셉 컷
  model3d: boolean       // S5 · 3D 쇼룸
}

const ORDER: Stage[] = ['S1', 'S2', 'S3', 'S4', 'S5']

export function scopeCaps(endStage: Stage): ScopeCaps {
  const i = ORDER.indexOf(endStage)
  return { sketches: i >= 1, renders: i >= 2, campaign: i >= 3, model3d: i >= 4 }
}

/**
 * 범위 밖의 설정을 정리한 파라미터를 돌려준다. 값을 0/off 로 내리기만 하고 되살리지는 않는다 —
 * 사용자가 범위를 넓혔을 때 예전 값을 멋대로 복원하면 그것대로 놀란다.
 */
export function clampToScope(p: RunParams): RunParams {
  const c = scopeCaps(p.endStage)
  const next = { ...p }
  if (!c.renders) { next.viewCount = 1; next.colorwayCount = 0; next.variationCount = 0 }
  if (!c.campaign) next.campaignShots = 0
  if (!c.model3d) next.make3d = false
  return next
}
