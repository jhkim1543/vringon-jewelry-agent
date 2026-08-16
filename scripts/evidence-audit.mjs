// 근거 감사 · 화면에 "출처"로 보이는 값이 실제로 이 실행이 모은 것인지 확인한다.
// 지어낸 주소 하나가 남아 있으면 리포트 전체의 신뢰가 무너지므로, 배포 전에 반드시 0 이어야 한다.
//   node scripts/evidence-audit.mjs [샘플...]
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'src', 'samples')
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => join(DIR, f))

// 근거인 척하는 주소들. 하나라도 남으면 실패다.
const FAKE = /example\.(com|org|net)|competitor\.example|observed\.example|supabase:\/\/|localhost|TODO|placeholder/i

let bad = 0
for (const file of files) {
  const st = JSON.parse(readFileSync(file, 'utf8'))
  const name = file.split(/[\/]/).pop()
  const designs = st.designs ?? []
  const comps = st.competitors ?? []
  const best = st.bestsellers ?? []
  const sigs = st.signals ?? []
  const collectedIds = new Set([...comps, ...best].map(p => p.product_id))

  let refs = 0, fake = 0, orphan = 0, unbacked = 0
  for (const d of designs) {
    for (const r of d.rationale?.reference_images ?? []) {
      refs++
      if (FAKE.test(r.source_url ?? '')) { fake++; console.log(`  FAKE  ${name} ${d.spec?.design_id} ${r.source_url}`) }
      // 경쟁사·베스트셀러 참조는 이 실행이 실제로 수집한 제품이어야 한다
      if ((r.source_type === 'competitor' || r.source_type === 'bestseller') && !collectedIds.has(r.ref_id)) {
        orphan++; console.log(`  ORPHAN ${name} ${d.spec?.design_id} ref_id=${r.ref_id} 은 수집 목록에 없음`)
      }
      // 빌렸다고 적은 속성이 그 제품에 실제로 있어야 한다
      const src = [...comps, ...best].find(p => p.product_id === r.ref_id)
      if (src) {
        const has = (src.design_traits ?? [])
        const missing = (r.borrowed_attributes ?? []).filter(a => !has.includes(a))
        if (missing.length) { unbacked++; console.log(`  UNBACKED ${name} ${d.spec?.design_id} ${missing.join(' | ')}`) }
      }
    }
  }
  // 신호 출처도 같은 기준으로 본다
  const fakeSig = sigs.filter(s => (s.sources ?? []).some(u => FAKE.test(u))).length
  if (fakeSig) console.log(`  FAKE-SIGNAL ${name} ${fakeSig}건`)

  const sourced = sigs.filter(s => (s.sources?.length ?? 0) > 0 || s.page_ref).length
  console.log(`${name.padEnd(34)} designs=${designs.length} refs=${refs} fake=${fake} orphan=${orphan} unbacked=${unbacked} signals=${sourced}/${sigs.length} sourced`)
  bad += fake + orphan + unbacked + fakeSig
}
console.log('-'.repeat(60))
console.log(bad === 0 ? '통과 · 지어낸 근거 0건' : `실패 · 지어낸/뒷받침 없는 근거 ${bad}건`)
process.exitCode = bad === 0 ? 0 : 1
