// 위저드 미리보기 그림이 실제로 존재하는지 확인한다.
//   node scripts/check-wizard-art.mjs
// Wizard.tsx 의 SCOPE_ART 는 데모 샘플의 산출물을 직접 가리킨다. 그래서 두 가지 일이
// 조용히 그림을 깨뜨린다 — prune-samples 가 그 파일을 지우거나, webp-samples 가 확장자를
// 바꾸거나. 둘 다 실제로 겪었고, 화면을 열어 보기 전까지 아무도 모른다.
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(ROOT, 'src', 'ui', 'Wizard.tsx'), 'utf8')

const block = /const SCOPE_ART[^{]*\{([\s\S]*?)\n\}/.exec(src)
if (!block) {
  console.error('SCOPE_ART 를 찾지 못했습니다. Wizard.tsx 의 선언 모양이 바뀌었는지 보세요.')
  process.exit(1)
}

const refs = [...block[1].matchAll(/samples\/([^`'"]+)/g)].map(m => m[1])
let bad = 0
for (const name of refs) {
  const file = join(ROOT, 'public', 'samples', name)
  const ok = existsSync(file)
  if (!ok) bad++
  console.log(`${ok ? 'OK  ' : 'MISS'} ${name}`)
}

if (!refs.length) {
  console.error('SCOPE_ART 에 그림 경로가 하나도 없습니다.')
  process.exit(1)
}
if (bad) {
  console.error(`\n${bad}개가 없습니다. 남아 있는 샘플의 산출물로 SCOPE_ART 를 다시 가리키세요.`)
  process.exit(1)
}
console.log(`\n${refs.length}개 전부 존재합니다.`)

// ── --fix · 현재 샘플의 산출물로 SCOPE_ART 를 다시 가리킨다 ──────────
// 이 함정은 세 번 반복됐다(prune 이 지우고, webp 가 확장자를 바꾸고, 샘플을 갈아엎고).
// 손으로 고치는 대신 샘플에서 뽑아 쓰면 다시는 어긋나지 않는다.
if (process.argv.includes('--fix')) {
  const { readdirSync, writeFileSync: write } = await import('node:fs')
  const SAMPLES = join(ROOT, 'src', 'samples')
  const PUB = join(ROOT, 'public', 'samples')
  const have = new Set(readdirSync(PUB))
  // 트렌드 풀사이클 샘플에서 고른다 · 네 단계가 전부 있는 것은 그것뿐이다
  let best = null
  for (const f of readdirSync(SAMPLES).filter(x => x.endsWith('.json'))) {
    const st = JSON.parse(readFileSync(join(SAMPLES, f), 'utf8'))
    if (st.params?.mode !== 'trend') continue
    const imgs = (st.designs ?? []).flatMap(d => d.images ?? [])
    const pick = (...views) => {
      for (const v of views) {
        for (const im of imgs) {
          if (im.view !== v) continue
          const base = String(im.url).split('/').pop()
          if (have.has(base)) return base
        }
      }
      return null
    }
    const set = {
      S2: pick('sketch'),
      S3: pick('front', 'design'),
      S4: pick('wear', 'concept'),
      S5: pick('ortho_front', 'front'),
    }
    if (Object.values(set).every(Boolean)) { best = { file: f, set }; break }
  }
  if (!best) { console.error('\n네 단계가 모두 있는 트렌드 샘플을 찾지 못했습니다.'); process.exit(1) }
  const WIZ = join(ROOT, 'src', 'ui', 'Wizard.tsx')
  let s = readFileSync(WIZ, 'utf8')
  const block = /(const SCOPE_ART[^{]*\{)([\s\S]*?)(\n\})/.exec(s)
  if (!block) { console.error('SCOPE_ART 선언을 찾지 못했습니다.'); process.exit(1) }
  const body = [
    '\n  S1: null,',
    `  S2: \`\${BASE}samples/${best.set.S2}\`,   // 잉크 스케치`,
    `  S3: \`\${BASE}samples/${best.set.S3}\`,   // 완성 렌더`,
    `  S4: \`\${BASE}samples/${best.set.S4}\`,   // 착용 컷`,
    `  S5: \`\${BASE}samples/${best.set.S5}\`,   // 3D용 정사영 뷰`,
  ].join('\n')
  write(WIZ, s.replace(block[0], block[1] + body + block[3]))
  console.log(`\n${best.file} 의 산출물로 다시 가리켰습니다:`)
  for (const [k, v] of Object.entries(best.set)) console.log(`  ${k} ${v}`)
}
