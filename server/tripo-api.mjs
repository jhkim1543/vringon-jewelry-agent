// ── Tripo · 멀티뷰 → 3D 모델 ────────────────────────────────────────
// 파이프라인이 이미 각도별 컷을 만들어 둔다(신발: 측면·3/4·탑, 주얼리: 정면·45도·디테일).
// 한 장으로 추론시키는 것보다 여러 각도를 함께 주는 쪽이 형태가 훨씬 정확하다.
//
// 흐름: 이미지 업로드 → multiview_to_model 태스크 생성 → 폴링 → GLB 내려받아 캐시
// 키는 .env 의 TRIPO_API_KEY 에만 둔다. 브라우저로 나가지 않는다.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://api.tripo3d.ai/v2/openapi'
const POLL_MS = 4000
const MAX_WAIT_MS = 12 * 60_000

function modelDir(root) {
  const d = join(root, '.cache', 'models')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

export async function tripoProbe(apiKey) {
  if (!apiKey) return { available: false, reason: 'No TRIPO_API_KEY set' }
  try {
    const r = await fetch(`${BASE}/user/balance`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) return { available: false, reason: `Tripo ${r.status}` }
    const j = await r.json()
    return { available: true, balance: j?.data?.balance ?? null }
  } catch (e) {
    return { available: false, reason: String(e.message || e).slice(0, 80) }
  }
}

/** 이미지 한 장을 올리고 image_token 을 받는다 */
async function upload(apiKey, buf, name) {
  const form = new FormData()
  form.append('file', new Blob([buf], { type: 'image/png' }), name)
  const r = await fetch(`${BASE}/upload/sts`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
  })
  if (!r.ok) throw new Error(`Tripo upload ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  const token = j?.data?.image_token
  if (!token) throw new Error('Tripo upload returned no image_token')
  return token
}

async function poll(apiKey, taskId, onStep) {
  const started = Date.now()
  for (;;) {
    if (Date.now() - started > MAX_WAIT_MS) throw new Error('Tripo timed out')
    await new Promise(r => setTimeout(r, POLL_MS))
    const r = await fetch(`${BASE}/task/${taskId}`, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (!r.ok) continue
    const j = await r.json()
    const d = j?.data
    if (!d) continue
    onStep?.(d.status, d.progress ?? 0, Math.round((Date.now() - started) / 1000))
    if (d.status === 'success') return d
    if (['failed', 'cancelled', 'banned', 'expired'].includes(d.status)) {
      throw new Error(`Tripo task ${d.status}`)
    }
  }
}

/** 멀티뷰 → 3D. views 는 png 버퍼 배열이고, 순서는 정면·좌·후·우 규약을 따른다.
 *  우리가 가진 각도가 그 규약과 정확히 같지는 않으므로, 빈 자리는 null 로 둔다. */
export async function tripoMultiview(root, apiKey, { views, onStep }) {
  if (!apiKey) throw new Error('No TRIPO_API_KEY set')
  const usable = views.filter(Boolean).slice(0, 4)
  if (!usable.length) throw new Error('no views to send')

  const hash = createHash('sha256')
    .update(usable.map(v => createHash('sha256').update(v.buf).digest('hex')).join('|'))
    .digest('hex').slice(0, 24)
  const out = join(modelDir(root), `${hash}.glb`)
  if (existsSync(out)) return { hash, format: 'glb', views: usable.length, cached: true }

  onStep?.('uploading', 0, 0)
  const tokens = []
  for (const v of usable) tokens.push({ type: 'png', file_token: await upload(apiKey, v.buf, v.name) })

  // Tripo 멀티뷰는 [front, left, back, right] 순서를 기대한다.
  // 우리가 가진 각도는 정면·사분·상단이라 뒤쪽이 없다. 없는 자리는 빈 객체로 둔다.
  const files = [tokens[0] ?? {}, tokens[1] ?? {}, {}, tokens[2] ?? {}]

  const create = await fetch(`${BASE}/task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      type: 'multiview_to_model',
      files,
      model_version: 'v2.5-20250123',
      texture: true,
      pbr: true,
    }),
  })
  if (!create.ok) throw new Error(`Tripo task ${create.status}: ${(await create.text()).slice(0, 240)}`)
  const cj = await create.json()
  const taskId = cj?.data?.task_id
  if (!taskId) throw new Error('Tripo returned no task_id')

  const done = await poll(apiKey, taskId, onStep)
  const url = done?.output?.pbr_model ?? done?.output?.model ?? done?.result?.pbr_model?.url ?? done?.result?.model?.url
  if (!url) throw new Error('Tripo finished but returned no model url')

  const dl = await fetch(url)
  if (!dl.ok) throw new Error(`Tripo download ${dl.status}`)
  writeFileSync(out, Buffer.from(await dl.arrayBuffer()))
  return { hash, format: 'glb', views: usable.length, cached: false, taskId }
}

export function readModel(root, name) {
  const f = join(modelDir(root), name)
  return existsSync(f) ? readFileSync(f) : null
}
