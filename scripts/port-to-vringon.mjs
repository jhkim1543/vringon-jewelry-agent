/* 이 앱의 화면 코드를 VRINGON 저장소 안으로 옮긴다.
   주소가 qa.vringon.com/planning 이 되려면 코드가 그쪽 빌드에 들어가야 한다.

   옮기는 것 / 안 옮기는 것
     · src/**(화면·상태·i18n)  → core/src/planning/agent/    옮긴다
     · tokens.css · theme.css    → .pa-root 아래로 가둬서 옮긴다 (호스트 화면이 깨지지 않게)
     · public/samples (320MB)    → 안 옮긴다. 조사 서버가 계속 서빙한다
     · server/**                 → 안 옮긴다. 조사·이미지·보드는 별도 서버 그대로다
     · main.tsx · index.html     → 안 옮긴다. 호스트 라우트가 진입점이다

   실행: node scripts/port-to-vringon.mjs <vringon-web 경로> */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const HERE = fileURLToPath(new URL('../', import.meta.url))
const target = process.argv[2]
if (!target) { console.error('사용: node scripts/port-to-vringon.mjs <vringon-web 경로>'); process.exit(1) }
const DEST = join(target, 'core', 'src', 'planning', 'agent')

rmSync(DEST, { recursive: true, force: true })
mkdirSync(DEST, { recursive: true })

/* 화면 코드 · main.tsx 와 전역 CSS 원본은 뺀다 */
const SKIP = new Set(['main.tsx', 'tokens.css', 'theme.css', 'vite-env.d.ts'])
/* 샘플은 앱이 실제로 심는 것만 옮긴다 — QA 실행 산출물(persona_*.json)이 함께 따라가면
   남의 저장소에 검증 쓰레기가 쌓인다(실측: 한 번에 10여 개가 딸려 갔다). */
const DEMO_SAMPLES = new Set(
  [...readFileSync(join(HERE, 'src', 'core', 'sampleRun.ts'), 'utf8')
    .matchAll(/'(sample_[a-z_]+)'/g)].map(m => `${m[1]}.json`))
cpSync(join(HERE, 'src'), DEST, {
  recursive: true,
  filter: (src) => {
    const rel = relative(join(HERE, 'src'), src)
    if (!rel) return true
    const base = rel.split(/[\\/]/).pop()
    if (SKIP.has(base)) return false
    if (rel.startsWith('samples') && base.endsWith('.json') && !DEMO_SAMPLES.has(base)) return false
    return true
  },
})

/* 전역 CSS 는 .pa-root 아래로 가둔 사본을 넣는다 */
mkdirSync(join(DEST, 'styles'), { recursive: true })
for (const f of ['tokens.css', 'theme.css']) {
  execFileSync(process.execPath, [join(HERE, 'scripts', 'scope-css.mjs'),
    join(HERE, 'src', f), join(DEST, 'styles', f)], { stdio: 'inherit' })
}

/* 샘플 JSON 안의 사진 경로(/samples/…)는 조사 서버를 가리키게 둔다 —
   320MB 를 저장소에 넣지 않기 위해서다. 빌드 때 VITE_AGENT_API 가 붙는다. */
const samplesDir = join(DEST, 'samples')
let touched = 0
if (readdirSync(samplesDir, { withFileTypes: true }).length) {
  for (const f of readdirSync(samplesDir)) {
    if (!f.endsWith('.json')) continue
    const p = join(samplesDir, f)
    const before = readFileSync(p, 'utf8')
    const after = before.replaceAll('"/samples/', '"__AGENT_API__/samples/')
    if (after !== before) { writeFileSync(p, after); touched++ }
  }
}

const count = (dir) => readdirSync(dir, { withFileTypes: true })
  .reduce((n, d) => n + (d.isDirectory() ? count(join(dir, d.name)) : 1), 0)
const mb = (dir) => {
  let b = 0
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name); b += e.isDirectory() ? (walk(p), 0) : statSync(p).size } }
  walk(dir); return (b / 1e6).toFixed(1)
}
console.log(`옮김 → ${DEST}`)
console.log(`  파일 ${count(DEST)}개 · ${mb(DEST)} MB · 샘플 경로 치환 ${touched}건`)
