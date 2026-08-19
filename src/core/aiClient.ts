// ── 이미지 생성 클라이언트 · OpenAI gpt-image-1 (서버 프록시 경유) ────
// 키는 서버(Vite dev 미들웨어 / server/openai-api.mjs)에만 존재한다.
// 브라우저 번들에는 키가 들어가지 않는다 (VITE_ prefix 사용 금지).
import type { Category, DesignSpec, LineProfile } from './types'
import { TYPE_EN, metalProgramOf, stoneProgramOf } from './types'
import type { EngineId } from './imageEngines'
import { shapePrompt } from './imageEngines'
import type { BrandIdentity } from './brand'
import { brandPromptClause } from './brand'

export const IMAGE_MODEL = 'gpt-image-1'
/** gpt-image-1 medium 1024² 근사 단가 (USD) · 정확한 청구액은 OpenAI 대시보드 기준 */
export const USD_PER_IMAGE = 0.042

export interface GenResult { url: string; hash: string; cached: boolean }

export async function apiStatus(): Promise<{ keyPresent: boolean; model: string; cachedImages: number }> {
  const r = await fetch('/api/status')
  if (!r.ok) throw new Error(`status ${r.status}`)
  return r.json()
}

/** 신규 생성 · 동일 프롬프트는 서버 캐시로 재사용되어 중복 과금이 없다 */
export async function generateImage(prompt: string, engine: EngineId = 'detail', size = '1024x1024'): Promise<GenResult> {
  const r = await fetch('/api/image/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, size, engine }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || `generate ${r.status}`)
  return j
}

/** 편집 · S3 추가 뷰·컬러웨이는 신규 생성이 아니라 기준 렌더의 편집 (지시서 S3-③④) */
export async function editImage(baseHash: string, prompt: string, engine: EngineId = 'detail'): Promise<GenResult> {
  const r = await fetch('/api/image/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseHash, prompt, size: '1024x1024', engine }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || `edit ${r.status}`)
  return j
}

// ── 스펙 → 프롬프트 (지시서 S2-4) ────────────────────────────────────
// 이미지 모델은 수치를 기하 제약으로 실행하지 않는다(5장). 프롬프트는 최선의
// 시각적 해석 요청이고, 실제 일치 여부는 비전 QA가 사후 검증한다.

// 품목 영문 표현은 TAXONOMY 한 곳에서 온다
const en = (typeId: string, fallback: string) => TYPE_EN[typeId] ?? fallback

const JEWEL_VIEW: Record<string, string> = {
  front: 'straight front view',
  q45: '45 degree angled view showing volume and thickness',
  detail: 'macro close-up of the setting and finish',
  wear: 'worn on the body at a natural angle',
}

/** 스펙 필드를 프롬프트 구절로 · 유형에 따라 의미 없는 필드는 뺀다 */

export function jewelSpecPhrase(spec: DesignSpec): string {
  const f = spec.fields as Record<string, string | number | boolean>
  const stones = Number(f.stone_count)
  const parts = [
    stones > 0
      ? `${f.setting_type} setting holding exactly ${stones} round stone${stones > 1 ? 's' : ''} of ${f.stone_size_mm}mm`
      : 'no stones, clean metal surface',
    `${f.metal} metal with ${f.finish} finish`,
  ]
  if (f.chain_type !== 'none') parts.push(`${f.chain_type} chain`)
  if (f.is_pair) parts.push('shown as a matched pair')
  return parts.join(', ')
}

/** 라인 프로필을 프롬프트 구절로 · 스펙의 metal/finish 와 별개로, 라인이 정한
 *  소재 프로그램(도금 두께·4Cs·진주 등급·TCW 상한)을 모든 컷에 고정한다 */
export function linePromptClause(l?: LineProfile | null): string {
  if (!l) return ''
  const metal = metalProgramOf(l)
  const stone = l.stone === 'none' ? '' : stoneProgramOf(l)
  return stone
    ? `Material programme of this line: ${metal}; stones: ${stone}.`
    : `Material programme of this line: ${metal}.`
}

export function sketchPrompt(spec: DesignSpec, engine: EngineId = 'detail', brand?: BrandIdentity, trend?: TrendClauseInput | null, line?: LineProfile | null): string {
  const subject = en(spec.itemType, 'jewelry piece')
  const view = JEWEL_VIEW.front
  const specStr = jewelSpecPhrase(spec)
  return shapePrompt(engine, {
    subject, spec: specStr, view,
    brand: [trendPromptClause(trend ?? null), linePromptClause(line), brand ? brandPromptClause(brand) : ''].filter(Boolean).join(' '),
    mode: 'sketch',
  })
}

export function renderPrompt(spec: DesignSpec, engine: EngineId = 'detail', brand?: BrandIdentity, trend?: TrendClauseInput | null, line?: LineProfile | null): string {
  const subject = en(spec.itemType, 'jewelry piece')
  const view = JEWEL_VIEW.front
  const specStr = jewelSpecPhrase(spec)
  return shapePrompt(engine, {
    subject, spec: specStr, view,
    brand: [trendPromptClause(trend ?? null), linePromptClause(line), brand ? brandPromptClause(brand) : ''].filter(Boolean).join(' '),
    mode: 'render',
  })
}

/** 흑백 스케치 변형 · 하나의 외형(실루엣·구조)을 고정한 채 디테일만 다르게 그린다.
 *  스케치 단계에서 외형을 확정하고, 디자인은 그 스케치에서 나온다는 순서를 지키기 위한 것. */
export function sketchVariantPrompt(k: number): string {
  const angles = [
    'Vary the setting and stone arrangement while keeping the same body.',
    'Vary the surface treatment and edge profile while keeping the same body.',
    'Vary the hardware and closure detailing while keeping the same body.',
  ]
  return [
    'Redraw this jewellery design as another black-ink technical sketch on white paper.',
    'Keep the exact same overall silhouette, proportions and construction — this is the same form.',
    angles[k % angles.length],
    'Single consistent line weight, no colour at all, no shading, orthographic projection, no text, no labels.',
  ].join(' ')
}

/** 스케치 → 컬러 디자인 · 스케치의 기하를 그대로 살려 실사 렌더로 옮긴다.
 *  디자인이 스케치와 다른 물건이 되면 스케치 단계의 의미가 없다. */
export function colorizePrompt(spec: DesignSpec, brand?: BrandIdentity, trend?: TrendClauseInput | null, line?: LineProfile | null): string {
  return [
    'Turn this black-ink technical sketch into a photorealistic studio product photograph of the exact same design.',
    'Keep the geometry, proportions, stone count and construction precisely as drawn.',
    `Materialise it as: ${jewelSpecPhrase(spec)}.`,
    trendPromptClause(trend ?? null),
    linePromptClause(line),
    brand ? brandPromptClause(brand) : '',
    'Seamless white background, soft even key light, gentle contact shadow, sharp focus, full colour, real material texture. No text, no watermark, no human, no props.',
  ].filter(Boolean).join(' ')
}

/** 추가 뷰 · 동일 객체를 유지한 채 시점만 바꾸는 편집 지시 */
export function viewEditPrompt(category: Category, viewKey: string): string {
  const v = JEWEL_VIEW[viewKey]
  return `Keep the exact same product design, materials, proportions and color. Only change the camera angle to: ${v}. Same seamless white background and lighting.`
}

/** 컬러웨이 · 형태 불변, 색만 변경 */
export function colorwayEditPrompt(colorway: string, hex?: string): string {
  const desc: Record<string, string> = {
    gold: 'warm polished gold', black: 'deep matte black', bordeaux: 'dark bordeaux red',
    ivory: 'soft ivory cream', silver: 'brushed silver',
  }
  // 브랜드가 정한 색은 이 표에 없다. 이름만 주면 모델이 제멋대로 해석하므로 hex 를 함께 준다.
  const to = desc[colorway] ?? (hex ? `${colorway} (${hex})` : colorway)
  return `Keep the exact same product, same camera angle, same shape and proportions. Only recolor the main material to ${to}. Same seamless white background and lighting.`
}

/** 착용 컷 · 기준 렌더를 편집해 사람이 착용한 상태로 옮긴다.
 *  제품 형태는 그대로 두고 배경과 사람만 들어오게 지시한다. */
// 착용 위치는 품목마다 다르다. 반지를 손목에 끼우면 그 자체로 틀린 사진이다.
// 여기서 품목별로 "어디에, 어떤 프레임으로" 를 정해 준다.
interface WearSpot {
  /** 신체 어디에 착용하는가 */
  on: string
  /** 어떻게 잘라 찍는가 */
  framing: string[]
}

const WEAR_SPOT: Record<string, WearSpot> = {
  // ── 반지 · 손가락에만 ──────────────────────────────────────────
  band: { on: 'worn on the ring finger of one hand', framing: [
    'macro close-up of a relaxed hand, fingers slightly curled, the ring on the ring finger filling the frame',
    'close crop of two hands resting together, the ring on the ring finger clearly readable, the other hand out of focus behind',
  ] },
  // ── 귀걸이 · 귓불에만 ──────────────────────────────────────────
  stud: { on: 'worn in the earlobe', framing: [
    'tight profile crop of one ear and jawline, hair tucked behind the ear, the earring reading clearly, eyes out of frame',
    'three-quarter crop of the side of the head from cheekbone to shoulder, hair pulled back, the earring catching the light',
  ] },
  // ── 목걸이 · 목과 쇄골 ─────────────────────────────────────────
  pendant: { on: 'worn around the neck, sitting on the collarbone', framing: [
    'close crop from chin to upper chest, plain neckline, the necklace lying naturally on the skin',
    'three-quarter crop of the neck and shoulder, the chain following the collarbone, the pendant centred',
  ] },
  // ── 팔찌 · 손목 ────────────────────────────────────────────────
  bangle: { on: 'worn on the wrist', framing: [
    'close crop of a forearm and wrist held across the body, the bracelet sitting just above the wrist bone',
    'close crop of a hand resting on a surface, the bracelet on the wrist, fingers relaxed and out of focus',
  ] },
  // ── 브로치 · 옷깃 ──────────────────────────────────────────────
  brooch: { on: 'pinned to a jacket lapel', framing: [
    'close crop of a tailored lapel and shoulder, the brooch pinned high on the lapel, face out of frame',
  ] },
  // ── 앵클릿 · 발목 ──────────────────────────────────────────────
  anklet: { on: 'worn around the ankle', framing: [
    'close crop from mid-calf down, bare foot and ankle, the anklet sitting just above the ankle bone',
  ] },
}

// 같은 계열은 같은 자리에 찬다
const WEAR_ALIAS: Record<string, string> = {
  solitaire: 'band', eternity: 'band', signet: 'band',
  hoop: 'stud', drop: 'stud', ear_cuff: 'stud', earcuff: 'stud',
  choker: 'pendant', chain: 'pendant', station: 'pendant',
  chain_bracelet: 'bangle', cuff: 'bangle', tennis: 'bangle',
}

function wearSpot(category: Category, itemType: string): { on: string; framing: string[] } {
  const key = WEAR_ALIAS[itemType] ?? itemType
  return WEAR_SPOT[key] ?? WEAR_SPOT.band
}

export function wearEditPrompt(category: Category, itemType: string, index: number): string {
  const spot = wearSpot(category, itemType)
  const framing = spot.framing[index % spot.framing.length]
  return [
    'Keep this exact product: same design, same materials, same proportions, same colour, same hardware.',
    `Show it being worn by a real person. It is ${spot.on}.`,
    `Framing: ${framing}.`,
    'Plain seamless light grey studio backdrop, soft even studio light, the product sharp and unmistakably the subject.',
    'Photorealistic editorial campaign photography.',
    `Do not place it anywhere other than where it belongs — it is ${spot.on}, nowhere else.`,
    'Do not redesign the product. Do not show a face. No text, no logo, no watermark.',
  ].join(' ')
}

// ── 스케치 한 장에서 갈라져 나오는 실제 제품 베리에이션 ─────────────
// ai-vringon-create-variation(사내 신발 베리에이션 워커)의 방식을 그대로 옮겼다:
// 양극 스타일 축 8개를 -1~1 슬라이더로 받아, |값|>0.2 인 축만 자연어 지시로
// 조립하고 원본 이미지를 편집한다. 마무리 문장("구조·팔레트 유지")까지 동일하다.
// 축 이름만 주얼리 조형 언어로 바꿨다.
export interface StyleVector {
  mood_creative_classic?: number      // -1 Classic ~ 1 Creative
  mood_maximal_minimal?: number       // -1 Minimal ~ 1 Maximal
  silhouette_long_short?: number      // -1 Short/compact ~ 1 Long/elongated
  silhouette_voluminous_slim?: number // -1 Slim ~ 1 Voluminous
  density_dense_airy?: number         // -1 Airy ~ 1 Dense (스톤·디테일 밀도)
  density_chunky_balanced?: number    // -1 Balanced ~ 1 Chunky
  edge_soft_sharp?: number            // -1 Soft ~ 1 Sharp
  edge_fluid_structured?: number      // -1 Fluid ~ 1 Structured
}

/** 원본 build_instruction 의 이식 · 문턱값 0.2, 축별 문구, 유지 문장까지 같은 구조 */
export function variationInstruction(v: StyleVector): string {
  const parts: string[] = []
  const push = (val: number | undefined, pos: string, neg: string) => {
    if (val !== undefined && Math.abs(val) > 0.2) parts.push(val > 0 ? pos : neg)
  }
  push(v.mood_creative_classic, 'more creative', 'more classic')
  push(v.mood_maximal_minimal, 'more maximal', 'more minimal')
  push(v.silhouette_long_short, 'a longer, more elongated silhouette', 'a shorter, more compact silhouette')
  push(v.silhouette_voluminous_slim, 'more voluminous', 'slimmer')
  push(v.density_dense_airy, 'denser stone and detail work', 'an airier, more open design')
  push(v.density_chunky_balanced, 'chunkier', 'more balanced proportions')
  push(v.edge_soft_sharp, 'sharper edges', 'softer edges')
  push(v.edge_fluid_structured, 'more structured lines', 'more fluid lines')
  if (!parts.length) return 'Generate a variation of this jewellery piece with subtle style changes. Keep the overall structure and colour palette intact.'
  return `Edit this jewellery piece to be ${parts.join(', ')}. Keep the overall jewellery structure and colour palette intact.`
}

/** 자동 실행용 프리셋 벡터 · 서로 확실히 다른 방향으로 2~3축씩 민다.
 *  슬라이더 UI 가 붙기 전까지는 이 프리셋이 슬라이더 값을 대신한다. */
const STYLE_PRESETS: { label: string; v: StyleVector }[] = [
  { label: 'Minimal & slim', v: { mood_maximal_minimal: -0.7, silhouette_voluminous_slim: -0.6 } },
  { label: 'Bold & chunky', v: { mood_maximal_minimal: 0.6, density_chunky_balanced: 0.7, edge_soft_sharp: 0.4 } },
  { label: 'Creative & fluid', v: { mood_creative_classic: 0.7, edge_fluid_structured: -0.6 } },
  { label: 'Classic & structured', v: { mood_creative_classic: -0.7, edge_fluid_structured: 0.6 } },
  { label: 'Elongated & airy', v: { silhouette_long_short: 0.6, density_dense_airy: -0.6 } },
  { label: 'Compact & dense', v: { silhouette_long_short: -0.6, density_dense_airy: 0.7 } },
  { label: 'Soft & voluminous', v: { edge_soft_sharp: -0.6, silhouette_voluminous_slim: 0.6 } },
  { label: 'Sharp & minimal', v: { edge_soft_sharp: 0.7, mood_maximal_minimal: -0.5, edge_fluid_structured: 0.4 } },
]

export function variationAxes(_category: Category) {
  return STYLE_PRESETS.map(p => ({ key: p.label, label: p.label, instruction: variationInstruction(p.v) }))
}

/** 스케치·기준 렌더에서 갈라지는 제품 베리에이션. 편집이라 같은 계보가 유지된다. */
export function variationPrompt(_category: Category, axisIndex: number): string {
  const p = STYLE_PRESETS[axisIndex % STYLE_PRESETS.length]
  return [
    'This is a product design variation, not a new product.',
    variationInstruction(p.v),
    'Photorealistic studio product photograph on a seamless white background, same camera angle as the original, soft even light, sharp focus.',
    'No text, no logo, no watermark, no human.',
  ].join(' ')
}

// ── 컨셉 촬영 · 디자인 다음 단계 ────────────────────────────────────
// 가상 모델 착용컷과, 무드에 맞는 스튜디오·로케이션 컨셉컷을 만든다.
// MICAM 프레스킷의 컨셉 이미지들이 이 자리에 오는 것들이다.

export interface ConceptPersona {
  id: string
  label: string
  brief: string
}

/** 가상 인물 설정. 얼굴을 특정 실존 인물로 만들지 않도록 일반 서술만 쓴다. */
export const PERSONAS: Record<Category, ConceptPersona[]> = {
  jewelry: [
    { id: 'studio', label: 'Studio muse', brief: 'a woman in her twenties, elegant neck and shoulder line, simple slip dress in a neutral tone, hair pulled back' },
    { id: 'artisan', label: 'Quiet artisan', brief: 'a person in their thirties, hands in frame, rolled sleeves, unpolished natural setting' },
  ],
}

export interface ConceptShot {
  key: string
  label: string
  build: (subject: string, persona: ConceptPersona, mood: string, spot: string) => string
}

/** 컨셉 촬영 컷 목록. 착용컷 → 스튜디오 → 로케이션 순으로 쓰인다. */
export const CONCEPT_SHOTS: ConceptShot[] = [
  {
    key: 'fit_full',
    label: 'Virtual fitting',
    build: (subject, p, mood, spot) => [
      'Keep this exact product: same design, materials, proportions, colour and hardware.',
      `Place it on a model: ${p.brief}. The piece is ${spot}.`,
      'Editorial campaign frame, the product clearly visible and in sharp focus, natural pose, plain studio backdrop with soft directional light.',
      mood ? `Mood: ${mood}.` : '',
      `Photorealistic fashion photography. It goes ${spot} and nowhere else.`,
      'Do not redesign the product. No text, no logo, no watermark.',
    ].filter(Boolean).join(' '),
  },
  {
    key: 'studio_still',
    label: 'Studio concept',
    build: (subject, _p, mood) => [
      'Keep this exact product: same design, materials, proportions and colour.',
      `Restage it as a concept still life: the ${subject} on a sculpted plinth in a studio set, coloured seamless backdrop, one hard directional light with a soft fill, a long clean shadow, a single prop echoing the mood.`,
      mood ? `Mood: ${mood}.` : '',
      'High-end editorial product photography, shallow depth of field. Do not redesign the product. No text, no logo, no watermark, no human.',
    ].filter(Boolean).join(' '),
  },
  {
    key: 'location',
    label: 'Location concept',
    build: (subject, _p, mood) => [
      'Keep this exact product: same design, materials, proportions and colour.',
      `Place the ${subject} in a real location that carries the mood: natural daylight, a textured surface underneath, the setting visible but out of focus behind.`,
      mood ? `The location should read as: ${mood}.` : '',
      'Photorealistic editorial photography, the product sharp and centred. Do not redesign the product. No text, no logo, no watermark, no human.',
    ].filter(Boolean).join(' '),
  },
]

export function conceptPrompt(
  category: Category, itemType: string, shotIndex: number, personaIndex: number, subject: string, mood: string,
): { prompt: string; label: string; persona: string } {
  const shot = CONCEPT_SHOTS[shotIndex % CONCEPT_SHOTS.length]
  const list = PERSONAS[category]
  const persona = list[personaIndex % list.length]
  const spot = wearSpot(category, itemType).on
  return { prompt: shot.build(subject, persona, mood, spot), label: shot.label, persona: persona.label }
}

// ── 조사 결과를 디자인 생성에 실어 보낸다 ───────────────────────────
// 트렌드를 조사해 놓고 이미지 프롬프트가 그것을 모르면, 조사한 의미가 없다.
// 매크로트렌드의 소재·디테일·팔레트를 짧은 구절로 눌러 담아 스펙 뒤에 붙인다.
export interface TrendClauseInput {
  macroName?: string
  materials?: string[]
  details?: string[]
  colors?: { name: string; hex: string }[]
  keySpec?: string
  /** 조사에서 확정된 신호 키워드 · 도시에가 늦거나 실패해도 이것만은 프롬프트에 실린다 */
  signals?: string[]
}

export function trendPromptClause(t: TrendClauseInput | null): string {
  if (!t) return ''
  const bits: string[] = []
  if (t.keySpec) bits.push(t.keySpec)
  if (t.signals?.length) bits.push(`observed market signals to answer: ${t.signals.slice(0, 4).join(', ')}`)
  if (t.materials?.length) bits.push(`season materials: ${t.materials.slice(0, 3).join(', ')}`)
  if (t.details?.length) bits.push(`season details: ${t.details.slice(0, 3).join(', ')}`)
  if (t.colors?.length) bits.push(`season palette: ${t.colors.slice(0, 3).map(c => `${c.name} ${c.hex}`).join(', ')}`)
  if (!bits.length) return ''
  return `It should read as part of the ${t.macroName ?? 'season'} direction: ${bits.join('; ')}.`
}

// ── 리포트 아트 · 문서를 읽고 싶게 만드는 그림 ────────────────────────
// 조사 사진(경쟁 제품·베스트셀러)과는 역할이 다르다. 그쪽은 증거라 손대면 안 되고,
// 이쪽은 표지와 섹션을 여는 무드컷이다. 제품을 그리지 않는다 — 제품을 그리면
// 독자가 그것을 이 분석의 결과물로 오해한다.
export function reportArtPrompt(kind: 'cover' | 'section', opts: {
  season?: string; title?: string; palette?: { name: string; hex: string }[]; mood?: string
}): string {
  const colours = (opts.palette ?? []).slice(0, 4).map(c => `${c.name} (${c.hex})`).join(', ')
  const common = [
    'Editorial art for a jewellery season report.',
    'Abstract still life: light, texture and material only.',
    'No jewellery, no products, no people, no hands, no text, no logo, no watermark.',
    colours ? `Work in this palette: ${colours}.` : '',
    opts.mood ? `The mood reads as: ${opts.mood}.` : '',
    'Soft directional studio light, fine grain, generous negative space, matte finish.',
    'Composed so text can sit over the quiet half of the frame.',
  ]
  return kind === 'cover'
    ? [...common, `A wide, calm opening image for the ${opts.season ?? 'season'} report.`,
       'Suggest metal and stone through surfaces: brushed sheet, polished curve, translucent mineral.'].filter(Boolean).join(' ')
    : [...common, `A narrow banner introducing the section "${opts.title ?? ''}".`,
       'One dominant material gesture, nothing else competing.'].filter(Boolean).join(' ')
}

/** 브랜드 로고를 생성 이미지 위에 실제로 얹는다.
 *  프롬프트로 그리게 하면 형태가 어긋나므로, 원본 파일을 서버에서 합성한다. */
export async function stampLogo(baseHash: string, brand: BrandIdentity): Promise<GenResult | null> {
  const logo = brand.logo
  if (!logo?.dataUrl || logo.placement === 'none') return null
  const r = await fetch('/api/image/logo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseHash, dataUrl: logo.dataUrl, placement: logo.placement, scale: logo.scale,
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || `logo ${r.status}`)
  return j
}


// ── 3D 모델 · Tripo ─────────────────────────────────────────────────
// 이미 만들어 둔 멀티뷰(측면·3/4·탑, 주얼리는 정면·45도·디테일)를 그대로 넘긴다.
// 한 장으로 만드는 것보다 여러 각도를 주는 쪽이 형태가 훨씬 정확하다.
export interface ModelResult {
  hash: string
  url: string
  format: string
  views: number
  cached: boolean
  note?: string
}

export async function modelProbe(): Promise<{ available: boolean; reason?: string }> {
  const r = await fetch('/api/model/probe')
  return r.json()
}

export async function generateModel(hashes: string[], meta: {
  subject?: string; category?: string; itemType?: string
}): Promise<ModelResult> {
  const r = await fetch('/api/model/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashes, ...meta }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || `model ${r.status}`)
  return j
}
