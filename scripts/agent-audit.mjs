// ── 에이전트 샘플 계약 감사 ──────────────────────────────────────────
// src/samples/*.json 의 완료 실행이 3-에이전트 스펙의 계약을 지키는지 본다.
//
//   node scripts/agent-audit.mjs
//
// 계약:
//  · 모든 레퍼런스에는 슬롯·선정 이유·트렌드 조합·출처가 있다
//  · 디자인 쌍 수 = 계획 수량 (실패는 error 로 표시돼 있어야 한다)
//  · 쌍마다 프롬프트가 있고, 성공한 쌍에는 이미지 버전이 있다
//  · 지어낸 출처 금지 · example.com 류 주소가 하나라도 있으면 실패
//  · 경쟁사 모드: 편집샵 항목의 rank_basis 는 official_best / exposure 뿐
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'src', 'samples')
const FAKE = /example\.(com|org|net)|placeholder|lorem/i

if (!existsSync(DIR) || !readdirSync(DIR).some(f => f.endsWith('.json'))) {
  console.log('샘플 없음 · 계약 검사를 건너뜁니다 (샘플을 구우면 자동으로 검사됩니다)')
  process.exit(0)
}

let bad = 0
const fail = (name, why) => { console.log(`   ✗ ${name} · ${why}`); bad++ }
const ok = (msg) => console.log(`   ✓ ${msg}`)

for (const f of readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const st = JSON.parse(readFileSync(join(DIR, f), 'utf8'))
  console.log(`── ${f}  [${st.params?.mode}] · ${(st.params?.countries ?? [st.params?.country]).join('+')} · pairs ${st.pairs?.length ?? 0}`)
  if (st.algo !== 2) { fail(f, 'algo 표식 없음 — 옛 파이프라인 산출물'); continue }

  // 레퍼런스 계약 (컬렉션은 세트가 그 자리)
  if (st.params.mode !== 'collection') {
    const refs = st.references ?? []
    if (refs.length !== 10) fail(f, `레퍼런스 ${refs.length}개 (10개 계약)`)
    const noReason = refs.filter(r => !r.reason || r.reason.length < 20).length
    const noSource = refs.filter(r => !r.sourceUrl).length
    const noCombo = refs.filter(r => !r.trendCombo?.length).length
    if (noReason) fail(f, `선정 이유 부실 ${noReason}건`)
    if (noSource) fail(f, `출처 없는 레퍼런스 ${noSource}건`)
    if (noCombo) fail(f, `트렌드 조합 없는 레퍼런스 ${noCombo}건`)
    if (!noReason && !noSource && !noCombo && refs.length === 10) ok('레퍼런스 10개 · 이유·출처·조합 완비')
  } else {
    const sets = st.sets ?? []
    if (sets.length !== st.params.setCount) fail(f, `세트 ${sets.length} (계약 ${st.params.setCount})`)
    const noDna = sets.filter(s => (s.design_dna?.length ?? 0) < 4).length
    if (noDna) fail(f, `Design DNA 부실 세트 ${noDna}`)
    else ok(`세트 ${sets.length} · DNA 완비`)
  }

  // 쌍 계약
  const planned = st.params.mode === 'collection'
    ? st.params.setCount * st.params.items.length
    : st.params.designCount
  const pairs = st.pairs ?? []
  if (pairs.length !== planned) fail(f, `쌍 ${pairs.length} (계약 ${planned})`)
  const okPairs = pairs.filter(p => p.versions?.length > 0)
  const failed = pairs.filter(p => p.error)
  const silent = pairs.filter(p => !p.versions?.length && !p.error)
  if (silent.length) fail(f, `이미지도 오류도 없는 쌍 ${silent.length} — 조용한 실패`)
  const noPrompt = okPairs.filter(p => !p.prompt || p.prompt.length < 60).length
  if (noPrompt) fail(f, `프롬프트 부실 ${noPrompt}건`)
  if (!silent.length && !noPrompt) ok(`쌍 ${okPairs.length} 성공 / ${failed.length} 실패 표기 · 프롬프트 완비`)

  // 레퍼런스 사진을 실제로 읽었는가.
  // 못 읽으면 DNA 가 설명글에서만 나오고, 디자인이 서로 수렴한다.
  // 한 장도 못 읽은 적이 있었는데(사진 취득 함수가 언제나 null 을 주던 버그)
  // 화면에는 "이미지 미확인" 이라고만 찍혀서 사이트가 막은 것처럼 보였다.
  if (st.params.mode !== 'collection') {
    const refs = st.references ?? []
    const withPhoto = refs.filter(r => r.shot || r.imageUrl).length
    if (refs.length && withPhoto === 0) fail(f, '레퍼런스 사진 0장 — 사진 취득 경로가 죽었을 수 있다')
    else if (refs.length && withPhoto < refs.length / 2) fail(f, `레퍼런스 사진 ${withPhoto}/${refs.length} — 절반도 못 읽었다`)
    else if (refs.length) ok(`레퍼런스 사진 ${withPhoto}/${refs.length}`)
  }

  // 지어낸 출처
  const raw = JSON.stringify(st)
  if (FAKE.test(raw)) fail(f, '가짜 주소 흔적 (example.com 류)')
  else ok('지어낸 출처 없음')

  // 편집샵 순위 근거
  if (st.params.mode === 'competitor') {
    const badBasis = (st.shops ?? []).flatMap(s => s.items).filter(i => !['official_best', 'exposure'].includes(i.rankBasis)).length
    if (badBasis) fail(f, `순위 근거 불명 ${badBasis}건`)
    else ok('편집샵 순위 근거 전부 표기됨')
  }
}

console.log('\n' + '─'.repeat(58))
console.log(bad === 0 ? '통과 · 계약 위반 0건' : `실패 · 위반 ${bad}건`)
process.exit(bad === 0 ? 0 : 1)
