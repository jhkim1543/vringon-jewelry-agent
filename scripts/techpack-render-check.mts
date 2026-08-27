/* 테크팩 한 장이 실제로 무엇을 담는지 본다 · 브라우저 없이 HTML 을 뽑아 센다.
   "붙였다" 와 "화면에 값이 찍힌다" 는 다르다 — 사양이 비면 빈 표가 나가는데
   그것도 화면에는 멀쩡히 보인다.
   실행: npx tsx scripts/techpack-render-check.mts [sample_id ...] */
import { readFileSync, writeFileSync } from 'node:fs'
import { techPackDeckHtml } from '../src/core/agentDeck'
import { estimateCost, checkTarget } from '../src/core/cost'
import type { RunState } from '../src/core/types'

const ids = process.argv.slice(2).filter(a => !a.startsWith('-'))
const targets = ids.length ? ids
  : [...readFileSync('src/core/sampleRun.ts', 'utf8').matchAll(/'(sample_[a-z_]+)'/g)].map(m => m[1])

let total = 0, costed = 0, dimmed = 0, found = 0, verdicts = 0
for (const id of [...new Set(targets)]) {
  let st: RunState
  try { st = JSON.parse(readFileSync(`src/samples/${id}.json`, 'utf8')) } catch { continue }
  const deck = techPackDeckHtml(st)
  const withSpec = (st.pairs ?? []).filter(p => p.spec)
  if (!deck) { console.log(`${id.padEnd(28)} 테크팩 없음 (사양 붙은 디자인 0건 / 전체 ${st.pairs?.length ?? 0})`); continue }

  const target = st.params.collectionAdv?.priceTarget || st.params.direction
  let c = 0, d = 0, f = 0, v = 0
  for (const p of withSpec) {
    const e = estimateCost(p.spec)
    if (e.ok) c++
    if ((p.spec?.dims ?? []).length >= 3) d++
    if ((p.spec?.findings ?? []).length >= 1) f++
    if (checkTarget(e, target).verdict !== 'unknown') v++
  }
  total += withSpec.length; costed += c; dimmed += d; found += f; verdicts += v
  const slides = (deck.html.match(/<section class="slide">/g) ?? []).length
  console.log(`${id.padEnd(28)} 장 ${slides}  사양 ${withSpec.length}/${st.pairs.length}  원가 ${c}  치수3+ ${d}  부속 ${f}  목표판정 ${v}`)

  // 첫 장을 실제 파일로 남긴다 · 눈으로 볼 수 있어야 한다
  if (id === targets[0]) {
    const one = deck.html.slice(0, deck.html.indexOf('</section>') + 10)
    writeFileSync('.personaqa/techpack-sample.html',
      `<style>${readFileSync('src/core/deck.ts', 'utf8').split('export const DECK_CSS = `')[1].split('`')[0]}</style>${one}`)
  }
}
console.log('\n' + '─'.repeat(58))
console.log(`사양 붙은 디자인 ${total}건 · 원가 ${costed} · 치수 3개 이상 ${dimmed} · 부속 ${found} · 목표 판정 ${verdicts}`)
console.log('한 장 미리보기 · .personaqa/techpack-sample.html')
