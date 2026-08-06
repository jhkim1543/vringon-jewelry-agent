// 샘플 이미지 경량화 · save-sample이 복사해 온 PNG를 webp로 바꾸고
// 샘플 JSON의 참조도 함께 고친다. 저장소와 Pages 페이로드를 줄이기 위한 것.
//   node scripts/webp-samples.mjs
import { readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'public', 'samples')
const SAMPLES = join(ROOT, 'src', 'samples')

const pngs = readdirSync(DIR).filter(f => f.endsWith('.png'))
let saved = 0
for (const f of pngs) {
  const src = join(DIR, f)
  const out = src.replace(/\.png$/, '.webp')
  const before = statSync(src).size
  await sharp(src).webp({ quality: 82 }).toFile(out)
  saved += before - statSync(out).size
  unlinkSync(src)
}
for (const j of readdirSync(SAMPLES).filter(f => f.endsWith('.json'))) {
  const p = join(SAMPLES, j)
  const text = readFileSync(p, 'utf8')
  const fixed = text.replace(/(\/samples\/[a-f0-9]{8,64})\.png/g, '$1.webp')
  if (fixed !== text) writeFileSync(p, fixed)
}
console.log(`${pngs.length} png -> webp, saved ${(saved / 1024 / 1024).toFixed(1)}MB`)
