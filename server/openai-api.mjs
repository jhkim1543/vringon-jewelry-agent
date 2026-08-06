// ── OpenAI 이미지 생성 API — 서버 사이드 전용 ────────────────────────
// 키는 이 프로세스(Node)에만 존재하고 브라우저 번들에 들어가지 않는다.
// Vite dev 서버 미들웨어로 붙이거나, 단독 HTTP 서버로도 재사용 가능하다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMiroBoard, planMiroBoard } from './miro-api.mjs'
import { DEEP_MODEL_DEFAULT, researchCompetitors, researchTrends, researchSeasonDossier } from './research-api.mjs'
import { geminiEdit, geminiGenerate, geminiProbe, geminiShotPlan } from './gemini-api.mjs'
import { compositeLogo, logoAvailable } from './logo-api.mjs'
import { tripoMultiview, tripoProbe, readModel } from './tripo-api.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CACHE_DIR = join(ROOT, '.cache', 'images')

// 이미지 생성 모델 — OpenAI 최상위 이미지 모델
export const IMAGE_MODEL = 'gpt-image-1'
// 디자인 생성 모델 · 화면에는 성격으로만 노출한다 (빠른 모델 / 디테일 모델)
// 계정에서 실제 호출되는 것을 확인한 최신 모델을 쓴다.
//   gpt-image-1.5  medium  16초   · 빠른 쪽
//   gpt-image-2    medium  57초   · 디테일 쪽
// Gemini 경로는 GEMINI_API_KEY가 있을 때만 활성화된다 (없으면 위 경로 유지).
// 최고 사양으로 둔다. 비용보다 결과를 우선한다는 지시.
//   gpt-image-1.5 high  29초  · 빠른 쪽
//   gpt-image-2   high  136초 · 디테일 쪽
const ENGINE = {
  fast:   { model: 'gpt-image-1.5', quality: 'high', provider: 'openai' },
  detail: { model: 'gpt-image-2',   quality: 'high', provider: 'openai' },
}
// Gemini는 OpenAI가 실패했을 때의 예비 경로로만 쓴다.
// 기본값이 아니다 — 최고 사양은 OpenAI 쪽이다.
const GEMINI_FALLBACK_ONLY = true
const pick = (e) => ENGINE[e] || ENGINE.detail

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
const API_KEY = env.OPENAI_API_KEY || ''
const MIRO_TOKEN = env.MIRO_ACCESS_TOKEN || ''
// Gemini 키가 있으면 "빠른 모델"이 그쪽으로 간다. 없으면 OpenAI 경로를 유지한다.
const GEMINI_KEY = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || ''
// 딥리서치는 같은 키를 쓴다. 계정에서 열린 뒤 이 값을 1로 두면 켜진다.
const DEEP_RESEARCH = env.OPENAI_DEEP_RESEARCH === '1'
// 딥리서치는 전용 키가 있으면 그쪽을 쓴다 (조직 인증이 끝난 프로젝트 키)
const DEEP_KEY = env.OPENAI_DEEP_RESEARCH_KEY || env.OPENAI_API_KEY || ''
const DEEP_MODEL = env.OPENAI_DEEP_RESEARCH_MODEL || DEEP_MODEL_DEFAULT

// Tripo · 멀티뷰에서 3D 모델을 만든다
const TRIPO_KEY = env.TRIPO_API_KEY || ''

const SHOT_DIR = join(ROOT, '.cache', 'shots')

function ensureCache() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
}
function ensureShotCache() {
  if (!existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR, { recursive: true })
}

function keyOf(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', c => { raw += c; if (raw.length > 8e6) reject(new Error('body too large')) })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch (e) { reject(e) } })
    req.on('error', reject)
  })
}

function json(res, code, obj) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

/** 생성 — 캐시 히트면 API를 호출하지 않는다 (재개 시 중복 과금 0건) */
async function generate({ prompt, size = '1024x1024', engine = 'detail' }) {
  const { model, quality } = pick(engine)
  const usedModel = (!GEMINI_FALLBACK_ONLY && engine === 'fast' && GEMINI_KEY) ? 'gemini' : model
  ensureCache()
  const hash = keyOf(['gen', usedModel, prompt, size, quality])
  const file = join(CACHE_DIR, `${hash}.png`)
  if (existsSync(file)) return { hash, cached: true, model: usedModel }
  if (!API_KEY) throw new Error('OPENAI_API_KEY 미설정 — fashion-agent/.env 확인')

  if (!GEMINI_FALLBACK_ONLY && engine === 'fast' && GEMINI_KEY) {
    try {
      const { buf, model: gm } = await geminiGenerate(GEMINI_KEY, { prompt })
      writeFileSync(file, buf)
      return { hash, cached: false, model: gm }
    } catch { /* Gemini 실패 시 OpenAI로 이어서 시도한다 */ }
  }

  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model, prompt, size, quality, n: 1, background: 'opaque' }),
  })
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 400)}`)
  const data = await r.json()
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI 응답에 이미지 없음')
  writeFileSync(file, Buffer.from(b64, 'base64'))
  return { hash, cached: false, model: usedModel }
}

/** 편집 — S3 멀티뷰·컬러웨이는 신규 생성이 아니라 기준 렌더의 편집 (지시서 S3-③) */
async function edit({ baseHash, prompt, size = '1024x1024', engine = 'detail' }) {
  const { model, quality } = pick(engine)
  const usedModel = (!GEMINI_FALLBACK_ONLY && engine === 'fast' && GEMINI_KEY) ? 'gemini' : model
  ensureCache()
  const hash = keyOf(['edit', usedModel, baseHash, prompt, size, quality])
  const file = join(CACHE_DIR, `${hash}.png`)
  if (existsSync(file)) return { hash, cached: true }
  const basePath = join(CACHE_DIR, `${baseHash}.png`)
  if (!existsSync(basePath)) throw new Error(`기준 이미지 없음: ${baseHash}`)
  if (!API_KEY) throw new Error('OPENAI_API_KEY 미설정')

  if (!GEMINI_FALLBACK_ONLY && engine === 'fast' && GEMINI_KEY) {
    try {
      const { buf, model: gm } = await geminiEdit(GEMINI_KEY, { prompt, baseImage: readFileSync(basePath) })
      writeFileSync(file, buf)
      return { hash, cached: false, model: gm }
    } catch { /* Gemini 실패 시 OpenAI 편집으로 넘어간다 */ }
  }

  const form = new FormData()
  form.append('model', model)
  form.append('prompt', prompt)
  form.append('size', size)
  form.append('quality', quality)
  form.append('image', new Blob([readFileSync(basePath)], { type: 'image/png' }), 'base.png')

  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  })
  if (!r.ok) throw new Error(`OpenAI edit ${r.status}: ${(await r.text()).slice(0, 400)}`)
  const data = await r.json()
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI 편집 응답에 이미지 없음')
  writeFileSync(file, Buffer.from(b64, 'base64'))
  return { hash, cached: false, model: usedModel }
}

/** connect 스타일 핸들러 — Vite dev 미들웨어와 단독 서버 양쪽에서 사용 */
export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  if (path === '/api/status') {
    ensureCache()
    const n = readdirSync(CACHE_DIR).filter(f => f.endsWith('.png')).length
    return json(res, 200, {
      keyPresent: !!API_KEY, model: IMAGE_MODEL, cachedImages: n,
      miroConnected: !!MIRO_TOKEN,
      deepResearch: DEEP_RESEARCH, deepModel: DEEP_MODEL,
      geminiConnected: !!GEMINI_KEY,
      tripoConnected: !!TRIPO_KEY,
      engines: { fast: ENGINE.fast.model, detail: ENGINE.detail.model },
    })
  }

  // 딥리서치 접근 진단 · 계정에서 열렸는지 한 번에 확인한다
  if (path === '/api/research/deep-check') {
    if (!DEEP_KEY) return json(res, 200, { available: false, reason: '딥리서치 키 미설정' })
    const candidates = [DEEP_MODEL, 'o3-deep-research', 'o4-mini-deep-research']
    const tried = []
    for (const m of [...new Set(candidates)]) {
      try {
        const r = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEP_KEY}` },
          body: JSON.stringify({
            model: m, input: 'ping', background: true,
            tools: [{ type: 'web_search_preview' }],
          }),
        })
        if (r.ok) {
          const j = await r.json()
          // 진단용이므로 즉시 취소해 과금을 남기지 않는다
          fetch(`https://api.openai.com/v1/responses/${j.id}/cancel`, {
            method: 'POST', headers: { Authorization: `Bearer ${DEEP_KEY}` },
          }).catch(() => {})
          return json(res, 200, { available: true, model: m, enabledInEnv: DEEP_RESEARCH, tried })
        }
        tried.push({ model: m, status: r.status, message: (await r.text()).slice(0, 140) })
      } catch (e) {
        tried.push({ model: m, error: String(e.message).slice(0, 140) })
      }
    }
    return json(res, 200, {
      available: false, enabledInEnv: DEEP_RESEARCH, tried,
      hint: '프로젝트의 모델 권한에서 deep research 모델을 허용해야 합니다 (platform.openai.com → Project → Limits).',
    })
  }

  // 수집한 제품 사진을 서버가 받아 캐시한다. 핫링크·CORS·만료 링크를 피한다.
  if (path === '/api/shot') {
    const src = url.searchParams.get('u') || ''
    if (!/^https:\/\//.test(src)) { res.statusCode = 400; return res.end('bad url') }
    ensureShotCache()
    const name = `${keyOf(['shot', src])}.img`
    const file = join(SHOT_DIR, name)
    try {
      if (!existsSync(file)) {
        const r = await fetch(src, {
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
          redirect: 'follow',
        })
        if (!r.ok) throw new Error(String(r.status))
        const type = r.headers.get('content-type') || ''
        if (!type.startsWith('image/')) throw new Error('not image')
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 8e6) throw new Error('too large')
        writeFileSync(file, buf)
        writeFileSync(file + '.type', type)
      }
      const type = existsSync(file + '.type') ? readFileSync(file + '.type', 'utf8') : 'image/jpeg'
      res.setHeader('Content-Type', type)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return res.end(readFileSync(file))
    } catch {
      res.statusCode = 404
      return res.end('shot unavailable')
    }
  }

  if (path === '/api/image/providers') {
    const out = { openai: { keyPresent: !!API_KEY, fast: ENGINE.fast.model, detail: ENGINE.detail.model },
                  gemini: { keyPresent: !!GEMINI_KEY } }
    if (GEMINI_KEY) { try { out.gemini = { ...out.gemini, ...(await geminiProbe(GEMINI_KEY)) } } catch (e) { out.gemini.error = String(e.message) } }
    return json(res, 200, out)
  }

  if (path === '/api/research/competitors' && req.method === 'POST') {
    try {
      if (!API_KEY) throw new Error('OPENAI_API_KEY 미설정')
      const body = await readBody(req)
      return json(res, 200, await researchCompetitors(API_KEY, ROOT, body))
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
  }

  if (path === '/api/research/trends' && req.method === 'POST') {
    try {
      if (!API_KEY) throw new Error('OPENAI_API_KEY 미설정')
      const body = await readBody(req)
      // 딥리서치를 켜면 전용 키로 넘긴다
      return json(res, 200, await researchTrends(DEEP_RESEARCH ? DEEP_KEY : API_KEY, ROOT, {
        ...body,
        deep: DEEP_RESEARCH,
        deepModel: DEEP_MODEL,
      }))
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
  }

  // 시즌 도시에 · MICAM 형식의 구조화된 트렌드 자료
  if (path === '/api/research/dossier' && req.method === 'POST') {
    try {
      const b = await readBody(req)
      return json(res, 200, await researchSeasonDossier(DEEP_RESEARCH ? DEEP_KEY : API_KEY, ROOT, {
        categoryEn: b.categoryEn, season: b.season, priceBand: b.priceBand,
        brands: b.brands ?? [], deep: DEEP_RESEARCH, langName: b.langName,
      }))
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
  }

  // 브랜드 로고를 생성 이미지 위에 실제로 얹는다 (프롬프트로 그리지 않는다)
  if (path === '/api/image/logo' && req.method === 'POST') {
    try {
      const b = await readBody(req)
      const r = await compositeLogo(CACHE_DIR, b)
      return json(res, 200, { ...r, url: `/api/image/file/${r.hash}.png` })
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
  }

  // 3D 모델 · 이미 만들어 둔 멀티뷰를 Tripo에 넘긴다
  if (path === '/api/model/probe') {
    return json(res, 200, await tripoProbe(TRIPO_KEY))
  }

  if (path === '/api/model/generate' && req.method === 'POST') {
    try {
      const b = await readBody(req)
      const hashes = Array.isArray(b.hashes) ? b.hashes.filter(h => /^[a-f0-9]{8,64}$/.test(h)) : []
      if (!hashes.length) return json(res, 400, { error: 'no view hashes given' })

      const views = hashes.map(h => {
        const p = join(CACHE_DIR, `${h}.png`)
        return existsSync(p) ? { buf: readFileSync(p), name: `${h}.png` } : null
      }).filter(Boolean)
      if (!views.length) return json(res, 404, { error: 'none of those views are in the cache' })

      const r = await tripoMultiview(ROOT, TRIPO_KEY, { views })
      return json(res, 200, { ...r, url: `/api/model/file/${r.hash}.${r.format}` })
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
  }

  if (path.startsWith('/api/model/file/')) {
    const raw = path.slice('/api/model/file/'.length)
    if (!/^[a-f0-9]{8,64}\.(glb|gltf)$/.test(raw)) { res.statusCode = 400; return res.end('bad name') }
    const buf = readModel(ROOT, raw)
    if (!buf) { res.statusCode = 404; return res.end('not found') }
    res.setHeader('Content-Type', 'model/gltf-binary')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.end(buf)
  }

  if (path === '/api/miro/export' && req.method === 'POST') {
    try {
      const { model, meta } = await readBody(req)
      // 형태가 어긋나면 planMiroBoard 안에서 TypeError 가 나 원인이 안 보인다
      if (!model || !Array.isArray(model.columns) || !Array.isArray(model.nodes)) {
        return json(res, 400, { error: 'board model must have columns[] and nodes[]' })
      }
      const plan = planMiroBoard(model, meta ?? { name: 'VRINGON 품평 보드', description: '' })
      if (!MIRO_TOKEN) {
        return json(res, 200, {
          mode: 'plan',
          plan,
          hint: 'MIRO_ACCESS_TOKEN을 .env에 넣으면 보드를 바로 생성합니다. 지금은 생성 계획만 반환했습니다.',
        })
      }
      const out = await createMiroBoard(MIRO_TOKEN, plan)
      return json(res, 200, { mode: 'created', ...out })
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) })
    }
  }

  // 개발용 · 지금 실행한 Run을 예시 샘플로 굳힌다.
  // 참조된 이미지는 캐시에서 public/samples 로 복사해, 캐시를 지워도 샘플이 살아 있게 한다.
  if (path === '/api/dev/save-sample' && req.method === 'POST') {
    try {
      const { name, state } = await readBody(req)
      if (!/^[a-z0-9_]+$/.test(String(name ?? ''))) return json(res, 400, { error: 'bad name' })
      const outDir = join(ROOT, 'public', 'samples')
      mkdirSync(outDir, { recursive: true })
      let text = JSON.stringify(state)
      const hashes = [...new Set([...text.matchAll(/\/api\/image\/file\/([a-f0-9]{8,64})\.png/g)].map(m => m[1]))]
      let copied = 0
      for (const h of hashes) {
        const src = join(CACHE_DIR, h + '.png')
        if (!existsSync(src)) continue
        writeFileSync(join(outDir, `${h}.png`), readFileSync(src))
        copied++
      }
      // 3D 모델도 함께 옮긴다. 캐시를 지워도 샘플이 살아 있어야 한다.
      const vidRe = new RegExp('/api/video/file/([a-f0-9]{8,64})\\.(webp|gif|mp4|webm)', 'g')
      const vidHashes = [...new Set([...text.matchAll(vidRe)].map(m => m[1] + '.' + m[2]))]
      for (const name of vidHashes) {
        const src = join(ROOT, '.cache', 'models', name)
        if (!existsSync(src)) continue
        writeFileSync(join(outDir, name), readFileSync(src))
        copied++
      }
      text = text.replaceAll('/api/image/file/', '/samples/').replaceAll('/api/model/file/', '/samples/')
      const dir = join(ROOT, 'src', 'samples')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${name}.json`), JSON.stringify(JSON.parse(text), null, 1))
      return json(res, 200, { ok: true, file: `src/samples/${name}.json`, images: hashes.length, copied })
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
  }

  if (path.startsWith('/api/image/file/')) {
    // 캐시 파일명은 "<hex24>.png" 형태만 허용한다 (경로 이탈 차단)
    const raw = path.slice('/api/image/file/'.length)
    const m = /^([a-f0-9]{8,64})\.png$/.exec(raw)
    if (!m) { res.statusCode = 400; return res.end('bad name') }
    const file = join(CACHE_DIR, `${m[1]}.png`)
    if (!existsSync(file)) { res.statusCode = 404; return res.end('not found') }
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.end(readFileSync(file))
  }

  if (req.method !== 'POST') { res.statusCode = 405; return res.end('method not allowed') }

  try {
    const body = await readBody(req)
    if (path === '/api/image/generate') {
      const { hash, cached, model } = await generate(body)
      return json(res, 200, { url: `/api/image/file/${hash}.png`, hash, cached, model })
    }
    if (path === '/api/image/edit') {
      const { hash, cached, model } = await edit(body)
      return json(res, 200, { url: `/api/image/file/${hash}.png`, hash, cached, model })
    }
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) })
  }

  res.statusCode = 404
  res.end('not found')
}

/** Vite 플러그인 — dev 서버에 /api 라우트를 붙인다 */
export function openaiApiPlugin() {
  return {
    name: 'vringon-openai-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        handleApi(req, res).catch(err => {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        })
      })
    },
  }
}
