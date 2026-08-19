// 모드 목표 대비 감사 · 세 모드는 "무엇을 근거로 삼는가"가 서로 다르다.
// 그 계약을 어긴 산출물은 기능이 도는 것처럼 보여도 틀린 결과다.
//
//   트렌드   경쟁사 + 시장 조사가 근거. 외부 조사가 최대인 모드.
//   시리즈   올린 시리즈가 근거. 트렌드는 보조. 경쟁사 조사는 하지 않는다.
//   무드보드 올린 파일만 근거. 외부 조사를 하지 않는다.
//
//   node scripts/mode-audit.mjs [샘플...]
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'src', 'samples')
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => join(DIR, f))

let problems = 0
const fail = (m) => { problems++; console.log(`   ✗ ${m}`) }
const ok = (m) => console.log(`   ✓ ${m}`)
const note = (m) => console.log(`   · ${m}`)

for (const file of files) {
  const st = JSON.parse(readFileSync(file, 'utf8'))
  const name = file.split(/[\\/]/).pop()
  const p = st.params ?? {}
  const mode = p.mode
  const designs = st.designs ?? []
  const alive = designs.filter(d => !d.rejected)
  const sigs = st.signals ?? []
  const refs = designs.flatMap(d => d.rationale?.reference_images ?? [])
  const end = p.endStage

  console.log(`\n── ${name}  [${mode}]  ${p.itemType} · ${end} · designs ${designs.length}`)

  // ── 모드 공통 계약 ───────────────────────────────────────────────
  if (!designs.length && end !== 'S1') fail('디자인이 하나도 없다')
  if (alive.length && designs.filter(d => d.recipe).length < alive.length)
    fail(`레시피 미배정 ${alive.length - designs.filter(d => d.recipe).length}건 · 같은 방향으로 수렴한다`)
  else if (alive.length) ok(`레시피 ${designs.filter(d => d.recipe).length}건 전부 배정`)

  const titles = new Set(designs.filter(d => d.recipe).map(d => d.recipe.title))
  if (titles.size && titles.size < alive.length)
    fail(`레시피 조합이 겹친다 (${titles.size}/${alive.length} 고유)`)
  else if (titles.size) ok(`레시피 조합 ${titles.size}개 전부 다름`)

  const qa = designs.flatMap(d => d.qa ?? [])
  if (alive.length && !qa.length) fail('비전 QA 결과가 없다')
  else if (qa.length) {
    const u = qa.filter(q => q.status === 'unknown').length
    ok(`QA ${qa.filter(q => q.status === 'pass').length}통과 / ${qa.filter(q => q.status === 'fail').length}실패 / ${u}미확인`)
    if (qa.some(q => !q.status)) fail('status 없는 QA 항목이 있다 (옛 난수 QA 잔재)')
  }

  // 선정 단계까지 갔으면 MD 가 있어야 한다
  const stageIdx = ['S1', 'S2', 'S3', 'S4', 'S5'].indexOf(end)
  const md = designs.filter(d => d.mdReview).length
  if (stageIdx >= 3) {
    if (p.brand?.md?.role && !md) fail('MD 페르소나가 설정됐는데 리뷰가 하나도 없다')
    else if (md) ok(`MD 리뷰 ${md}건${st.mdPickRationale ? ' + 총평' : ' (총평 없음)'}`)
  } else if (p.brand?.md?.role) {
    note(`MD 리뷰는 선정(S4) 단계 기능이라 ${end} 샘플에는 없다`)
  }

  // ── 모드별 계약 ─────────────────────────────────────────────────
  if (mode === 'trend') {
    if (!(st.competitors ?? []).length) fail('경쟁사 조사 결과가 없다 (트렌드의 핵심)')
    else ok(`경쟁 제품 ${st.competitors.length}건`)
    if (!(st.bestsellers ?? []).length) note('백화점 베스트셀러 0건 · 표기된 순위를 못 찾은 경우일 수 있다')
    else ok(`베스트셀러 ${st.bestsellers.length}건`)
    if (!st.dossier) fail('시즌 도시에가 없다')
    else ok(`도시에 매크로 ${(st.dossier.macrotrends ?? []).length}개`)
    if (!st.trendReport) note('트렌드 리포트 없음')
    const sourced = sigs.filter(s => (s.sources ?? []).length).length
    if (sigs.length && sourced === 0) fail('신호에 출처가 하나도 없다 · 샘플 폴백으로 보인다')
    else if (sigs.length) ok(`신호 ${sigs.length}건 중 ${sourced}건이 출처 보유`)
    if (!refs.length) fail('근거 참조가 0건 · 조사한 제품이 디자인에 닿지 않았다')
    else ok(`근거 참조 ${refs.length}건`)
  }

  if (mode === 'series') {
    if ((st.competitors ?? []).length) fail('시리즈 모드인데 경쟁사 목록이 있다 (조사 범위 위반)')
    else ok('경쟁사 조사 없음 (계약대로)')
    if (!st.seriesDna) fail('시리즈 DNA 판독 결과가 없다 (이 모드의 핵심)')
    else ok(`DNA 불변 ${(st.seriesDna.invariant ?? []).length} / 가변 ${(st.seriesDna.variable ?? []).length}`)
    if (!st.dnaConflict) fail('가치 문장 대조 결과가 없다')
    else ok('가치 문장과 관측 대조 있음')
    const locked = designs.filter(d => (d.spec?.fieldsLocked ?? []).length).length
    if (alive.length && !locked) fail('DNA 잠금이 스펙에 걸리지 않았다')
    else if (locked) ok(`DNA 잠금 적용 ${locked}건`)
    const arch = refs.filter(r => r.source_type === 'archive').length
    if (!arch) fail('올린 시리즈가 근거로 인용되지 않았다')
    else ok(`업로드 근거 ${arch}건`)
    // 올린 것과 만들려는 품목이 어긋나면 판독이 헛돈다
    const seen = String(st.seriesDna?.observed_summary ?? '') + (st.logs ?? []).map(l => l.text).join(' ')
    note(`품목 ${p.itemType} · 판독 요약에서 확인할 것`)
  }

  if (mode === 'moodboard') {
    if ((st.competitors ?? []).length) fail('무드보드 모드인데 경쟁사 목록이 있다 (외부 조사 금지)')
    else ok('외부 조사 없음 (계약대로)')
    if (st.dossier) fail('무드보드 모드인데 시즌 도시에가 있다 (외부 조사 금지)')
    else ok('도시에 없음 (계약대로)')
    const withPage = sigs.filter(s => s.page_ref).length
    if (!sigs.length) fail('신호가 없다')
    else if (withPage < sigs.length) fail(`쪽 근거 없는 신호 ${sigs.length - withPage}건 · 문서에서 왔다고 말할 수 없다`)
    else ok(`신호 ${sigs.length}건 전부 쪽 근거 보유`)
    const docRefs = refs.filter(r => r.source_type === 'trend_report').length
    if (!docRefs) fail('올린 문서가 근거로 인용되지 않았다')
    else ok(`문서 근거 ${docRefs}건`)
    const ups = (p.moodboard?.files ?? [])
    if (ups.some(u => typeof u === 'object' && !u.url)) fail('업로드에 주소가 없다 · 인용해도 열 수 없다')
  }

  // ── 지어낸 근거 ─────────────────────────────────────────────────
  const FAKE = /example\.(com|org|net)|supabase:\/\/|observed\.example/i
  const fakeRefs = refs.filter(r => FAKE.test(r.source_url ?? '')).length
  const fakeSigs = sigs.filter(s => (s.sources ?? []).some(u => FAKE.test(u))).length
  if (fakeRefs || fakeSigs) fail(`지어낸 출처 ${fakeRefs + fakeSigs}건`)
  else ok('지어낸 출처 없음')
}

console.log('\n' + '─'.repeat(58))
console.log(problems === 0 ? '통과 · 모드 계약 위반 0건' : `문제 ${problems}건`)
process.exitCode = problems === 0 ? 0 : 1
