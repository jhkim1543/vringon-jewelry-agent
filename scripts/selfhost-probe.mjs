// ── 자체 호스팅 이미지 서버 점검 ────────────────────────────────────
// .env 의 SELF_HOST_IMAGE_URL 이 가리키는 서버가 이 앱이 기대하는 형태로
// 말하는지 확인한다. 앱을 통째로 돌려 보기 전에 여기서 걸러 낸다.
//
//   node scripts/selfhost-probe.mjs
//
// 확인하는 것 · 생성과 편집 두 경로가 모두 PNG 를 돌려주는가.
// 앱은 편집(기준 렌더에서 뷰·컬러웨이·착용컷을 파생)에 크게 기대므로,
// 생성만 되고 편집이 안 되는 서버는 이 앱에는 반쪽짜리다.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const out = {}
  for (const f of ['.env.local', '.env']) {
    const p = join(ROOT, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return out
}
const env = { ...loadEnv(), ...process.env }
const URL_ = (env.SELF_HOST_IMAGE_URL || '').replace(/\/+$/, '')
const MODEL = env.SELF_HOST_IMAGE_MODEL || ''
const KEY = env.SELF_HOST_IMAGE_KEY || ''

if (!URL_ || !MODEL) {
  console.log('SELF_HOST_IMAGE_URL / SELF_HOST_IMAGE_MODEL 이 .env 에 없습니다.')
  console.log('자체 호스팅은 꺼져 있고, 이미지는 유료 API 로 나갑니다.')
  process.exit(2)
}

const headers = KEY ? { Authorization: `Bearer ${KEY}` } : {}
const OUT = join(ROOT, '.cache', 'probe')
mkdirSync(OUT, { recursive: true })

const PROMPT = 'A single plain silver hoop earring, seamless white background, '
  + 'soft even studio light, sharp focus, no text, no watermark, no human.'

async function timed(label, fn) {
  const t = Date.now()
  try {
    const buf = await fn()
    const s = ((Date.now() - t) / 1000).toFixed(1)
    console.log(`  ${label.padEnd(8)} OK  ${s}s · ${(buf.length / 1024).toFixed(0)}KB`)
    return buf
  } catch (e) {
    const s = ((Date.now() - t) / 1000).toFixed(1)
    console.log(`  ${label.padEnd(8)} 실패 ${s}s · ${String(e.message).slice(0, 160)}`)
    return null
  }
}

function pickImage(j) {
  const b64 = j?.data?.[0]?.b64_json
  if (!b64) throw new Error(`응답에 b64_json 없음 · 받은 키: ${Object.keys(j || {}).join(', ')}`)
  return Buffer.from(b64, 'base64')
}

console.log(`서버 ${URL_}\n모델 ${MODEL}\n`)

const gen = await timed('생성', async () => {
  const r = await fetch(`${URL_}/v1/images/generations`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: PROMPT, size: '1024x1024', n: 1 }),
  })
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
  return pickImage(await r.json())
})
if (gen) writeFileSync(join(OUT, 'selfhost-gen.png'), gen)

if (gen) {
  const ed = await timed('편집', async () => {
    const form = new FormData()
    form.append('model', MODEL)
    form.append('prompt', 'Keep the exact same product and angle. Only recolor the metal to warm polished gold.')
    form.append('size', '1024x1024')
    form.append('image', new Blob([gen], { type: 'image/png' }), 'base.png')
    const r = await fetch(`${URL_}/v1/images/edits`, { method: 'POST', headers, body: form })
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
    return pickImage(await r.json())
  })
  if (ed) writeFileSync(join(OUT, 'selfhost-edit.png'), ed)

  console.log(`\n결과물 ${OUT}`)
  console.log(ed
    ? '통과 · 생성과 편집이 모두 됩니다. .env 를 그대로 두면 앱이 이 서버를 씁니다.'
    : '주의 · 생성만 됩니다. 이 앱은 편집으로 뷰·컬러웨이·착용컷을 만들므로 반쪽만 돌아갑니다.')
  process.exit(ed ? 0 : 1)
}
process.exit(1)
