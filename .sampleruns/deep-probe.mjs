const { Agent, fetch } = await import('undici')
const agent = new Agent({ headersTimeout: 40 * 60_000, bodyTimeout: 40 * 60_000 })
const t0 = Date.now()
const r = await fetch('http://localhost:5191/api/agent/trendreport', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, dispatcher: agent,
  body: JSON.stringify({
    mode: 'fashion', itemKo: '반지', country: 'Korea', langName: 'Korean (한국어)',
    direction: '무광 실버와 조각적 형태. 데일리 착용 중심.', target: '25-34 · Women', depth: 4,
  }),
})
const sec = ((Date.now() - t0) / 1000).toFixed(0)
const j = await r.json()
if (j.error) { console.log('DEEP-FAIL:', String(j.error).slice(0, 220)); process.exit(1) }
console.log(`DEEP-OK ${sec}초 · 캐시=${j.cached}`)
console.log('헤드라인:', (j.headline ?? '').slice(0, 70))
console.log('축', (j.elements ?? []).length, '· 출처', (j.sources ?? []).length, '· 검색', j.searches)
console.log('무광/매트:', (JSON.stringify(j).match(/무광|매트/g) || []).length, '회')
