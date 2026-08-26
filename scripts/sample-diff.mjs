// ── 샘플 사이 차이 재기 ──────────────────────────────────────────────
// "결과가 서로 다르게 나오는가" 를 눈짐작 대신 수치로 본다.
//
//   node scripts/sample-diff.mjs
//   node scripts/sample-diff.mjs sample_competitor_ring sample_competitor_earrings
//
// 재는 것 (전부 자카드 겹침 · 0 이면 완전히 다름, 1 이면 똑같음)
//  · 트렌드 축 이름과 그 아래 라벨
//  · 레퍼런스 제목
//  · 디자인 프롬프트의 낱말
//
// 트렌드 축이 높게 나오는 것은 수렴이 아니다 — 축은 `ELEMENT_AXES` 로 고정된 분류라
// 어느 실행이든 같은 이름이 나온다. 갈리는지 봐야 할 곳은 그 **아래 라벨**과 프롬프트다.
// 판정도 프롬프트 겹침만 본다.
//
// 왜 이걸 두는가 · 같은 파이프라인이 입력만 바꿔도 같은 말을 뱉는 일이 흔하다.
// 그런 수렴은 화면만 봐서는 "비슷해 보인다" 정도로만 느껴지고 넘어가게 된다.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'src', 'samples')
if (!existsSync(DIR)) { console.log('src/samples 가 없습니다. 샘플을 먼저 구우세요.'); process.exit(0) }

const want = process.argv.slice(2)
const files = readdirSync(DIR).filter(f => f.endsWith('.json'))
  .filter(f => !want.length || want.includes(f.replace(/\.json$/, '')))
if (files.length < 2) { console.log(`견줄 샘플이 ${files.length}개뿐입니다. 두 개 이상 필요합니다.`); process.exit(0) }

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^가-힣a-z0-9\s]/g, ' ')
const words = (s) => new Set(norm(s).split(/\s+/).filter(w => w.length > 1))

/** 자카드 겹침 · 교집합 / 합집합 */
function overlap(a, b) {
  if (!a.size && !b.size) return null
  const inter = [...a].filter(x => b.has(x)).length
  return inter / (a.size + b.size - inter)
}

function featuresOf(file) {
  const st = JSON.parse(readFileSync(join(DIR, file), 'utf8'))
  const axes = new Set((st.trendReport?.elements ?? []).map(e => norm(e.axis).trim()))
  const labels = new Set((st.trendReport?.elements ?? []).flatMap(e => (e.trends ?? []).map(t => norm(t.label).trim())))
  const refs = new Set((st.references ?? []).map(r => norm(r.title).trim()))
  const prompts = words((st.pairs ?? []).map(p => p.prompt).join(' '))
  return {
    name: file.replace(/\.json$/, ''),
    mode: st.params?.mode, region: (st.params?.countries ?? [st.params?.country]).join('+'),
    item: st.params?.itemType, designs: (st.pairs ?? []).filter(p => p.versions?.length).length,
    axes, labels, refs, prompts,
  }
}

const F = files.map(featuresOf)

console.log('샘플')
for (const f of F) {
  console.log(`  ${f.name.padEnd(30)} ${String(f.mode).padEnd(11)} ${String(f.region).padEnd(15)} ${f.item ?? ''} · 디자인 ${f.designs}`)
}

const pct = (v) => v == null ? '  · ' : `${String(Math.round(v * 100)).padStart(3)}%`
console.log('\n짝별 겹침 (낮을수록 서로 다른 결과)')
console.log('  트렌드축은 고정 분류라 높게 나오는 것이 정상이다. 라벨과 프롬프트를 볼 것.')
console.log(`  ${''.padEnd(52)} 트렌드축  라벨   레퍼런스  프롬프트`)

// 같은 에이전트끼리의 겹침이 진짜 관심사다 · 유형이 다르면 당연히 다르다
const rows = []
for (let i = 0; i < F.length; i++) {
  for (let j = i + 1; j < F.length; j++) {
    const a = F[i], b = F[j]
    const r = {
      pair: `${a.name} ↔ ${b.name}`, same: a.mode === b.mode,
      axes: overlap(a.axes, b.axes), labels: overlap(a.labels, b.labels),
      refs: overlap(a.refs, b.refs), prompts: overlap(a.prompts, b.prompts),
    }
    rows.push(r)
    const tag = r.same ? '같은 에이전트' : '다른 에이전트'
    console.log(`  ${(r.pair + ' · ' + tag).slice(0, 52).padEnd(52)} ${pct(r.axes)}  ${pct(r.labels)}  ${pct(r.refs)}   ${pct(r.prompts)}`)
  }
}

// ── 판정 ─────────────────────────────────────────────────────────────
// 같은 에이전트를 다른 입력으로 돌렸는데 프롬프트 낱말이 절반 넘게 겹치면,
// 입력이 결과를 못 바꾸고 있다는 뜻이다. 주얼리 용어가 원래 겹치는 것을 감안해
// 문턱을 넉넉히 잡았다.
const SUSPECT = 0.55
const bad = rows.filter(r => r.same && r.prompts != null && r.prompts > SUSPECT)
console.log('\n' + '─'.repeat(74))
if (bad.length) {
  console.log(`수렴 의심 ${bad.length}건 · 같은 에이전트인데 프롬프트가 ${Math.round(SUSPECT * 100)}% 넘게 겹칩니다`)
  for (const r of bad) console.log(`   ${r.pair} · ${pct(r.prompts)}`)
  process.exit(1)
}
console.log(`통과 · 같은 에이전트끼리도 프롬프트 겹침이 ${Math.round(SUSPECT * 100)}% 아래입니다`)
