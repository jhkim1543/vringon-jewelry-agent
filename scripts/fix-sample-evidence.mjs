// 배포 샘플의 근거 복구 · 지어낸 참조를 지우고, 그 실행이 실제로 모은 것으로만 다시 세운다.
// 이 샘플들은 레시피가 생기기 전에 구워졌다. 그래서 "레시피가 이 제품을 썼다"고는 말할 수 없고,
// 말할 수 있는 것은 "이 디자인을 끈 신호가 이 제품에서도 관측된다"이다. 그대로만 적는다.
//   node scripts/fix-sample-evidence.mjs [--go]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const GO = process.argv.includes('--go')
const DIR = join(process.cwd(), 'src', 'samples')

/** 신호가 그 제품에서도 보이는가.
 *  조사 언어에 따라 label 은 한글이고 attribute 는 영문 snake_case 다. 둘 다 본다.
 *  한글 토큰은 2자, 영문은 4자부터 센다 — 그보다 짧으면 우연히 겹친다. */
function tokens(signal) {
  const out = new Set()
  for (const w of String(signal.label ?? '').split(/[^0-9A-Za-z가-힣]+/))
    if (/[가-힣]/.test(w) ? w.length >= 2 : w.length >= 4) out.add(w.toLowerCase())
  for (const w of String(signal.attribute ?? '').split('_')) if (w.length >= 4) out.add(w.toLowerCase())
  return [...out]
}
/** 몇 개의 토큰이 그 제품 설명에서 실제로 확인되는가 */
function hitCount(signal, product) {
  const hay = [...(product.design_traits ?? []), product.name ?? ''].join(' ').toLowerCase()
  return tokens(signal).filter(w => hay.includes(w)).length
}

for (const file of readdirSync(DIR).filter(f => f.endsWith('.json'))) {
  const path = join(DIR, file)
  const st = JSON.parse(readFileSync(path, 'utf8'))
  const comps = (st.competitors ?? []).filter(c => c.product_url || c.source_urls?.length)
  const best = (st.bestsellers ?? []).filter(c => c.product_url || c.source_urls?.length)
  const sigs = st.signals ?? []
  const collectedAt = st.dossier?.collected_at || (st.savedAtISO ?? '').slice(0, 10) || '2026-08-08'
  let rebuilt = 0, emptied = 0

  for (const d of st.designs ?? []) {
    const linked = (d.rationale?.driving_signals ?? [])
      .map(ds => sigs.find(s => s.signal_id === ds.signal_id)).filter(Boolean)
    const refs = []
    for (const { p, kind } of [...comps.map(p => ({ p, kind: 'competitor' })), ...best.map(p => ({ p, kind: 'bestseller' }))]) {
      const hit = linked.filter(s => hitCount(s, p) >= 1).sort((a, b) => hitCount(b, p) - hitCount(a, p))
      if (!hit.length) continue
      refs.push({
        ref_id: p.product_id,
        source_type: kind,
        source_url: p.product_url || p.source_urls[0],
        collected_at: p.collected_at || collectedAt,
        // 그 제품에서 실제로 확인되는 특징만 적는다
        borrowed_attributes: (p.design_traits ?? []).filter(tr =>
          hit.some(s => tokens(s).some(w => tr.toLowerCase().includes(w)))),
        usage: 'attribute_only',
        label: `${p.brand} ${p.name}`,
        linked_via: `Signal ${hit[0].signal_id}, also observed on this product`,
      })
      if (refs.length >= 3) break
    }
    const note = refs.length
      ? `Attributes were read from ${refs.map(r => r.label).join(', ')}, collected ${refs[0].collected_at}. The photographs were never fed into generation.`
      : 'No collected product carries the signals behind this design, so no product reference is claimed.'
    // 옛 근거 문장(지어낸 날짜가 박힌 줄)을 걷어내고 새 문장을 붙인다
    const narrative = (d.rationale?.narrative ?? []).filter(n => !/References were used for attributes only/.test(n))
    d.rationale = { ...d.rationale, reference_images: refs, narrative: [...narrative, note] }
    refs.length ? rebuilt++ : emptied++
  }
  console.log(`${file.padEnd(34)} rebuilt=${rebuilt} emptied=${emptied} pool=${comps.length + best.length}`)
  if (GO) writeFileSync(path, JSON.stringify(st, null, 1))
}
console.log(GO ? '기록했습니다.' : '미리보기입니다. 적용하려면 --go 를 붙이세요.')
