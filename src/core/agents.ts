// ── 에이전트 서버 호출 계층 (클라이언트) ─────────────────────────────
// 모든 조사·프롬프트 호출이 여기를 지난다. langName 은 params.analysisLang 에서
// 명시적으로 실어 보낸다 — 화면 언어를 몰래 따라가지 않는다.
import type {
  AdoptionSignal, CollectionSet, CompetitorCrawl, KeywordInsight, PromptDirection,
  RunParams, RunwayData, ShopCrawl, TrendReportData, VariantKind,
} from './types'
import { ANALYSIS_LANG_NAME, ITEM_EN, ITEM_KO, regionsOf, targetText } from './types'
import { apiUrl } from './api'

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(apiUrl(url), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error ?? `${url} ${r.status}`)
  return j as T
}

const langOf = (p: RunParams) => ANALYSIS_LANG_NAME[p.analysisLang]
/** 지역 여러 개를 프롬프트에 실을 때의 문자열 · 브랜드 크롤·리포트처럼 한 번에 도는 호출용 */
const regionsText = (p: RunParams) => regionsOf(p).join(', ')

// ── 에이전트 1 · 경쟁사 ──────────────────────────────────────────────
export const fetchCompetitorCrawl = (p: RunParams, brand: string) =>
  post<Omit<CompetitorCrawl, 'items'> & { items: { name: string; group: 'representative' | 'best' | 'new'; price: number; currency: string; image_url: string; product_url: string; released_note: string }[]; searches: number }>(
    '/api/agent/competitor/crawl',
    { brand, itemKo: ITEM_KO[p.itemType], country: regionsText(p), langName: langOf(p), direction: p.direction })

/** 편집샵은 지역마다 다르다 · 지역별로 한 번씩 부른다 */
export const fetchShops = (p: RunParams, region: string) =>
  post<{ shops: (Omit<ShopCrawl, 'items'> & { items: { name: string; brand: string; price: number; currency: string; image_url: string; product_url: string; rank_basis: 'official_best' | 'exposure'; rank_note: string }[] })[]; searches: number }>(
    '/api/agent/shops', { itemKo: ITEM_KO[p.itemType], country: region, langName: langOf(p) })

// ── 공통 · 트렌드 리포트 ─────────────────────────────────────────────
export const fetchTrendReport = (p: RunParams) =>
  post<TrendReportData>('/api/agent/trendreport', {
    mode: p.mode, itemKo: ITEM_KO[p.itemType], country: regionsText(p),
    langName: langOf(p), direction: p.direction, target: targetText(p.target),
    // 지역이 늘면 조사도 넓어져야 한다 · 하위 질문 4 + 지역당 2, 최대 8
    depth: Math.min(8, 4 + (regionsOf(p).length - 1) * 2),
  })

/** 다음 시즌 예측 · 트렌드 리포트 뒤에 붙는다. 유저 방향이 여기도 실린다. */
export const fetchForecast = (p: RunParams) =>
  post<import('./types').ForecastData>('/api/agent/forecast', {
    mode: p.mode, itemKo: ITEM_KO[p.itemType], country: regionsText(p),
    langName: langOf(p), direction: p.direction, target: targetText(p.target),
  })

// ── 에이전트 2 · 패션 ────────────────────────────────────────────────
export const fetchRunway = (p: RunParams, region: string) =>
  post<RunwayData & { searches: number }>('/api/agent/runway', {
    country: region, langName: langOf(p), direction: p.direction, itemKo: ITEM_KO[p.itemType],
  })
export const fetchAdoption = (p: RunParams, region: string) =>
  post<{ signals: AdoptionSignal[]; sources: string[]; searches: number }>('/api/agent/adoption', {
    country: region, langName: langOf(p), direction: p.direction, itemKo: ITEM_KO[p.itemType],
  })

// ── 레퍼런스 선정 · DNA · 프롬프트 ───────────────────────────────────
export interface RefCandidate { id: string; title: string; subtitle: string; traits: string; image_url: string }

export const fetchReferences = (p: RunParams, candidates: RefCandidate[], trendSummary: string) =>
  post<{ picks: { slot: number; candidate_id: string; trend_combo: string[]; reason: string }[] }>(
    '/api/agent/references', {
      mode: p.mode, itemKo: ITEM_KO[p.itemType], country: regionsText(p),
      langName: langOf(p), target: targetText(p.target), candidates, trendSummary,
    })

/** sourceUrl 은 출처 페이지 · 직링크가 죽었을 때 og:image 로 폴백하는 데 쓴다 */
export const fetchRefDna = (p: RunParams, refId: string, imageUrl: string, sourceUrl: string, context: string) =>
  post<{ dna: Record<string, unknown>; hadImage: boolean }>('/api/agent/refdna', {
    mode: p.mode, refId, imageUrl, sourceUrl, context,
    itemKo: ITEM_KO[p.itemType], target: targetText(p.target), country: regionsText(p),
    direction: p.direction, langName: langOf(p),
  })

export const fetchPrompts = (p: RunParams, refId: string, variant: VariantKind, dna: Record<string, unknown>, trendCombo: string[]) =>
  post<{ title: string; direction: PromptDirection; final_prompt: string }>('/api/agent/prompts', {
    mode: p.mode, refId, variant, dna, trendCombo,
    itemEn: ITEM_EN[p.itemType], itemKo: ITEM_KO[p.itemType],
    target: targetText(p.target), country: regionsText(p), langName: langOf(p),
    // 사용자가 방향에 적은 수치(중량·가격대·금속 규격)를 제작 사양이 지켜야 한다.
    // 이것을 안 넘기면 모델이 제 마음대로 18K 를 골라 원가가 목표의 세 배가 된다.
    brief: p.direction,
  })

// ── 에이전트 3 · 컬렉션 ──────────────────────────────────────────────
export const fetchKeyword = (p: RunParams) =>
  post<KeywordInsight & { searches: number }>('/api/agent/keyword', {
    keyword: p.direction, country: regionsText(p), langName: langOf(p),
  })

export const fetchSets = (p: RunParams, insight: KeywordInsight) => {
  const adv = p.collectionAdv
  const advText = adv ? [
    adv.expression && `표현 수준 ${adv.expression}`, adv.positioning && `포지셔닝 ${adv.positioning}`,
    adv.metalsPrefer && `선호 금속 ${adv.metalsPrefer}`, adv.metalsAvoid && `제외 금속 ${adv.metalsAvoid}`,
    adv.stonesPrefer && `선호 스톤 ${adv.stonesPrefer}`, adv.stonesAvoid && `제외 스톤 ${adv.stonesAvoid}`,
    adv.priceTarget && `목표 가격대 ${adv.priceTarget}`, adv.manufacturing && `제조 방식 ${adv.manufacturing}`,
  ].filter(Boolean).join(' · ') : ''
  return post<{ sets: CollectionSet[] }>('/api/agent/sets', {
    keyword: p.direction, insight, setCount: p.setCount,
    items: p.items.map(i => ITEM_KO[i]), target: targetText(p.target),
    country: regionsText(p), langName: langOf(p), adv: advText,
  })
}

export const fetchItemPrompt = (p: RunParams, set: CollectionSet, item: string) =>
  post<{ final_prompt: string; feature: string }>('/api/agent/itemprompt', {
    setName: set.name, dna: set.design_dna, avoid: set.avoid,
    // 세트가 정한 금속·스톤을 그대로 실어 보낸다. design_dna 안에 녹아 있으리라 믿고
    // 안 보냈더니, 한 세트 25개 중 9개가 950 플래티넘에서 18K 로 갈아탔다.
    setMetal: set.metal, setStones: set.stones,
    item: ITEM_KO[item], itemEn: ITEM_EN[item],
    target: targetText(p.target), langName: langOf(p),
    brief: [p.collectionAdv?.priceTarget && `목표 가격대 ${p.collectionAdv.priceTarget}`,
      p.collectionAdv?.metalsPrefer && `선호 금속 ${p.collectionAdv.metalsPrefer}`,
      p.collectionAdv?.manufacturing && `제조 방식 ${p.collectionAdv.manufacturing}`].filter(Boolean).join(' · '),
  })

// ── 사전 평가 (텍스트 기준 · 비전 아님) ──────────────────────────────
export const fetchScores = (p: RunParams, pairs: { id: string; prompt: string }[]) =>
  post<{ scores: { id: string; total: number; note: string }[] }>('/api/agent/score', {
    mode: p.mode, pairs, target: targetText(p.target), langName: langOf(p),
  })

// ── 이미지 생성 · 기존 엔진 경로 그대로 (자체 호스팅이 켜져 있으면 그쪽) ──
export interface GenResult { url: string; hash: string; cached: boolean }
export async function generateImage(prompt: string, engine: 'fast' | 'detail', size = '1024x1024'): Promise<GenResult> {
  return post<GenResult>('/api/image/generate', { prompt, size, engine })
}

/** 조사 사진 프록시 · 직링크가 없거나 죽었으면 상품 페이지의 og:image 로 폴백한다.
 *  조사 모델이 이미지 파일 직링크를 좀처럼 주지 않으므로(지어내지 말라는 규칙 때문)
 *  페이지 폴백이 사실상 사진의 주 공급원이다. */
export function shotUrl(remote: string | undefined, page?: string): string {
  if (!remote && !page) return ''
  // 정적 배포에는 프록시가 없다 · 구운 사본(shot)이 있으면 호출부가 그걸 먼저 쓴다
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  if (base !== '/') return ''
  const q: string[] = []
  if (remote) q.push(`u=${encodeURIComponent(remote)}`)
  if (page && /^https:/.test(page)) q.push(`p=${encodeURIComponent(page)}`)
  return apiUrl(`/api/shot?${q.join('&')}`)
}
