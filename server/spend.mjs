/* API 지출 장부 ──────────────────────────────────────────────────────
   무엇에 얼마가 나가는지 재지 않으면 어디를 줄일지 정할 수 없다.
   이 파일은 호출마다 토큰과 웹검색 횟수를 적고, 아래 단가표로 값을 매긴다.

   단가는 조사한 시점(PRICED_AT)의 공표가다. 바뀌면 여기만 고치면 된다.
   출처: developers.openai.com/api/docs/pricing (2026-08 확인)

   캐시로 막힌 호출은 여기 오지 않는다 — 장부에 남은 것이 실제로 나간 돈이다. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const PRICED_AT = '2026-08'

/** 1M 토큰당 달러 · [입력, 출력] */
const TOKEN_USD = {
  'gpt-5': [1.25, 10],
  'gpt-5.1': [1.25, 10],
  'gpt-5.2': [1.75, 14],
  'gpt-5.5': [5, 30],
  'gpt-5.6-sol': [4, 20],
  'gpt-5.6-terra': [2, 12],
  'gpt-5.6-luna': [0.2, 1.2],
  'gpt-5-pro': [15, 120],
  'gpt-image-1': [5, 40],
  'gpt-image-1.5': [5, 32],
  'gpt-image-2': [5, 30],
}
/** 내장 웹검색 · 1000회당 달러 (검색 내용 토큰은 모델 단가로 따로 붙는다) */
const SEARCH_USD_PER_1K = 10

const rateOf = (model) => {
  const m = String(model ?? '').toLowerCase()
  if (TOKEN_USD[m]) return TOKEN_USD[m]
  // 접두사로 맞춰 본다 · 'gpt-5-2026-xx' 같은 스냅샷 이름
  const hit = Object.keys(TOKEN_USD).find(k => m.startsWith(k))
  return hit ? TOKEN_USD[hit] : null
}

/** 한 호출의 값 · 모르는 모델이면 null (지어내지 않는다) */
export function priceOf({ model, inputTokens = 0, outputTokens = 0, searches = 0 }) {
  const r = rateOf(model)
  if (!r) return null
  return (inputTokens / 1e6) * r[0] + (outputTokens / 1e6) * r[1] + (searches / 1000) * SEARCH_USD_PER_1K
}

const fileOf = (root) => {
  const d = process.env.SPEND_DIR || join(root, '.cache')
  mkdirSync(d, { recursive: true })
  return join(d, 'spend.json')
}

/** 호출 하나를 장부에 적는다 · 실패해도 조사를 막지 않는다 */
export function record(root, { route, model, inputTokens = 0, outputTokens = 0, searches = 0, ms = 0, effort = '' }) {
  try {
    const p = fileOf(root)
    const led = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { since: new Date().toISOString(), routes: {} }
    const k = route || 'unknown'
    const r = led.routes[k] ??= { calls: 0, inputTokens: 0, outputTokens: 0, searches: 0, ms: 0, usd: 0, models: {} }
    r.calls++; r.inputTokens += inputTokens; r.outputTokens += outputTokens
    r.searches += searches; r.ms += ms
    r.models[model] = (r.models[model] ?? 0) + 1
    // 추론 강도별로 갈라 적는다 · 출력 토큰의 대부분이 추론 토큰이라 값이 여기서 갈린다
    if (effort) {
      const e = r.efforts ??= {}
      const x = e[effort] ??= { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, ms: 0 }
      x.calls++; x.inputTokens += inputTokens; x.outputTokens += outputTokens; x.ms += ms
      const u = priceOf({ model, inputTokens, outputTokens, searches })
      if (u != null) x.usd += u
    }
    const usd = priceOf({ model, inputTokens, outputTokens, searches })
    if (usd != null) r.usd += usd
    else r.unpriced = (r.unpriced ?? 0) + 1
    writeFileSync(p, JSON.stringify(led, null, 1))
  } catch { /* 장부는 부가 기능이다 · 실패해도 본 일을 막지 않는다 */ }
}

/** 지금까지의 지출 · 화면과 /api/status 가 읽는다 */
export function ledger(root) {
  try {
    const p = fileOf(root)
    if (!existsSync(p)) return { since: null, total: 0, routes: {} }
    const led = JSON.parse(readFileSync(p, 'utf8'))
    const total = Object.values(led.routes).reduce((a, r) => a + (r.usd ?? 0), 0)
    return { ...led, total, pricedAt: PRICED_AT }
  } catch { return { since: null, total: 0, routes: {} } }
}
