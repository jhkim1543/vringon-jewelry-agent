/* 경로별 실제 지출 측정 ───────────────────────────────────────────────
   무엇이 비싼지 추정하지 않는다. 한 번씩 실제로 불러서 토큰과 검색 횟수를 받아
   공표 단가로 값을 매긴다. 캐시를 피하려고 매번 다른 꼬리표를 섞는다.

   이 스크립트가 도는 동안 server/*.mjs 를 고치면 dev 서버가 재시작되며
   진행 중 호출이 전부 죽는다. 실제로 세 번 그랬다 — 손대지 말 것.

   실행: node scripts/spend-probe.mjs
         node scripts/spend-probe.mjs --only crawl,keyword
         node scripts/spend-probe.mjs --skip crawl,shops   (비싼 것 빼고) */
import { writeFileSync, mkdirSync } from 'node:fs'
import { ledger } from '../server/spend.mjs'

const BASE = process.env.AGENT_BASE || 'http://localhost:5188'
const ROOT = process.cwd()
const argOf = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : '' }
const only = argOf('--only') ? new Set(argOf('--only').split(',')) : null
const skip = argOf('--skip') ? new Set(argOf('--skip').split(',')) : new Set()
const TAG = ` [측정 ${Date.now()}]`

const KO = 'Korean (한국어)'
const TARGET = '30-34 · Women'
const DNA = {
  silhouette: '가는 밴드가 한 바퀴 돌다 끝에서 어긋난다', motif: '어긋난 이음매',
  surface: '무광 브러시드', stone: '없음', avoid: ['하트', '무한대 기호'],
}
const SET = {
  name: '수마결', design_dna: ['가는 밴드', '무광 표면', '어긋난 이음매'],
  avoid: ['하트'], metal: '925 실버', stones: '없음',
}
const TREND = '무광 표면과 가는 밴드가 함께 오르는 흐름'

/* 어느 에이전트가 이 경로를 쓰는지 · 표를 그때 그때 다시 세지 않으려고 여기 적어 둔다 */
const CASES = [
  ['crawl',      '/api/agent/competitor/crawl', { brand: 'Pandora', itemKo: '반지' + TAG, country: 'Korea', langName: KO, target: TARGET }],
  ['shops',      '/api/agent/shops',            { region: 'Korea', itemKo: '반지' + TAG, langName: KO, target: TARGET }],
  ['runway',     '/api/agent/runway',           { region: 'Europe', itemKo: '귀걸이' + TAG, langName: KO, target: TARGET }],
  ['adoption',   '/api/agent/adoption',         { region: 'Korea', itemKo: '귀걸이' + TAG, langName: KO, target: TARGET }],
  ['trendreport', '/api/agent/trendreport',     { mode: 'competitor', itemKo: '반지' + TAG, country: 'Korea', langName: KO, target: TARGET, crawl: [], shops: [] }],
  ['forecast',   '/api/agent/forecast',         { mode: 'competitor', itemKo: '반지' + TAG, country: 'Korea', langName: KO, target: TARGET, trendSummary: TREND }],
  ['references', '/api/agent/references',       { mode: 'competitor', itemKo: '반지', country: 'Korea', langName: KO, target: TARGET, trendSummary: TREND + TAG,
    candidates: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, title: `반지 ${i}`, subtitle: `브랜드 · ${10000 + i * 1000} KRW`, traits: 'best', image_url: '' })) }],
  ['refdna',     '/api/agent/refdna',           { refId: 'probe' + TAG, imageUrl: '', sourceUrl: '', context: '가는 밴드 반지 · 무광', langName: KO }],
  ['keyword',    '/api/agent/keyword',          { keyword: '제주 바다의 조수 간만' + TAG, country: 'Korea', langName: KO }],
  ['sets',       '/api/agent/sets',             { keyword: '조수 간만' + TAG, insight: { meaning: '물결이 현무암을 깎는다', cautions: ['돌하르방'] }, setCount: 1, items: ['반지', '귀걸이'], target: TARGET, country: 'Korea', langName: KO, adv: '' }],
  ['itemprompt', '/api/agent/itemprompt',       { setName: SET.name + TAG, dna: SET.design_dna, avoid: SET.avoid, setMetal: SET.metal, setStones: SET.stones, item: '반지', itemEn: 'ring', target: TARGET, langName: KO }],
  ['prompts',    '/api/agent/prompts',          { mode: 'competitor', refId: 'probe' + TAG, variant: 'base', dna: DNA, trendCombo: ['무광'], itemEn: 'ring', itemKo: '반지', target: TARGET, country: 'Korea', langName: KO, brief: '실버 925. 4g 이하.' }],
  ['score',      '/api/agent/score',            { mode: 'competitor', target: TARGET, langName: KO, pairs: [{ id: 'D01', prompt: '925 실버 무광 반지' + TAG }] }],
  ['image-fast',   '/api/image/generate',       { prompt: 'Abstract concept study of eroded basalt ridges, no jewelry, no text.' + TAG, engine: 'fast' }],
  ['image-detail', '/api/image/generate',       { prompt: 'A thin brushed silver ring with an offset seam, three-quarter product view, grey studio.' + TAG, engine: 'detail' }],
]

const before = ledger(ROOT)
const t0 = Date.now()

for (const [name, path, body] of CASES) {
  if (only && !only.has(name)) continue
  if (skip.has(name)) { console.log(`${name.padEnd(13)} 건너뜀`); continue }
  process.stdout.write(`${name.padEnd(13)} `)
  const t = Date.now()
  try {
    const r = await fetch(BASE + path, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(1_200_000),
    })
    const txt = await r.text()
    if (!r.ok) { console.log(`실패 ${r.status} ${txt.slice(0, 90)}`); continue }
    let cached = false
    try { cached = !!JSON.parse(txt).cached } catch { /* 무시 */ }
    console.log(`${((Date.now() - t) / 1000).toFixed(0)}초${cached ? ' · 캐시(값 안 나감)' : ''}`)
  } catch (e) { console.log('실패 · ' + String(e.message).slice(0, 80)) }
}

// ── 이번에 늘어난 만큼만 ────────────────────────────────────────────
const after = ledger(ROOT)
const rows = []
for (const [k, r] of Object.entries(after.routes)) {
  const b = before.routes?.[k] ?? { calls: 0, inputTokens: 0, outputTokens: 0, searches: 0, usd: 0, ms: 0 }
  const d = {
    route: k, calls: r.calls - b.calls,
    inTok: r.inputTokens - b.inputTokens, outTok: r.outputTokens - b.outputTokens,
    searches: r.searches - b.searches, usd: r.usd - b.usd, ms: r.ms - b.ms,
  }
  if (d.calls > 0) rows.push(d)
}
rows.sort((a, b) => b.usd - a.usd)

console.log('\n' + '─'.repeat(80))
console.log(`${'경로'.padEnd(22)}${'호출'.padStart(5)}${'입력'.padStart(10)}${'출력'.padStart(10)}${'검색'.padStart(6)}${'초'.padStart(6)}${'호출당$'.padStart(10)}`)
for (const r of rows) {
  console.log(`${r.route.padEnd(22)}${String(r.calls).padStart(5)}${r.inTok.toLocaleString().padStart(10)}${r.outTok.toLocaleString().padStart(10)}${String(r.searches).padStart(6)}${String(Math.round(r.ms / 1000)).padStart(6)}${('$' + (r.usd / r.calls).toFixed(4)).padStart(10)}`)
}
const sum = rows.reduce((a, r) => a + r.usd, 0)
console.log('─'.repeat(80))
console.log(`합계 $${sum.toFixed(3)} · ${((Date.now() - t0) / 1000 / 60).toFixed(1)}분`)
mkdirSync('.personaqa', { recursive: true })
writeFileSync('.personaqa/spend-probe.json', JSON.stringify({ rows, sum, at: new Date().toISOString() }, null, 1))
console.log('→ .personaqa/spend-probe.json')
