// 룰 리젝트율 측정 · 룰을 늘릴 때 생성 범위도 같이 옮겨야 하는지 판단하는 근거.
// 룰만 조이면 모든 런이 리젝트 투성이가 되고, 사용자는 이유도 모른 채 빈 보드를 본다.
//   node scripts/reject-rate.mjs [반복수]
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const N = Number(process.argv[2] ?? 400)
const dir = mkdtempSync(join(tmpdir(), 'rejrate-'))
const entry = join(dir, 'run.ts')
writeFileSync(entry, `
import { PACKS, resetSeq, tierCapRule } from '${process.cwd().replace(/\\/g, '/')}/src/core/packs'
import { makeRng } from '${process.cwd().replace(/\\/g, '/')}/src/core/rng'
const pack = PACKS.jewelry
const tiers = ['core', 'push', 'signature'] as const
const out: Record<string, { total: number; rejected: number; byRule: Record<string, number> }> = {}
for (const type of pack.types) {
  out[type] = { total: 0, rejected: 0, byRule: {} }
  for (let i = 0; i < ${N}; i++) {
    const rng = makeRng(i * 7919 + type.length)
    resetSeq()
    const tier = tiers[i % 3]
    const spec = pack.generateSpec(rng, tier, type, JSON.parse(process.env.LOCK ?? '{}'))
    const cost = pack.costModel(spec, rng)
    const rr = [...pack.rules(spec), ...tierCapRule(spec, cost)]
    out[type].total++
    const fails = rr.filter(r => r.severity === 'fail')
    if (fails.length) out[type].rejected++
    for (const r of fails) out[type].byRule[r.rule] = (out[type].byRule[r.rule] ?? 0) + 1
  }
}
let gT = 0, gR = 0
const allRules: Record<string, number> = {}
for (const [type, v] of Object.entries(out)) {
  gT += v.total; gR += v.rejected
  for (const [k, n] of Object.entries(v.byRule)) allRules[k] = (allRules[k] ?? 0) + n
  const pct = ((v.rejected / v.total) * 100).toFixed(0)
  const worst = Object.entries(v.byRule).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => k + ':' + n).join(' ')
  console.log(type.padEnd(16), (pct + '%').padStart(5), ' ', worst)
}
console.log('-'.repeat(52))
console.log('TOTAL'.padEnd(16), (((gR / gT) * 100).toFixed(1) + '%').padStart(5))
console.log('rule hits:', Object.entries(allRules).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + '=' + n).join(' '))
`)
try {
  const r = execSync(`npx tsx "${entry}"`, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  console.log(r)
} catch (e) {
  console.error(String(e.stdout || '') + String(e.stderr || e.message))
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
