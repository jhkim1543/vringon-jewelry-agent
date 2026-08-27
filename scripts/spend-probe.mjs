/* 경로별 실제 지출 측정 ───────────────────────────────────────────────
   무엇이 비싼지 추정하지 않는다. 한 번씩 실제로 불러서 토큰과 검색 횟수를 받아
   공표 단가로 값을 매긴다. 캐시를 피하려고 매번 조금씩 다른 입력을 준다.

   실행: node scripts/spend-probe.mjs
         node scripts/spend-probe.mjs --only crawl,keyword   (일부만) */
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { ledger } from '../server/spend.mjs'

const BASE = process.env.AGENT_BASE || 'http://localhost:5188'
const ROOT = process.cwd()
const only = (() => {
  const i = process.argv.indexOf('--only')
  return i > 0 ? new Set(process.argv[i + 1].split(',')) : null
})()

/* 캐시 키에 섞여 들어갈 꼬리표 · 같은 프로브를 두 번 돌려도 실제 호출이 일어나게 한다 */
const TAG = process.argv.includes('--fresh') ? ` [측정 ${Date.now()}]` : ''

const DNA = {
  silhouette: '가는 밴드가 한 바퀴 돌다 끝에서 어긋난다', motif: '어긋난 이음매',
  surface: '무광 브러시드', stone: '없음', avoid: ['하트'],
}

/** 경로 하나 · 실제로 부르는 몸통 그대로 */
const CASES = [
  ['crawl', '/api/agent/competitor/crawl', {
    brand: 'Pandora', itemKo: '반지' + TAG, country: 'Korea', langName: 'Korean (한국어)',
    target: '30-34 · Women',
  }],
  ['shops', '/api/agent/shops', {
    region: 'Korea', itemKo: '반지' + TAG, langName: 'Korean (한국어)', target: '30-34 · Women',
  }],
  ['keyword', '/api/agent/keyword', {
    keyword: '제주 바다의 조수 간만' + TAG, country: 'Korea', langName: 'Korean (한국어)',
  }],
  ['refdna', '/api/agent/refdna', {
    refId: 'probe' + TAG, imageUrl: '', sourceUrl: '', context: '가는 밴드 반지 · 무광',
    langName: 'Korean (한국어)',
  }],
  ['prompts', '/api/agent/prompts', {
    mode: 'competitor', refId: 'probe' + TAG, variant: 'base', dna: DNA,
    trendCombo: ['무광'], itemEn: 'ring', itemKo: '반지', target: '30-34 · Women',
    country: 'Korea', langName: 'Korean (한국어)', brief: '실버 925. 4g 이하.',
  }],
  ['specfrom', '/api/agent/specfrom', {
    prompt: '925 실버. 무광. 스톤 없음. 가는 밴드 반지.' + TAG,
    itemKo: '반지', langName: 'Korean (한국어)',
  }],
  ['score', '/api/agent/score', {
    mode: 'competitor', target: '30-34 · Women', langName: 'Korean (한국어)',
    pairs: [{ id: 'D01', prompt: '925 실버 무광 반지, 가는 밴드' + TAG }],
  }],
]

const before = ledger(ROOT)
const t0 = Date.now()
const done = []

for (const [name, path, body] of CASES) {
  if (only && !only.has(name)) continue
  process.stdout.write(`${name.padEnd(10)} `)
  const t = Date.now()
  try {
    const r = await fetch(BASE + path, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(600_000),
    })
    const txt = await r.text()
    if (!r.ok) { console.log(`실패 ${r.status} ${txt.slice(0, 90)}`); continue }
    const cached = (() => { try { return !!JSON.parse(txt).cached } catch { return false } })()
    console.log(`${((Date.now() - t) / 1000).toFixed(0)}초${cached ? ' · 캐시(값 안 나감)' : ''}`)
    done.push(name)
  } catch (e) { console.log('실패 · ' + String(e.message).slice(0, 80)) }
}

// ── 장부에서 이번에 늘어난 만큼만 뽑는다 ───────────────────────────
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

console.log('\n' + '─'.repeat(78))
console.log(`${'경로'.padEnd(22)}${'호출'.padStart(5)}${'입력토큰'.padStart(11)}${'출력토큰'.padStart(11)}${'검색'.padStart(6)}${'초'.padStart(6)}${'달러'.padStart(9)}`)
for (const r of rows) {
  console.log(`${r.route.padEnd(22)}${String(r.calls).padStart(5)}${r.inTok.toLocaleString().padStart(11)}${r.outTok.toLocaleString().padStart(11)}${String(r.searches).padStart(6)}${String(Math.round(r.ms / 1000)).padStart(6)}${('$' + r.usd.toFixed(3)).padStart(9)}`)
}
const sum = rows.reduce((a, r) => a + r.usd, 0)
const srch = rows.reduce((a, r) => a + r.searches, 0)
console.log('─'.repeat(78))
console.log(`합계 $${sum.toFixed(3)} · 검색 ${srch}회 (검색 요금 $${(srch / 1000 * 10).toFixed(3)} = 전체의 ${sum ? Math.round(srch / 1000 * 10 / sum * 100) : 0}%)`)
console.log(`총 ${((Date.now() - t0) / 1000 / 60).toFixed(1)}분`)
writeFileSync('.personaqa/spend-probe.json', JSON.stringify({ rows, sum, at: new Date().toISOString() }, null, 1))
console.log('→ .personaqa/spend-probe.json')
