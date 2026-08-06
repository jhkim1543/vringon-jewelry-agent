// ── 예상 시간·비용 · 설정을 바꾸면 즉시 다시 계산된다 (지시서 2.2) ──
import { campaignCount, MODE_SCOPE } from './types'
import { ENGINES } from './imageEngines'
import type { RunParams, Stage } from './types'

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
    { stage: 'S1', label: 'Research', minutes: s1Min, usd: s1Usd, images: 0, real: 0 },
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
      minutes: 1.2 + models * 1.6,
      usd: 0.25 + models * 0.08,
      images: 0,
      real: realS5,
    },
  ]

  const order: Stage[] = ['S1', 'S2', 'S3', 'S4', 'S5']
  const upto = order.indexOf(p.endStage)
  const active = stages.slice(0, upto + 1)
  const realInScope = (upto >= 1 ? realS2 : 0) + (upto >= 2 ? realS3 : 0)
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
  S2: { title: 'Sketches', gets: 'Everything above, plus specs, rule checks and hand-drawn sketches.' },
  S3: { title: 'Designs', gets: 'Sketches turned into finished renders, extra views and product variations.' },
  S4: { title: 'Campaign shots', gets: 'Top picks scored, then worn on a virtual model and staged in studio and on location.' },
  S5: { title: '3D showroom', gets: 'Multiview renders go to Tripo. You get a 3D model you can turn on the board.' },
}
