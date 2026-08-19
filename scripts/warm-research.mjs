// 조사 캐시 미리 채우기 · 브라우저가 긴 요청을 들고 있으면 창이 숨겨졌을 때 끊긴다.
// 파이프라인이 보내는 것과 "똑같은" 본문을 만들어 서버에서 먼저 돌려 둔다.
//   npx tsx scripts/warm-research.mjs <샘플.json> [--go]
import { readFileSync } from 'node:fs'
import { CAT_LABEL, TYPE_LABEL, metalProgramOf, stoneProgramOf } from '../src/core/types.ts'

const file = process.argv[2]
const GO = process.argv.includes('--go')
if (!file) { console.error('샘플 파일을 주세요'); process.exit(1) }
const st = JSON.parse(readFileSync(file, 'utf8'))
const p = st.params
const catKo = CAT_LABEL[p.category]
const typeKo = TYPE_LABEL[p.itemType] ?? p.itemType
const lineMetal = p.line ? metalProgramOf(p.line) : ''
const lineStone = p.line ? stoneProgramOf(p.line) : ''
const lang = p.researchLang ?? 'ko'
const langName = { en: 'English', ko: 'Korean (한국어)', ja: 'Japanese (日本語)' }[lang]
const BASE = 'http://localhost:5191'
// Node 내장 fetch 는 헤더 대기 300초에서 끊는다(\"fetch failed\"). 조사는 그보다 오래 걸린다.
// 서버(research-api.mjs)는 이미 undici Agent 로 늘려 두었는데, 스크립트 쪽이 그대로였다.
let longFetch = globalThis.fetch
try {
  const { Agent, fetch: undiciFetch } = await import('undici')
  const agent = new Agent({ headersTimeout: 45 * 60_000, bodyTimeout: 45 * 60_000, connectTimeout: 30_000 })
  longFetch = (url, init = {}) => undiciFetch(url, { ...init, dispatcher: agent })
} catch { /* undici 가 없으면 내장 fetch 로 간다 */ }


const jobs = []
if (p.mode === 'trend') {
  const band = `KRW ${(p.trend.priceMinKrw / 10000).toFixed(0)}0k-${(p.trend.priceMaxKrw / 10000).toFixed(0)}0k ${p.trend.priceBand}`
  jobs.push(['/api/research/competitors', { metalProgram: lineMetal, stoneProgram: lineStone, brands: p.trend.competitors, categoryKo: catKo, typeKo, priceMin: p.trend.priceMinKrw, priceMax: p.trend.priceMaxKrw }])
  jobs.push(['/api/research/trends', { metalProgram: lineMetal, stoneProgram: lineStone, categoryKo: catKo, typeKo, season: '2026 F/W', brands: p.trend.competitors, priceBandKo: band, wantReport: false }])
  jobs.push(['/api/research/dossier', { metalProgram: lineMetal, stoneProgram: lineStone, categoryEn: catKo, season: 'FW26', priceBand: band, brands: p.trend.competitors }])
} else if (p.mode === 'series') {
  jobs.push(['/api/series/dna', { uploads: p.series.archiveFiles, valueStatement: p.series.valueStatement, categoryKo: catKo, typeKo }])
  if (p.series.trendSearch) {
    jobs.push(['/api/research/trends', { metalProgram: lineMetal, stoneProgram: lineStone, categoryKo: catKo, typeKo, season: '2026 F/W', wantReport: false }])
    jobs.push(['/api/research/dossier', { metalProgram: lineMetal, stoneProgram: lineStone, categoryEn: catKo, season: 'FW26', brands: [] }])
  }
} else {
  jobs.push(['/api/moodboard/read', { uploads: p.moodboard.files, notes: p.moodboard.notes ?? '', categoryKo: catKo, typeKo }])
}

console.log(`${file.split(/[\/]/).pop()}  mode=${p.mode}  type=${typeKo}`)
console.log(`  metal="${lineMetal}"  stone="${lineStone}"  lang=${langName}`)
for (const [path, body] of jobs) {
  const payload = JSON.stringify({ ...body, lang, langName })
  // 먼저 짧게 찔러 캐시 여부만 본다
  const probe = await longFetch(BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
    signal: AbortSignal.timeout(30000),
  }).then(r => r.json()).catch(() => null)
  if (probe && !probe.error) { console.log(`  ${path.padEnd(28)} HIT (cached=${!!probe.cached})`); continue }
  if (!GO) { console.log(`  ${path.padEnd(28)} MISS · --go 를 붙이면 지금 채웁니다`); continue }
  console.log(`  ${path.padEnd(28)} MISS · 계산 시작 (수 분)`)
  const t0 = Date.now()
  try {
    const r = await longFetch(BASE + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
      signal: AbortSignal.timeout(45 * 60_000),
    })
    const j = await r.json()
    console.log(`  ${path.padEnd(28)} ${j.error ? 'ERR ' + String(j.error).slice(0, 90) : 'OK'} (${Math.round((Date.now() - t0) / 1000)}s)`)
  } catch (e) {
    console.log(`  ${path.padEnd(28)} FAIL ${String(e.message).slice(0, 90)} (${Math.round((Date.now() - t0) / 1000)}s)`)
  }
}
