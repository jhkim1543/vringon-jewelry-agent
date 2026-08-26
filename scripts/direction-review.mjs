// ── 샘플들의 조사 방향 반영도 심사 ───────────────────────────────────
//
//   node scripts/direction-review.mjs
//
// 구운 샘플 중 방향이 있는 것(경쟁사·패션)을 Gemini 에게 심사시킨다.
// 점수·반영 근거·놓친 것·프롬프트 개선안을 출력한다. 개선안을 반영하면
// server/agents-api.mjs 의 agr 캐시 버전을 올릴 것.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reviewDirection } from '../server/direction-review.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'src', 'samples')
if (!existsSync(DIR)) { console.log('샘플 없음'); process.exit(0) }

const files = readdirSync(DIR).filter(f => f.endsWith('.json'))
let worst = 10
for (const f of files) {
  const st = JSON.parse(readFileSync(join(DIR, f), 'utf8'))
  if (!st.trendReport || !st.params?.direction) continue
  process.stdout.write(`\n══ ${f}\n   방향: ${st.params.direction}\n   심사 중 ... `)
  try {
    const r = await reviewDirection({
      direction: st.params.direction,
      itemKo: st.params.itemType,
      regions: (st.params.countries ?? [st.params.country]).join(', '),
      report: st.trendReport,
    })
    worst = Math.min(worst, r.reflection_score)
    console.log(`반영도 ${r.reflection_score}/10`)
    for (const x of r.reflected ?? []) console.log('   반영:', x)
    for (const x of r.missed ?? []) console.log('   놓침:', x)
    console.log('   정직성:', r.off_direction_honesty)
    for (const x of r.prompt_improvements ?? []) console.log('   개선안:', x)
  } catch (e) {
    console.log('실패:', String(e.message).slice(0, 140))
  }
}
console.log('\n' + '─'.repeat(58))
console.log(worst >= 7 ? `통과 · 최저 반영도 ${worst}/10` : `주의 · 최저 반영도 ${worst}/10 — 개선안을 검토할 것`)
