// ── 화면용 아트 생성 · GPT 이미지 API 로 만든 것을 public/brand 에 굳힌다 ──
//
//   node scripts/make-brand-art.mjs            # 없는 것만 생성
//   node scripts/make-brand-art.mjs --force    # 전부 다시 생성
//
// 에이전트 선택 화면의 흑백 히어로 3장 등, 제품 데이터가 아니라 UI 장식으로
// 쓰는 이미지들이다. 런타임에 생성하면 방문마다 과금이므로 반드시 여기서 구워 둔다.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'http://localhost:5191'
const OUT = join(ROOT, 'public', 'brand')
mkdirSync(OUT, { recursive: true })
const force = process.argv.includes('--force')

// 공통 톤 · 어두운 배경의 흑백(모노크롬) 에디토리얼. 선택 화면이 다크 히어로라
// 사진도 다크·저채도로 맞춘다. 라이트 테마에서는 카드 안 사진이라 그대로 둬도 어색하지 않다.
const TONE = 'Black and white monochrome editorial photography, deep black background,'
  + ' dramatic soft studio lighting, high contrast, fine grain, luxury campaign mood,'
  + ' no text, no watermark, no logos.'

const JOBS = [
  {
    file: 'agent-competitor.webp',
    prompt: `${TONE} A still-life cluster of four distinct silver jewelry pieces on black glass:`
      + ' a chunky chain-link bracelet, a twisted band ring, an emerald-cut solitaire ring and a signet ring,'
      + ' arranged like a market survey flat-lay, top-down view.',
  },
  {
    file: 'agent-fashion.webp',
    // 원문은 'evening dress' 표현이 안전 필터에 걸렸다 · 착장 언급 없이 주얼리 근접으로
    prompt: `${TONE} Close-up profile portrait of a fashion model's neck and ear, wearing a bold`
      + ' chain-link necklace and one sculptural drop earring, hair tied back, runway spotlight from the side,'
      + ' a blurred catwalk in the far background.',
  },
  {
    file: 'agent-collection.webp',
    prompt: `${TONE} A complete jewelry set displayed as one family: a pendant necklace hanging from above,`
      + ' a pair of drop earrings, a slim ring and a chain bracelet laid on black velvet,'
      + ' every piece sharing the same teardrop design language.',
  },
]

const ping = await fetch(`${BASE}/api/status`).catch(() => null)
if (!ping?.ok) {
  console.error('서버(5191)가 응답하지 않습니다. 먼저 띄우세요.')
  process.exit(1)
}

for (const j of JOBS) {
  const out = join(OUT, j.file)
  if (existsSync(out) && !force) { console.log('있음 · 건너뜀:', j.file); continue }
  process.stdout.write(`생성 중: ${j.file} ... `)
  const r = await fetch(`${BASE}/api/image/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: j.prompt, size: '1024x1024', engine: 'fast' }),
  })
  const jr = await r.json()
  if (!r.ok || jr.error) { console.log('실패:', jr.error ?? r.status); continue }
  const img = await fetch(`${BASE}${jr.url}`)
  const buf = Buffer.from(await img.arrayBuffer())
  // 생성 API 는 PNG(~2MB)를 준다 · 화면 장식용이므로 진짜 webp 로 줄여 굳힌다
  const { default: sharp } = await import('sharp')
  const small = await sharp(buf).resize(880, 880, { fit: 'cover' }).webp({ quality: 78 }).toBuffer()
  writeFileSync(out, small)
  console.log(`${Math.round(small.length / 1024)}KB`)
}
console.log('완료 · public/brand/')
