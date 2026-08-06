// ── Gemini 이미지 생성 · GEMINI_API_KEY가 있을 때만 활성화된다 ────────
// 화면에는 회사명을 노출하지 않는다. "빠른 모델"의 백엔드로만 쓰인다.
const BASE = 'https://generativelanguage.googleapis.com/v1beta'

// 이미지 생성이 가능한 모델을 순서대로 시도한다.
// 계정마다 열려 있는 모델이 달라, 첫 성공을 채택하고 기억한다.
// 실측(2026-08): 2.5-flash 6초 · 3.1-flash 10초 · 3-pro 16초.
// "빠른 모델" 용도이므로 빠른 순으로 시도한다.
const CANDIDATES = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
]
let resolved = null

async function callModel(apiKey, model, parts) {
  const r = await fetch(`${BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  })
  if (!r.ok) {
    const err = new Error(`Gemini ${model} ${r.status}: ${(await r.text()).slice(0, 200)}`)
    err.status = r.status
    throw err
  }
  const j = await r.json()
  const p = j.candidates?.[0]?.content?.parts ?? []
  const img = p.find(x => x.inlineData?.data)
  if (!img) throw new Error('Gemini 응답에 이미지 없음')
  return Buffer.from(img.inlineData.data, 'base64')
}

async function withFallback(apiKey, parts) {
  const order = resolved ? [resolved, ...CANDIDATES.filter(m => m !== resolved)] : CANDIDATES
  let last
  for (const m of order) {
    try {
      const buf = await callModel(apiKey, m, parts)
      resolved = m
      return { buf, model: m }
    } catch (e) {
      last = e
      // 404/403은 그 모델이 안 열린 것이므로 다음 후보로 넘어간다
      if (e.status && e.status !== 404 && e.status !== 403) throw e
    }
  }
  throw last ?? new Error('Gemini 사용 가능한 이미지 모델 없음')
}

export async function geminiGenerate(apiKey, { prompt }) {
  return withFallback(apiKey, [{ text: prompt }])
}

export async function geminiEdit(apiKey, { prompt, baseImage }) {
  return withFallback(apiKey, [
    { inlineData: { mimeType: 'image/png', data: baseImage.toString('base64') } },
    { text: prompt },
  ])
}

/** 어떤 이미지 모델이 열려 있는지 진단 */
export async function geminiProbe(apiKey) {
  const tried = []
  for (const m of CANDIDATES) {
    try {
      await callModel(apiKey, m, [{ text: 'a plain grey square' }])
      resolved = m
      return { available: true, model: m, tried }
    } catch (e) {
      tried.push({ model: m, error: String(e.message).slice(0, 120) })
    }
  }
  return { available: false, tried }
}

// ── 촬영 계획 · 어떤 영상을 만들지 Gemini가 정한다 ────────────────────
// 사람이 "천천히 밀고 들어가라" 하나만 정해 두면 모든 제품이 똑같이 움직인다.
// 제품과 무드를 보고 그에 맞는 카메라 무빙을 고르게 한다.
// 결과는 두 군데로 쓰인다.
//   · 실제 영상 모델(ComfyUI)에는 prompt 문장이 그대로 들어간다
//   · 모델이 없을 때는 motion 좌표로 카메라 무빙을 직접 만든다
const PLAN_MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro']

const SHOT_SCHEMA = {
  type: 'object',
  required: ['prompt', 'move', 'seconds', 'start', 'end', 'reason', 'action_beats'],
  properties: {
    prompt: { type: 'string', description: '영상 생성 모델에 그대로 넣을 한 문장. 무엇이 어떻게 움직이는가' },
    move: { type: 'string', enum: ['push_in', 'pull_back', 'pan_left', 'pan_right', 'tilt_down', 'tilt_up', 'orbit', 'rack_focus'] },
    seconds: { type: 'number', description: '2~5초' },
    start: {
      type: 'object', required: ['x', 'y', 'scale'],
      properties: {
        x: { type: 'number', description: '프레임 중심 가로 위치 0~1' },
        y: { type: 'number', description: '프레임 중심 세로 위치 0~1' },
        scale: { type: 'number', description: '보이는 범위 0.5~1.0. 작을수록 확대' },
      },
    },
    end: {
      type: 'object', required: ['x', 'y', 'scale'],
      properties: {
        x: { type: 'number' }, y: { type: 'number' }, scale: { type: 'number' },
      },
    },
    reason: { type: 'string', description: '왜 이 움직임인지 한 문장' },
    action_beats: {
      type: 'array',
      description: '피사체가 실제로 움직이는 순간들. 4~6개. 각 항목은 그 순간의 자세를 한 구절로 적는다. 카메라가 아니라 사람/제품이 무엇을 하고 있는지를 쓴다.',
      items: { type: 'string' },
    },
  },
}

/** 제품과 무드를 보고 촬영 계획을 세운다. 실패하면 null을 돌려주고 호출부가 기본값을 쓴다. */
export async function geminiShotPlan(apiKey, { subject, category, itemType, mood, direction, shotLabel }) {
  const input = `You are a fashion film director planning one short product clip.

Product: ${subject}${itemType ? ` (${itemType})` : ''}
Category: ${category}
${direction ? `Season direction: ${direction}` : ''}
${mood ? `Brand mood: ${mood}` : ''}
${shotLabel ? `This frame is a: ${shotLabel}` : ''}

Plan the camera move for a 2-5 second clip built from a single still of this product.

Rules:
- The product must stay readable the whole time. Never crop it out of frame.
- Do not default to a centred push-in. Choose the move the frame actually asks for:
  · a worn or fitting shot follows the body line — pan or tilt along the limb, ending close
  · a studio still life wants a slow orbit or a rack focus that lets the light travel
  · a location shot wants a pan that reveals the setting, or a pull back that places the product in it
  · only use a plain push_in when the product is small in frame and the detail is the whole point
- If the move is a pan, tilt or orbit, start and end must differ in x or y by at least 0.08.
  A move where only scale changes is a push_in or pull_back, nothing else.
- Match the move to the product. A ring or an earring wants a slow close move that lets light travel across metal. A shoe wants a move along its length or a low move that reads the sole. A worn shot wants the move to follow the body line.
- start and end are the visible window on the still. scale 1.0 is the whole image, 0.6 is a tight crop. x and y are the centre of that window.
- Keep the change modest. A move larger than 0.25 in scale or 0.3 in position reads as a jerk, not a camera.
- The prompt sentence is for a video model, so describe motion, not composition.
- action_beats are the frames of the motion itself, in order. Write what the subject is doing, not where the camera is.
  · A worn shoe shot: the walk cycle. "right heel striking the floor, left foot lifting behind" → "mid-stride, both feet off-centre" → "left heel landing, right toe pushing off" and so on.
  · A worn ring or earring: small human movement. "fingers beginning to curl inward" → "hand turning slightly so the stone catches the light".
  · A still life: the product itself barely moves. Describe light and shadow travelling instead.
- Keep the product, the person, the clothing, the setting and the framing identical across every beat.
  Only the pose changes. A beat that changes the product is wrong.`

  let lastErr = null
  for (const model of PLAN_MODELS) {
    try {
      const r = await fetch(`${BASE}/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: SHOT_SCHEMA,
            temperature: 0.8,
          },
        }),
      })
      if (!r.ok) { lastErr = new Error(`${model} ${r.status}`); continue }
      const j = await r.json()
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) { lastErr = new Error(`${model} empty`); continue }
      const plan = JSON.parse(text)
      return { ...plan, model }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error('shot plan failed')
}
