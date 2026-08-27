/* 이미 받아 둔 사양으로 원가만 다시 계산한다 (API 재호출 없음).
   원가 엔진을 고친 뒤 값이 어떻게 달라졌는지 보는 자리다.
   실행: npx tsx scripts/spec-recheck.mts */
import { readFileSync } from 'node:fs'
import { estimateCost } from '../src/core/cost'

const rows = JSON.parse(readFileSync('.personaqa/spec-probe.json', 'utf8'))
for (const r of rows) {
  if (r.error) { console.log(`실패 · ${r.item} · ${String(r.error).slice(0, 60)}`); continue }
  const c = estimateCost(r.spec)
  const b = r.cost, k = r.checks
  console.log(`${r.item.padEnd(6)} $${b.low.toFixed(1)}~${b.high.toFixed(1)} → $${c.low.toFixed(1)}~${c.high.toFixed(1)}   치수 ${k.dims} · 부속 ${k.findings} · 첫줄부속 ${k.findingInHead}`)
  const drop = (b.high - c.high).toFixed(1)
  if (Number(drop) !== 0) console.log(`        고친 뒤 상한이 $${drop} 내려갔다 (해당 없는 부속·스톤에 값이 붙던 것)`)
  console.log(`        내역: ${c.lines.map(l => `${l.label} $${l.usd.toFixed(1)}`).join(' · ')}`)
  if (k.dims < 3) console.log(`        치수가 적다: ${JSON.stringify(r.spec.dims)}`)
  if (k.findingInHead === false) {
    console.log(`        부속: ${(r.spec.findings ?? []).map((f: { name: string; spec: string }) => `${f.name}(${f.spec})`).join(', ')}`)
    console.log(`        첫두줄: ${String(r.head2).slice(0, 120)}`)
  }
}
