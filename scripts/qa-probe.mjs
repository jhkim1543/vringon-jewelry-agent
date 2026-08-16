// 비전 QA 채점 계층 확인 · 모델 응답을 통과/실패/미확인으로 바꾸는 규칙이 맞게 도는지 본다.
// 서버 응답 자체가 아니라 "우리 코드가 그것을 어떻게 읽는가"를 검사한다.
//   node scripts/qa-probe.mjs <응답.json> [--lie]
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = process.cwd().split(String.fromCharCode(92)).join('/')
const readFile = process.argv[2]
const lie = process.argv.includes('--lie')
const read = JSON.parse(readFileSync(readFile, 'utf8'))
const dir = mkdtempSync(join(tmpdir(), 'qaprobe-'))
const entry = join(dir, 'p.ts')
writeFileSync(entry, `
import { qaChecksFor, gradeQa, qaUnavailable } from '${root}/src/core/visionQa'
import type { DesignSpec } from '${root}/src/core/types'
const spec: DesignSpec = {
  design_id: 'JW-26FW-C01', tier: 'core', category: 'jewelry', itemType: 'hoop',
  fields: { metal: '925 silver', plating: '${lie ? 'none' : '18k gold'}', target_weight_g: 1.8,
    stone_count: ${lie ? 1 : 4}, stone_size_mm: 3.5, setting_type: '${lie ? 'bezel' : 'prong'}', prong_count: 6,
    min_wall_thickness_mm: 1.06, chain_type: 'none', finish: '${lie ? 'polished' : 'matte'}',
    is_pair: ${lie ? false : true}, is_new_mold: false, existing_mold_id: 'MLD-2024-17' } as any,
  fieldsLocked: [],
}
const read = ${JSON.stringify(read)} as any
const defs = qaChecksFor(spec, null, 'render', 3)
const out = gradeQa(defs, read)
for (const q of out) console.log((q.status ?? '?').padEnd(8), q.check.padEnd(32), 'target=' + q.target.slice(0, 26).padEnd(28), 'observed=' + q.observed.slice(0, 34))
console.log('---')
console.log('pass=' + out.filter(q => q.status === 'pass').length,
            'fail=' + out.filter(q => q.status === 'fail').length,
            'unknown=' + out.filter(q => q.status === 'unknown').length)
const un = qaUnavailable(defs, 'the check could not run')
console.log('degrade: entries=' + un.length, 'allUnknown=' + un.every(q => q.status === 'unknown'), 'anyPass=' + un.some(q => q.pass))
`)
try { console.log(execSync(`npx tsx "${entry}"`, { encoding: 'utf8' })) }
catch (e) { console.error(String(e.stdout||'')+String(e.stderr||e.message)); process.exitCode = 1 }
finally { rmSync(dir, { recursive: true, force: true }) }
