// 조사 → 디자인 연결 감사
// "데이터를 많이 모았다"와 "그 데이터가 디자인을 바꿨다"는 다른 이야기다.
// 저장된 분석을 열어, 조사에서 나온 것이 실제 산출물에 도달했는지 항목별로 센다.
//   node scripts/audit-linkage.mjs [파일...]
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(join(ROOT, 'src', 'samples')).filter(f => /\.json$/.test(f) && f !== 'raw.json').map(f => join('src', 'samples', f))

const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '—'
const rows = []

for (const rel of files) {
  const st = JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'))
  const designs = st.designs ?? []
  const signals = st.signals ?? []
  const comps = st.competitors ?? []
  const best = st.bestsellers ?? []
  const prompts = designs.flatMap(d => d.images.map(i => i.promptUsed).filter(Boolean))

  // 1) 신호 키워드가 실제 프롬프트에 들어갔나
  const labels = signals.map(s => s.label).filter(Boolean)
  const inPrompt = labels.filter(l => prompts.some(p => p.includes(l)))

  // 2) 라인 프로필(금속·스톤·전문가 설정)이 프롬프트에 관통했나
  const line = st.params?.line
  const lineHits = { metal: 0, stone: 0, expert: 0 }
  if (line) {
    const metalWords = ['sterling silver', '14K', '18K', 'gold-filled', 'plated brass']
    const expertWords = ['micron', 'ct', 'VVS', 'VS', 'SI', 'akoya', 'freshwater', 'nickel-safe']
    for (const p of prompts) {
      if (/Material programme of this line/.test(p)) lineHits.metal++
      if (/stones:/.test(p)) lineHits.stone++
      if (expertWords.some(w => p.includes(w))) lineHits.expert++
    }
    void metalWords
  }

  // 3) 디자인이 자기 스케치에서 나왔나 (단계 분리가 실제로 작동했나)
  // 추가 뷰·컬러웨이는 기준 렌더를 편집해 만든다. 그 기준 렌더가 스케치에서 나왔다면
  // 그 뷰도 스케치에 닿아 있다 — 한 칸만 보지 말고 사슬을 끝까지 따라가야 한다.
  const sketchHashes = new Set(designs.flatMap(d => d.images.filter(i => /^sketch/.test(i.view)).map(i => i.hash)))
  const byHash = new Map(designs.flatMap(d => d.images).map(i => [i.hash, i]))
  const tracesToSketch = (img) => {
    let cur = img, hops = 0
    while (cur?.editedFrom && hops++ < 8) {
      if (sketchHashes.has(cur.editedFrom)) return true
      cur = byHash.get(cur.editedFrom)
    }
    return false
  }
  const colorTotal = designs.flatMap(d => d.images.filter(i => !/^sketch/.test(i.view) && i.view !== 'wear' && i.view !== 'concept'))
  const colorFromSketch = colorTotal.filter(tracesToSketch)

  // 4) 근거 체인 · driving_signals가 실존 신호를 가리키나
  const sigIds = new Set(signals.map(s => s.signal_id))
  const drivers = designs.flatMap(d => d.rationale?.driving_signals ?? [])
  const validDrivers = drivers.filter(x => sigIds.has(x.signal_id))

  // 5) 조사 데이터 자체의 실속
  const pricedComps = comps.filter(c => c.price_krw > 0)
  const sourcedSignals = signals.filter(s => (s.sources ?? []).length > 0)
  const photo = [...comps, ...best].filter(p => (p.image_urls?.[0] ?? '').startsWith('/samples/'))

  rows.push({
    file: rel.split(/[\\/]/).pop().replace('.json', ''),
    stage: st.params?.endStage,
    '신호→프롬프트': `${inPrompt.length}/${labels.length} ${pct(inPrompt.length, labels.length)}`,
    '라인→프롬프트': `${lineHits.metal}/${prompts.length} ${pct(lineHits.metal, prompts.length)}`,
    '전문가값→프롬프트': `${lineHits.expert}/${prompts.length} ${pct(lineHits.expert, prompts.length)}`,
    '디자인←스케치': `${colorFromSketch.length}/${colorTotal.length} ${pct(colorFromSketch.length, colorTotal.length)}`,
    '근거체인 유효': `${validDrivers.length}/${drivers.length} ${pct(validDrivers.length, drivers.length)}`,
    '경쟁가격 확보': `${pricedComps.length}/${comps.length} ${pct(pricedComps.length, comps.length)}`,
    '신호 출처보유': `${sourcedSignals.length}/${signals.length} ${pct(sourcedSignals.length, signals.length)}`,
    '제품사진': `${photo.length}/${comps.length + best.length} ${pct(photo.length, comps.length + best.length)}`,
    '베스트셀러': best.length,
    '리포트': st.trendReport ? 'yes' : 'no',
    '도시에': st.dossier ? 'yes' : 'no',
  })
}

for (const r of rows) {
  console.log(`\n── ${r.file} (${r.stage})`)
  for (const [k, v] of Object.entries(r)) {
    if (k === 'file' || k === 'stage') continue
    console.log(`   ${k.padEnd(20)} ${v}`)
  }
}
