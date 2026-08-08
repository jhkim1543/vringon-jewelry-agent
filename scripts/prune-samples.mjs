// 샘플 정리 · 남길 샘플 하나만 두고 나머지 JSON과 그에 딸린 미디어를 지운다.
// public/samples 는 save-sample 이 복사한 파일이 쌓이는 곳이라, 샘플을 지우면
// 아무도 참조하지 않는 고아 파일이 남는다. 저장소와 배포 용량이 그대로 커진다.
//   node scripts/prune-samples.mjs sample_jewel_xxx      # 미리보기
//   node scripts/prune-samples.mjs sample_jewel_xxx --go # 실제 삭제
import { readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SAMPLES = join(ROOT, 'src', 'samples')
const MEDIA = join(ROOT, 'public', 'samples')

const keep = process.argv.slice(2).filter(a => a !== '--go')
const go = process.argv.includes('--go')
if (!keep.length) { console.error('사용법: node scripts/prune-samples.mjs <남길_샘플...> [--go]'); process.exit(1) }

const all = readdirSync(SAMPLES).filter(f => f.endsWith('.json'))
for (const k of keep) if (!all.includes(`${k}.json`)) { console.error(`${k}.json 이 없다`); process.exit(1) }

const keepFiles = new Set(keep.map(k => `${k}.json`))
const drop = all.filter(f => !keepFiles.has(f))

// 남길 샘플들이 실제로 쓰는 미디어만 추린다
const used = new Set()
for (const k of keep) {
  const text = readFileSync(join(SAMPLES, `${k}.json`), 'utf8')
  for (const m of text.matchAll(/\/samples\/([A-Za-z0-9_.-]+)/g)) used.add(m[1])
}
const media = readdirSync(MEDIA)
const orphans = media.filter(f => !used.has(f))

const mb = files => (files.reduce((a, f) => a + statSync(join(MEDIA, f)).size, 0) / 1024 / 1024).toFixed(1)

console.log(`남길 샘플 : ${keep.join(', ')} (미디어 ${used.size}개 참조)`)
console.log(`지울 샘플 : ${drop.length}개 · ${drop.map(f => f.replace('.json', '')).join(', ')}`)
console.log(`지울 미디어: ${orphans.length}개 / ${media.length}개 · ${mb(orphans)}MB 회수`)

if (!go) { console.log('\n미리보기다. 실제로 지우려면 --go 를 붙일 것.'); process.exit(0) }

for (const f of drop) unlinkSync(join(SAMPLES, f))
for (const f of orphans) unlinkSync(join(MEDIA, f))
console.log(`\n삭제 완료 · 샘플 ${drop.length}개, 미디어 ${orphans.length}개`)
