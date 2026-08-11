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
