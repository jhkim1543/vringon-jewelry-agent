// ── 브랜드 로고 합성 ────────────────────────────────────────────────
// 생성 모델은 로고 형태를 정확히 재현하지 못한다. 그래서 프롬프트로 그리게 하지 않고,
// 생성이 끝난 이미지 위에 원본 로고 파일을 실제로 얹는다. 이러면 형태가 어긋나지 않는다.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 배치 지점 → 이미지 안에서의 상대 좌표(0~1)와 크기 비율 */
// 측면 기준 렌더에서의 자리. 제품 위에 얹히되 실루엣을 가리지 않을 만큼 작게 둔다.
const PLACEMENT = {
  none:    null,
  heel:    { x: 0.845, y: 0.475, w: 0.052 },
  tongue:  { x: 0.500, y: 0.400, w: 0.045 },
  side:    { x: 0.470, y: 0.545, w: 0.060 },
  insole:  { x: 0.500, y: 0.470, w: 0.070 },
  clasp:   { x: 0.500, y: 0.330, w: 0.050 },
  pendant: { x: 0.500, y: 0.560, w: 0.080 },
}

const SCALE = { subtle: 0.78, normal: 1.0, bold: 1.35 }

let sharpMod = null
async function getSharp() {
  if (sharpMod === null) {
    try { sharpMod = (await import('sharp')).default } catch { sharpMod = false }
  }
  return sharpMod
}

export async function logoAvailable() {
  return !!(await getSharp())
}

/** dataUrl 로고를 base 이미지 위에 합성해 새 파일로 저장하고 해시를 돌려준다. */
export async function compositeLogo(cacheDir, { baseHash, dataUrl, placement, scale = 'normal', opacity = 0.88 }) {
  const sharp = await getSharp()
  if (!sharp) throw new Error('sharp 미설치 · 로고 합성을 건너뜁니다')
  const spot = PLACEMENT[placement]
  if (!spot) throw new Error(`합성할 위치가 없습니다: ${placement}`)

  const basePath = join(cacheDir, `${baseHash}.png`)
  if (!existsSync(basePath)) throw new Error(`기준 이미지 없음: ${baseHash}`)

  const hash = createHash('sha256')
    .update(JSON.stringify(['logo1', baseHash, dataUrl.slice(0, 200), placement, scale, opacity]))
    .digest('hex').slice(0, 24)
  const out = join(cacheDir, `${hash}.png`)
  if (existsSync(out)) return { hash, cached: true }

  const m = /^data:image\/(png|svg\+xml|jpeg|webp);base64,(.+)$/.exec(dataUrl)
  if (!m) throw new Error('로고 dataUrl 형식을 읽을 수 없습니다')
  const logoBuf = Buffer.from(m[2], 'base64')

  const base = sharp(basePath)
  const meta = await base.metadata()
  const W = meta.width ?? 1024
  const H = meta.height ?? 1024
  const targetW = Math.max(24, Math.round(W * spot.w * (SCALE[scale] ?? 1)))

  // SVG는 density를 올려 래스터화해야 가장자리가 뭉개지지 않는다
  const logo = await sharp(logoBuf, m[1] === 'svg+xml' ? { density: 600 } : undefined)
    .resize({ width: targetW })
    .ensureAlpha()
    .composite([{
      input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true, blend: 'dest-in',
    }])
    .png().toBuffer()

  const lm = await sharp(logo).metadata()
  const left = Math.max(0, Math.min(W - (lm.width ?? targetW), Math.round(W * spot.x - (lm.width ?? targetW) / 2)))
  const top = Math.max(0, Math.min(H - (lm.height ?? targetW), Math.round(H * spot.y - (lm.height ?? targetW) / 2)))

  const composed = await sharp(basePath).composite([{ input: logo, left, top }]).png().toBuffer()
  writeFileSync(out, composed)
  return { hash, cached: false }
}
