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
import { configureUnlocker, unlockerStatus, unlockerUsage } from './unlock.mjs'
import { grabImage } from './grab.mjs'
import { handleBoard } from './board-api.mjs'
import { readMoodboard, readSeries, readUpload, storeUpload } from './uploads-api.mjs'
import { mdReview } from './md-api.mjs'
import { visionQa } from './vision-qa-api.mjs'
import {
  agentAdoption, agentCompetitorCrawl, agentForecast, agentItemPrompt, agentKeyword, agentPrompts,
  agentRefDna, agentReferences, agentRunway, agentScore, agentSets, agentShops, agentTrendReport,
} from './agents-api.mjs'

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
configureUnlocker(env)          // 유료 언블로커도 .env 에서 키를 읽는다
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

// ── 자체 호스팅 이미지 모델 ────────────────────────────────────────
// 이 파일이 부르는 것은 원래부터 OpenAI 이미지 API 의 형태(/v1/images/generations,
// /v1/images/edits · b64_json 응답)다. 같은 형태로 서빙하는 서버(vLLM-Omni 등)를
// 세워 두면 베이스 주소만 바꿔서 그대로 쓸 수 있다 — 장당 과금이 시간당 과금으로 바뀐다.
//
//   SELF_HOST_IMAGE_URL   예: http://10.0.0.5:8000   (뒤에 /v1/... 을 붙여 부른다)
//   SELF_HOST_IMAGE_MODEL 그 서버가 받는 모델 이름
//   SELF_HOST_IMAGE_KEY   토큰이 필요하면 (없으면 안 보낸다)
//
// 주소가 없으면 이 경로는 아예 꺼진다. "자체 호스팅 중"이라고 말하면서 실제로는
// 유료 API 를 부르는 상태를 만들지 않기 위해, 켜졌을 때는 폴백도 하지 않는다.
const SELF_HOST_URL = (env.SELF_HOST_IMAGE_URL || '').replace(/\/+$/, '')
const SELF_HOST_MODEL = env.SELF_HOST_IMAGE_MODEL || ''
const SELF_HOST_KEY = env.SELF_HOST_IMAGE_KEY || ''
const selfHostOn = () => !!SELF_HOST_URL && !!SELF_HOST_MODEL

/** 자체 호스팅 서버 호출 · 생성과 편집이 같은 응답 형태를 쓴다 */
async function selfHostImage(kind, { prompt, size, basePath }) {
  const headers = SELF_HOST_KEY ? { Authorization: `Bearer ${SELF_HOST_KEY}` } : {}
  let r
  if (kind === 'edit') {
    const form = new FormData()
    form.append('model', SELF_HOST_MODEL)
    form.append('prompt', prompt)
    form.append('size', size)
    form.append('image', new Blob([readFileSync(basePath)], { type: 'image/png' }), 'base.png')
    r = await fetch(`${SELF_HOST_URL}/v1/images/edits`, { method: 'POST', headers, body: form })
  } else {
    r = await fetch(`${SELF_HOST_URL}/v1/images/generations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: SELF_HOST_MODEL, prompt, size, n: 1 }),
    })
  }
  if (!r.ok) throw new Error(`self-host ${kind} ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const j = await r.json()
  const b64 = j?.data?.[0]?.b64_json
  if (!b64) throw new Error('자체 호스팅 응답에 이미지 없음')
  return Buffer.from(b64, 'base64')
}

function ensureCache() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
}

function keyOf(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
}

// 업로드는 base64 라 원본의 약 1.35배가 된다. 11MB PDF 하나가 15MB 로 오므로
// 기본 한도로는 막힌다 — 업로드 경로만 넉넉히 열어 준다.
function readBody(req, limit = 8e6) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', c => { raw += c; if (raw.length > limit) reject(new Error('body too large')) })
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
  const usedModel = selfHostOn() ? `self:${SELF_HOST_MODEL}`
    : (!GEMINI_FALLBACK_ONLY && engine === 'fast' && GEMINI_KEY) ? 'gemini' : model
  ensureCache()
  // 캐시 키에 어느 백엔드로 만든 것인지 넣는다. 빼면 자체 호스팅으로 바꾼 뒤에도
  // 예전 유료 API 결과가 나와, 무엇을 보고 있는지 알 수 없게 된다.
  const hash = keyOf(['gen', usedModel, prompt, size, quality])
  const file = join(CACHE_DIR, `${hash}.png`)
  if (existsSync(file)) return { hash, cached: true, model: usedModel }

  // 자체 호스팅이 켜져 있으면 여기서 끝난다. 실패해도 유료 API 로 넘어가지 않는다 —
  // 비용을 아끼려고 켠 것인데 조용히 과금 경로로 새면 켠 의미가 없다.
  if (selfHostOn()) {
    writeFileSync(file, await selfHostImage('gen', { prompt, size }))
    return { hash, cached: false, model: usedModel }
  }

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
  const usedModel = selfHostOn() ? `self:${SELF_HOST_MODEL}`
    : (!GEMINI_FALLBACK_ONLY && engine === 'fast' && GEMINI_KEY) ? 'gemini' : model
  ensureCache()
  const hash = keyOf(['edit', usedModel, baseHash, prompt, size, quality])
  const file = join(CACHE_DIR, `${hash}.png`)
  if (existsSync(file)) return { hash, cached: true }
  const basePath = join(CACHE_DIR, `${baseHash}.png`)
  if (!existsSync(basePath)) throw new Error(`기준 이미지 없음: ${baseHash}`)

  if (selfHostOn()) {
    writeFileSync(file, await selfHostImage('edit', { prompt, size, basePath }))
    return { hash, cached: false, model: usedModel }
  }

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

// ── 발표용 레퍼런스 재현 샷 ──────────────────────────────────────────
// 크롤 썸네일은 작고 잘려 있어 발표 화면에 키우면 뭉개진다. 원본 사진을 기준으로
// "같은 제품의 스튜디오 컷"을 이미지 편집 모델로 다시 그린다 — 실물 사진을 대체하는 게
// 아니라 발표 화면 전용이고, 화면에는 AI 재현 배지가 붙는다. 같은 원본+프롬프트는 캐시로 1회만 과금.
const REFSHOT_PROMPT = 'Recreate this exact jewelry product as a clean e-commerce studio photograph: the same product with identical design, materials and proportions, centered on a soft neutral light background, gentle studio lighting, photorealistic, no hands, no model, no text.'

async function refshot({ src }) {
  if (typeof src !== 'string' || !src) throw new Error('src 없음')
  ensureCache()
  let buf
  if (/^https?:/.test(src)) {
    const r = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!r.ok) throw new Error(`원본 사진을 못 가져옴 ${r.status}`)
    buf = Buffer.from(await r.arrayBuffer())
  } else if (src.startsWith('/') && !src.includes('..')) {
    // 정적 산출물 경로 (/samples/…, /api/shot 이 굳힌 사본 등) — dist 먼저, dev 는 public
    const rel = src.replace(/^\//, '').split('?')[0]
    const cand = [join(ROOT, 'dist', rel), join(ROOT, 'public', rel)]
    const hit = cand.find(p => existsSync(p))
    if (!hit) throw new Error(`원본 파일 없음: ${rel}`)
    buf = readFileSync(hit)
  } else throw new Error('src 형식이 아님')

  // 편집 API 는 png 를 원한다 · sharp 로 정규화 (없으면 원본 그대로 시도)
  try {
    const sharp = (await import('sharp')).default
    buf = await sharp(buf).resize(1024, 1024, { fit: 'inside', withoutEnlargement: false }).png().toBuffer()
  } catch { /* sharp 미설치·비이미지면 원본으로 시도 */ }

  const baseHash = createHash('sha256').update(buf).digest('hex').slice(0, 24)
  const basePath = join(CACHE_DIR, `${baseHash}.png`)
  if (!existsSync(basePath)) writeFileSync(basePath, buf)
  return edit({ baseHash, prompt: REFSHOT_PROMPT, engine: 'fast' })
}

/** connect 스타일 핸들러 — Vite dev 미들웨어와 단독 서버 양쪽에서 사용 */
export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  // 보드 협업 · SSE·op 중계는 board-api 한 곳에서
  if (path.startsWith('/api/board/')) {
    const handled = await handleBoard(req, res, url, ROOT)
    if (handled !== false) return
  }

  if (path === '/api/status') {
    ensureCache()
    const n = readdirSync(CACHE_DIR).filter(f => f.endsWith('.png')).length
    return json(res, 200, {
      // 자체 호스팅이 켜져 있으면 키가 없어도 이미지를 만들 수 있다 — 화면의 "키 없음" 안내가
      // 거짓이 되지 않도록 함께 본다.
      keyPresent: !!API_KEY || selfHostOn(), model: IMAGE_MODEL, cachedImages: n,
      selfHosted: selfHostOn(),
      miroConnected: !!MIRO_TOKEN,
      deepResearch: DEEP_RESEARCH, deepModel: DEEP_MODEL,
      geminiConnected: !!GEMINI_KEY,
      tripoConnected: !!TRIPO_KEY,
      // 유료 언블로커 · 켜져 있으면 오늘 쓴 건수를 함께 준다 (요금 감시용)
      unlocker: { ...unlockerStatus(), usage: unlockerUsage(ROOT) },
      engines: { fast: ENGINE.fast.model, detail: ENGINE.detail.model },
    })
  }

  // 딥리서치 접근 진단
  // 이 진단이 왜 이렇게 생겼는가 · 종료된 모델은 /v1/models 목록과 단건 조회에 남아
  // 200 을 주면서 호출만 404 를 낸다. 그래서 "권한이 없다"로 오해하기 쉽다.
  // shutdown_date 를 먼저 읽어 죽은 모델과 못 쓰는 모델을 갈라 놓는다.
  if (path === '/api/research/deep-check') {
    if (!DEEP_KEY) return json(res, 200, { available: false, reason: '딥리서치 키 미설정' })
    const today = new Date().toISOString().slice(0, 10)
    const candidates = [...new Set([DEEP_MODEL, 'gpt-5-pro', 'o3-deep-research'])]
    const tried = []
    for (const m of candidates) {
      try {
        // ① 메타데이터 · 종료된 모델인가
        const meta = await fetch(`https://api.openai.com/v1/models/${m}`, {
          headers: { Authorization: `Bearer ${DEEP_KEY}` },
        })
        if (!meta.ok) { tried.push({ model: m, status: meta.status, verdict: '계정에 없는 모델' }); continue }
        const info = await meta.json()
        if (info.shutdown_date && info.shutdown_date < today) {
          tried.push({ model: m, verdict: '서비스 종료됨', shutdownDate: info.shutdown_date })
          continue
        }
        // ② 실제 호출 · 짧게 걸고 바로 취소해 과금을 남기지 않는다
        const r = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEP_KEY}` },
          body: JSON.stringify({ model: m, input: 'ping', background: true, tools: [{ type: 'web_search' }] }),
        })
        if (r.ok) {
          const j = await r.json()
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
    const dead = tried.filter(x => x.verdict === '서비스 종료됨')
    return json(res, 200, {
      available: false, enabledInEnv: DEEP_RESEARCH, tried,
      hint: dead.length
        ? `권한 문제가 아닙니다. ${dead.map(d => `${d.model}(종료 ${d.shutdownDate})`).join(', ')} 은 서비스가 끝난 모델입니다. OPENAI_DEEP_RESEARCH_MODEL 을 살아 있는 모델(gpt-5-pro)로 바꾸세요.`
        : '프로젝트의 모델 권한을 확인하세요 (platform.openai.com → Project → Limits).',
    })
  }

  // 수집한 제품 사진을 서버가 받아 캐시한다. 핫링크·CORS·만료 링크를 피한다.
  if (path === '/api/shot') {
    // u = 이미지 직링크, p = 상품 페이지. 직링크가 없거나 죽었으면 페이지의
    // og:image / twitter:image / JSON-LD image로 폴백한다. 직링크는 자주 썩는다.
    const src = url.searchParams.get('u') || ''
    // p는 여러 개 줄 수 있다 · 상품 페이지가 봇을 막으면 다음 후보 페이지로 넘어간다
    const pages = url.searchParams.getAll('p').filter(x => /^https:\/\//.test(x))
    if (!/^https:\/\//.test(src) && !pages.length) { res.statusCode = 400; return res.end('bad url') }
    try {
      // 받아 오는 순서(직링크 → 페이지 og:image → 유료 언블로커)와 캐시는 grab.mjs 한 곳에 있다.
      // 레퍼런스 DNA 도 같은 함수를 쓴다 — 두 벌로 두었더니 한 벌이 조용히 썩었다.
      const got = await grabImage({ src, pages, root: ROOT })
      if (!got) throw new Error('no image')
      res.setHeader('Content-Type', got.type)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return res.end(got.buf)
    } catch {
      // 핫링크 차단·소멸 링크는 흔하다. 빈 칸 대신 중립 칩을 그려 준다.
      res.setHeader('Content-Type', 'image/svg+xml')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="8" fill="#EEF1F5"/><circle cx="40" cy="34" r="12" fill="none" stroke="#B4BAC2" stroke-width="3"/><path d="M28 60c3-8 21-8 24 0" fill="none" stroke="#B4BAC2" stroke-width="3" stroke-linecap="round"/></svg>')
    }
  }

  if (path === '/api/image/providers') {
    const out = { openai: { keyPresent: !!API_KEY, fast: ENGINE.fast.model, detail: ENGINE.detail.model },
                  gemini: { keyPresent: !!GEMINI_KEY } }
    if (GEMINI_KEY) { try { out.gemini = { ...out.gemini, ...(await geminiProbe(GEMINI_KEY)) } } catch (e) { out.gemini.error = String(e.message) } }
    return json(res, 200, out)
  }

  // 비전 QA · 실제로 만든 컷이 스펙대로 나왔는지 사진으로 확인한다
  if (path === '/api/vision/qa' && req.method === 'POST') {
    try {
      if (!API_KEY) throw new Error('OPENAI_API_KEY 미설정')
      const body = await readBody(req)
      return json(res, 200, await visionQa(API_KEY, ROOT, body))
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
  }

  // MD 페르소나 리뷰 · 셀렉 후보를 사진과 스펙으로 평가한다
  // ── 3-에이전트 조사 계층 · 전부 POST + 캐시 ─────────────────────
  const AGENT_ROUTES = {
    '/api/agent/competitor/crawl': agentCompetitorCrawl,
    '/api/agent/shops': agentShops,
    '/api/agent/trendreport': agentTrendReport,
    '/api/agent/forecast': agentForecast,
    '/api/agent/runway': agentRunway,
    '/api/agent/adoption': agentAdoption,
    '/api/agent/references': agentReferences,
    '/api/agent/refdna': agentRefDna,
    '/api/agent/prompts': agentPrompts,
    '/api/agent/keyword': agentKeyword,
    '/api/agent/sets': agentSets,
    '/api/agent/itemprompt': agentItemPrompt,
    '/api/agent/score': agentScore,
  }
  if (AGENT_ROUTES[path] && req.method === 'POST') {
    try {
      if (!API_KEY) throw new Error('OPENAI_API_KEY 미설정')
      const body = await readBody(req)
      // 깊은 조사 스위치는 서버가 쥔다 · 화면이 켜고 끄는 값이 아니다.
      // 켜져 있으면 전용 키로, 없으면 메인 키로 간다.
      const deep = DEEP_RESEARCH && (path === '/api/agent/trendreport' || path === '/api/agent/forecast')
      const key = deep ? DEEP_KEY : API_KEY
      return json(res, 200, await AGENT_ROUTES[path](key, ROOT, { ...body, ...(deep ? { deep: true, deepModel: DEEP_MODEL } : {}) }))
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
  }

  if (path === '/api/md/review' && req.method === 'POST') {
    try {
      if (!API_KEY) throw new Error('OPENAI_API_KEY 미설정')
      const body = await readBody(req)
      return json(res, 200, await mdReview(API_KEY, ROOT, body))
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
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
        categoryEn: b.categoryEn, typeEn: b.typeEn, season: b.season, priceBand: b.priceBand,
        brands: b.brands ?? [], deep: DEEP_RESEARCH, langName: b.langName,
        metalProgram: b.metalProgram, stoneProgram: b.stoneProgram,
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
      const b = await readBody(req)
      const { model, meta } = b
      // 형태가 어긋나면 planMiroBoard 안에서 TypeError 가 나 원인이 안 보인다
      if (!model || !Array.isArray(model.columns) || !Array.isArray(model.nodes)) {
        return json(res, 400, { error: 'board model must have columns[] and nodes[]' })
      }
      const plan = planMiroBoard(model, meta ?? { name: 'VRINGON 품평 보드', description: '' })
      // 사용자마다 자기 Miro 계정 토큰을 쓴다. 브라우저에만 저장되고 서버는 중계만 한다.
      const userToken = typeof b.miroToken === 'string' && b.miroToken.trim() ? b.miroToken.trim() : ''
      const MTOKEN = userToken || MIRO_TOKEN
      if (!MTOKEN) {
        return json(res, 200, {
          mode: 'plan',
          plan,
          hint: 'MIRO_ACCESS_TOKEN을 .env에 넣으면 보드를 바로 생성합니다. 지금은 생성 계획만 반환했습니다.',
        })
      }
      const out = await createMiroBoard(MTOKEN, plan)
      return json(res, 200, { mode: 'created', ...out })
    } catch (e) {
      return json(res, 500, { error: String(e.message || e) })
    }
  }

  // 개발용 · 지금 실행한 Run을 예시 샘플로 굳힌다.
  // 참조된 이미지는 캐시에서 public/samples 로 복사해, 캐시를 지워도 샘플이 살아 있게 한다.
  // ── 업로드 · 파일은 서버에 두고 해시만 돌려준다 (localStorage 용량 보호) ──
  if (path === '/api/upload' && req.method === 'POST') {
    try {
      const { files } = await readBody(req, 60e6)
      const out = (files ?? []).map(f => storeUpload(ROOT, f))
      return json(res, 200, { files: out })
    } catch (e) { return json(res, 400, { error: String(e.message || e) }) }
  }

  // 올린 파일 되돌려주기 · 사용자가 올린 것을 화면에서 그대로 봐야 비교가 된다
  if (path.startsWith('/api/upload/file/')) {
    const hash = path.split('/').pop().replace(/\.[a-z0-9]+$/i, '')
    try {
      const f = readUpload(ROOT, hash)
      res.setHeader('Content-Type', f.mime || 'application/octet-stream')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      return res.end(f.buf)
    } catch { res.statusCode = 404; return res.end('not found') }
  }

  // 시리즈 · 올린 디자인 이미지에서 불변/변수를 실제로 가른다
  if (path === '/api/series/dna' && req.method === 'POST') {
    if (!API_KEY) return json(res, 400, { error: 'OPENAI_API_KEY 미설정' })
    try {
      const b = await readBody(req)
      const r = await readSeries(API_KEY, ROOT, b)
      return json(res, 200, { ...r.data, searches: r.searches })
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
  }

  // 무드보드 · 올린 PDF 를 실제로 읽어 신호를 뽑는다
  if (path === '/api/moodboard/read' && req.method === 'POST') {
    if (!API_KEY) return json(res, 400, { error: 'OPENAI_API_KEY 미설정' })
    try {
      const b = await readBody(req)
      const r = await readMoodboard(API_KEY, ROOT, b)
      return json(res, 200, { ...r.data, searches: r.searches })
    } catch (e) { return json(res, 500, { error: String(e.message || e) }) }
  }

  if (path === '/api/dev/save-sample' && req.method === 'POST') {
    try {
      const { name, state } = await readBody(req)
      if (!/^[a-z0-9_]+$/.test(String(name ?? ''))) return json(res, 400, { error: 'bad name' })
      const outDir = join(ROOT, 'public', 'samples')
      mkdirSync(outDir, { recursive: true })
      let text = JSON.stringify(state)
      // 사용자가 올린 파일도 샘플에 함께 굳힌다 · 캐시를 비워도 데모가 살아 있어야 한다
      for (const h of [...new Set([...text.matchAll(/\/api\/upload\/file\/([a-f0-9]{8,64})/g)].map(m => m[1]))]) {
        try {
          const f = readUpload(ROOT, h)
          const ext = (f.mime || '').includes('png') ? 'png' : (f.mime || '').includes('pdf') ? 'pdf' : 'webp'
          writeFileSync(join(outDir, `up_${h}.${ext}`), f.buf)
          text = text.replaceAll(`/api/upload/file/${h}`, `/samples/up_${h}.${ext}`)
        } catch { /* 캐시에서 사라진 업로드는 건너뛴다 */ }
      }
      const hashes = [...new Set([...text.matchAll(/\/api\/image\/file\/([a-f0-9]{8,64})\.png/g)].map(m => m[1]))]
      let copied = 0
      for (const h of hashes) {
        const src = join(CACHE_DIR, h + '.png')
        if (!existsSync(src)) continue
        writeFileSync(join(outDir, `${h}.png`), readFileSync(src))
        copied++
      }
      // 3D 모델도 함께 옮긴다. 캐시를 지워도 샘플이 살아 있어야 한다.
      const vidRe = new RegExp('/api/model/file/([a-f0-9]{8,64})\\.(glb|gltf)', 'g')
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
    if (path === '/api/image/refshot') {
      const { hash, cached, model } = await refshot(body)
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
