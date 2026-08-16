// 샘플의 비전 QA 복구 · 지어낸 통과 표시를 실제 판독으로 바꾼다.
// 안 하면 정직성 구멍이 파이프라인에서 데모로 옮겨갈 뿐이다. 배포 데모가 여전히
// 존재하지 않는 유사도 0.88 을 초록으로 보여주게 된다.
//   node scripts/backfill-qa.mjs [--go] [샘플파일]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const GO = process.argv.includes('--go')
const only = process.argv.slice(2).find(a => a.endsWith('.json'))
const ROOT = process.cwd()
const DIR = join(ROOT, 'src', 'samples')

// .env 를 직접 읽는다 (다른 스크립트와 같은 방식) · 키는 여기서만 쓰고 저장하지 않는다
const env = {}
if (existsSync(join(ROOT, '.env'))) {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const KEY = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY
if (!KEY) { console.error('OPENAI_API_KEY 를 찾지 못했습니다 (.env)'); process.exit(1) }

const { visionQa } = await import('../server/vision-qa-api.mjs')
const { qaChecksFor, gradeQa, qaUnavailable } = await import('../src/core/visionQa.ts')
  .catch(() => ({}))

// TS 모듈은 node 로 직접 못 읽는다. 채점 규칙을 여기서 다시 쓰지 않고 tsx 로 넘긴다.
if (!qaChecksFor) {
  console.error('이 스크립트는 tsx 로 실행해야 합니다:  npx tsx scripts/backfill-qa.mjs --go')
  process.exit(1)
}

const files = only ? [only] : readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => join(DIR, f))
for (const file of files) {
  const st = JSON.parse(readFileSync(file, 'utf8'))
  const name = file.split(/[\/]/).pop()
  const viewSet = ['front', 'q45', 'detail']
  let done = 0, failed = 0
  for (const d of st.designs ?? []) {
    const cuts = viewSet.map(k => d.images.find(i => i.view === k && !i.colorway)).filter(Boolean)
    let surface = 'render'
    let use = cuts
    if (!use.length) {
      const sk = d.images.find(i => i.view === 'sketch')
      if (sk) { use = [sk]; surface = 'sketch' }
    }
    const defs = qaChecksFor(d.spec, st.params?.line ?? null, surface, use.length)
    if (!use.length) { d.qa = qaUnavailable(defs, 'no picture was made for this design'); failed++; continue }
    try {
      const read = await visionQa(KEY, ROOT, {
        item: d.spec.itemType, spec: JSON.stringify(d.spec.fields), surface,
        checks: defs.map(c => ({ id: c.id, label: c.label, target: c.target })),
        views: use.map(c => ({ view: c.view, hash: c.hash })),
        langName: 'Korean',
      })
      d.qa = gradeQa(defs, read)
      const p = d.qa.filter(q => q.status === 'pass').length
      const f = d.qa.filter(q => q.status === 'fail').length
      const u = d.qa.filter(q => q.status === 'unknown').length
      console.log(`  ${d.spec.design_id}  pass=${p} fail=${f} unknown=${u}${read.cached ? ' (cached)' : ''}`)
      done++
    } catch (e) {
      d.qa = qaUnavailable(defs, 'the check could not run')
      console.log(`  ${d.spec.design_id}  실패 · ${String(e.message).slice(0, 80)}`)
      failed++
    }
  }
  console.log(`${name}  checked=${done} unavailable=${failed}`)
  if (GO) writeFileSync(file, JSON.stringify(st, null, 1))
}
console.log(GO ? '기록했습니다.' : '미리보기입니다. 적용하려면 --go 를 붙이세요.')
