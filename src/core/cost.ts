/* 제작 원가 추정 ─────────────────────────────────────────────────────
   페르소나 QA 에서 가장 많이(11명 중 9명) 나온 지적이 "이 가격에 만들 수 있는지
   확인할 방법이 없다" 였다. 모델에게 원가를 물어보면 그럴듯한 숫자를 지어낸다 —
   같은 디자인을 두 번 물으면 다른 값이 나온다. 그래서 여기서는 계산만 한다.

   입력은 디자인 생성이 함께 내놓는 제작 사양(spec) 하나뿐이고,
   모든 단가는 아래 표에 모여 있다. 표를 바꾸면 결과가 바뀌고, 그 외에는 바뀌지 않는다.

   추정치라는 사실을 숨기지 않는다:
    · 중량은 모델이 어림한 범위라 원가도 범위로 나온다
    · 시세는 아래 PRICED_AT 시점의 참고값이다. 실제 매입가를 넣어야 맞는다
    · 계산에 쓴 값은 breakdown 에 전부 남는다 — 화면에서 그대로 보여 준다 */

/** 아래 단가표를 만든 시점 · 화면에 이 날짜를 함께 띄운다 */
export const PRICED_AT = '2026-08'

/** 금속 단가 (USD/g) · 합금 함량과 정련비를 반영한 지금 시세의 어림값.
 *  실제 거래처 매입가로 바꿔 쓰는 것이 맞다 — 시세는 매일 움직인다. */
export const METAL_USD_G: Record<string, number> = {
  // 패션 주얼리는 귀금속만 쓰지 않는다. 스틸·티타늄이 빠져 있어서
  // 실측으로 데모 샘플 두 건이 "금속 규격을 읽지 못했습니다" 로 막혔다.
  steel316: 0.02,
  titanium: 0.06,
  brass: 0.03,
  silver925: 1.25,
  gold10k: 46,
  gold14k: 64,
  gold18k: 82,
  platinum950: 38,
}

/** 사양의 금속 표기를 위 표의 열쇠로 맞춘다 · 표기가 제각각이라 넉넉히 받는다 */
/** 소재를 가리키는 말과 그것이 뜻하는 열쇠 · 아래에서 "가장 먼저 나온 것" 을 고른다 */
const METAL_WORDS: Array<[RegExp, keyof typeof METAL_USD_G]> = [
  [/plat|pt950|pt900|백금|플래티|플레티|팔라듐|palladium/g, 'platinum950'],
  [/18k|k18|\b750\b/g, 'gold18k'],
  [/14k|k14|\b585\b/g, 'gold14k'],
  [/10k|k10|9k|k9|\b417\b|\b375\b/g, 'gold10k'],
  [/925|sterling|스털링/g, 'silver925'],
  [/316|스테인|stainless|서지컬|surgical/g, 'steel316'],
  [/티타늄|titanium/g, 'titanium'],
  [/brass|bronze|황동|신주|진유/g, 'brass'],
  // 규격 없이 색만 적힌 것 · 위의 어느 것도 없을 때만 쓰인다
  [/실버|silver/g, 'silver925'],
  [/골드|gold|금/g, 'gold14k'],
]

/** 사양의 금속 표기에서 몸체 소재를 읽는다.
 *
 *  두 가지가 조용히 틀렸다:
 *   · 백금·도금·황금이 모두 '금' 을 품어서, 뭉뚱그린 규칙을 먼저 두면 백금이 금값이 됐다
 *   · "316L stainless steel 중심 실버 톤" 이 실버로, "메인 925 실버, 포인트 14K" 가 14K 로 읽혔다
 *
 *  그래서 규칙 순서가 아니라 **글에서 먼저 나온 소재** 를 고른다. 사양을 쓸 때
 *  몸체를 앞에 적게 해 두었으므로, 먼저 나온 것이 몸체다.
 *  도금은 소재가 아니라 표면이라 세기 전에 지운다 — 안 그러면 황동이 금값이 된다. */
export function metalKey(metal: string): keyof typeof METAL_USD_G | '' {
  const s = String(metal ?? '').toLowerCase()
    // '골드 도금' · 'gold plated' 는 표면이다. 지우고 나서 몸체를 찾는다.
    .replace(/(골드|실버|로듐|로즈골드|gold|silver|rhodium)\s*(도금|코팅|plated|plating|coating|vermeil|버메일)/g, ' ')
    .replace(/(도금|plated|plating)\s*(골드|실버|gold|silver)/g, ' ')

  let best: { at: number; key: keyof typeof METAL_USD_G } | null = null
  for (const [rx, key] of METAL_WORDS) {
    rx.lastIndex = 0
    const m = rx.exec(s)
    if (m && (!best || m.index < best.at)) best = { at: m.index, key }
  }
  return best?.key ?? ''
}

/** 스톤 한 알 단가 (USD) · 3mm 기준값. 크기는 부피를 따라가므로 지름의 세제곱에 가깝다.
 *  천연석은 등급으로 값이 수십 배 갈려서 여기 넣지 않는다 — 견적을 받아야 한다. */
const STONE_BASE_3MM: Record<string, number> = {
  cz: 0.25,
  moissanite: 22,
  labdiamond: 45,
  labsapphire: 4,
  pearl: 3,
}
export function stoneKey(type: string): keyof typeof STONE_BASE_3MM | 'natural' | '' {
  const s = type.toLowerCase().replace(/\s/g, '')
  if (/cz|큐빅|지르코|zirconia/.test(s)) return 'cz'
  if (/moissan|모아사|모이사/.test(s)) return 'moissanite'
  if (/lab.*diamond|랩.*다이아|합성다이아/.test(s)) return 'labdiamond'
  if (/lab.*(sapph|ruby|emerald)|합성(사파|루비|에메)/.test(s)) return 'labsapphire'
  if (/pearl|진주/.test(s)) return 'pearl'
  if (/diamond|다이아|sapph|사파|ruby|루비|emerald|에메/.test(s)) return 'natural'
  return 'cz'                                   // 종류를 안 적었으면 가장 싼 것으로 잡는다
}

/** 해당 없음 표기 · 모델이 빈 칸을 지우는 대신 이렇게 적는다 */
const NONE_RX = /없음|해당\s*없|not\s*applicable|^n\/?a$|none|불요|불필요/i

/** 부속 단가 (USD/개) · 은·황동 기준. 금은 금속값이 따로 붙는다. */
const FINDING_USD: Array<[RegExp, number]> = [
  [/클래스프|clasp|lobster|잠금|toggle/i, 2.2],
  [/이어.*백|earring back|butterfly|라푸세트|push.?back/i, 0.6],
  [/베일|bail/i, 1.1],
  [/점프.*링|jump ?ring|오링/i, 0.15],
  [/체인|chain/i, 3.5],
  [/포스트|post|귀걸이.*침/i, 0.5],
  [/후프|hoop|힌지|hinge/i, 1.8],
]

/** 공임 (USD) · 소량 생산 기준. 대량이면 내려가지만 그건 발주 조건이라 여기서 모른다. */
const LABOR = {
  casting: 9,           // 주조 · 왁스 소각까지
  polishing: 5,         // 연마·마무리
  settingProng: 1.6,    // 스톤 한 알당 · 프롱
  settingBezel: 2.6,    // 스톤 한 알당 · 베젤·파베
  plating: 4.5,         // 도금 한 번
  assembly: 2,          // 부속 조립
}

/** 금속 손실률 · 주조·연마에서 깎여 나가는 몫 */
const SCRAP = 0.1

export interface CostLine { label: string; usd: number; how: string }
export interface CostEstimate {
  /** 계산이 가능했는가 · 사양이 비면 false */
  ok: boolean
  /** 못 한 이유 · ok 가 true 면 빈 문자열 */
  blocked: string
  low: number
  high: number
  lines: CostLine[]
  /** 견적을 따로 받아야 하는 항목 · 천연석 등 */
  quotes: string[]
  pricedAt: string
}

export interface SpecStone { type: string; cut: string; mm: string; count: number }
export interface SpecFinding { name: string; spec: string }
export interface MakeSpec {
  dims: Array<{ name: string; mm: string }>
  metal: string
  plating: string
  stones: SpecStone[]
  findings: SpecFinding[]
  weight_g: { min: number; max: number }
  process: string[]
  note: string
}

const mmOf = (s: string): number => {
  const nums = String(s).match(/[\d.]+/g)
  if (!nums?.length) return 0
  const v = nums.map(Number).filter(n => n > 0)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
}

/** 사양에서 원가를 계산한다. AI 를 부르지 않는다 — 같은 사양이면 항상 같은 값이다. */
export function estimateCost(spec: MakeSpec | undefined, metalUsdG = METAL_USD_G): CostEstimate {
  const empty: CostEstimate = { ok: false, blocked: '', low: 0, high: 0, lines: [], quotes: [], pricedAt: PRICED_AT }
  if (!spec) return { ...empty, blocked: '제작 사양이 없습니다' }

  const mk = metalKey(spec.metal)
  if (!mk) return { ...empty, blocked: `금속 규격을 읽지 못했습니다 (${spec.metal || '빈 값'})` }
  const wMin = Number(spec.weight_g?.min) || 0
  const wMax = Number(spec.weight_g?.max) || wMin
  if (wMin <= 0) return { ...empty, blocked: '금속 중량 추정이 없습니다' }

  const lines: CostLine[] = []
  const quotes: string[] = []
  let low = 0, high = 0
  const add = (label: string, lo: number, hi: number, how: string) => {
    low += lo; high += hi
    lines.push({ label, usd: (lo + hi) / 2, how })
  }

  // ── 금속 ──
  const g = metalUsdG[mk]
  const mLo = wMin * g * (1 + SCRAP)
  const mHi = wMax * g * (1 + SCRAP)
  add('금속', mLo, mHi,
    `${spec.metal} ${wMin === wMax ? `${wMin}g` : `${wMin}~${wMax}g`} × ${g}달러/g · 손실 ${SCRAP * 100}% 포함`)

  // ── 스톤 ──
  let stoneCount = 0
  for (const st of spec.stones ?? []) {
    const n = Math.max(0, Number(st.count) || 0)
    if (!n || NONE_RX.test(`${st.type} ${st.cut}`)) continue
    stoneCount += n
    const k = stoneKey(st.type)
    if (k === 'natural') {
      quotes.push(`${st.type} ${st.mm} ${n}알 · 등급에 따라 값이 크게 달라 견적이 필요합니다`)
      continue
    }
    const mm = mmOf(st.mm) || 3
    const each = STONE_BASE_3MM[k] * Math.pow(mm / 3, 3)
    add(`스톤 · ${st.type} ${st.mm}`, each * n, each * n * 1.4,
      `${n}알 × ${each.toFixed(2)}달러 (3mm ${STONE_BASE_3MM[k]}달러 기준, 지름 세제곱)`)
  }

  // ── 부속 ──
  // 모델은 해당 없는 칸을 지우지 않고 "없음(반지)" 처럼 적어 둔다. 그것까지 값을 매기면
  // 반지 하나에 클래스프와 베일 값이 붙는다 — 실측으로 3.3달러가 잘못 얹혔다.
  let fittedFindings = 0
  for (const f of spec.findings ?? []) {
    const text = `${f.name} ${f.spec}`
    if (NONE_RX.test(text)) continue
    const hit = FINDING_USD.find(([rx]) => rx.test(text))
    if (!hit) continue
    fittedFindings++
    add(`부속 · ${f.name}`, hit[1], hit[1] * 1.3, `${f.spec || '표준 규격'} 기준`)
  }

  // ── 공임 ──
  add('주조', LABOR.casting, LABOR.casting * 1.3, '소량 생산 기준 · 왁스 소각 포함')
  add('연마·마무리', LABOR.polishing, LABOR.polishing * 1.3, '')
  if (stoneCount) {
    const bezel = (spec.stones ?? []).some(s => /베젤|bezel|파베|pave/i.test(s.cut))
    const rate = bezel ? LABOR.settingBezel : LABOR.settingProng
    add('스톤 세팅', rate * stoneCount, rate * stoneCount * 1.3,
      `${stoneCount}알 × ${rate}달러 (${bezel ? '베젤·파베' : '프롱'})`)
  }
  if (spec.plating?.trim()) add('도금', LABOR.plating, LABOR.plating * 1.4, spec.plating)
  if (fittedFindings) add('조립', LABOR.assembly, LABOR.assembly * 1.3, `부속 ${fittedFindings}종`)

  return { ok: true, blocked: '', low, high, lines, quotes, pricedAt: PRICED_AT }
}

/** 판매가 제안 · 유통 방식마다 배수가 다르다. 원가에 곱하기만 한다. */
export const MARKUP = {
  wholesale: [2.2, 2.8] as const,
  dtc: [3.2, 4.2] as const,
  retail: [5, 6.5] as const,
}
export function retailBand(c: CostEstimate, kind: keyof typeof MARKUP = 'dtc'): [number, number] {
  const [lo, hi] = MARKUP[kind]
  return [c.low * lo, c.high * hi]
}

// ── 목표 가격 대비 판정 ──────────────────────────────────────────────
// 원가를 내놓고 끝내면 "그래서 내 가격에 맞느냐" 는 여전히 사람이 계산해야 한다.
// 페르소나 9명이 지적한 것은 숫자가 없다는 것이 아니라 판단을 못 한다는 것이었다.

/** 환율 · 참고값이다. 금속 시세와 같은 성격이라 같은 자리에 둔다. */
export const KRW_PER_USD = 1350
export const EUR_PER_USD = 0.92

/** 자유 입력으로 적힌 목표 가격을 달러 범위로 읽는다.
 *  "12만원대" · "30만원 이하" · "$50-80" · "80~120유로" 같은 표기를 받는다.
 *  못 읽으면 null 을 준다 — 지어내지 않는다. */
export function parsePriceTarget(text?: string): { lo: number; hi: number; shown: string } | null {
  if (!text?.trim()) return null
  const s = text.replace(/,/g, '').trim()
  const isKrw = /원|₩|krw/i.test(s)
  const isEur = /유로|€|eur/i.test(s)
  const perUsd = isKrw ? KRW_PER_USD : isEur ? EUR_PER_USD : 1
  const man = /만\s*원|만원|만/.test(s)                    // 만 단위 표기

  const nums = (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter(n => n > 0)
  if (!nums.length) return null
  const scale = (n: number) => (man ? n * 10_000 : n) / perUsd

  let lo: number, hi: number
  if (nums.length >= 2 && /[-~–]/.test(s)) { lo = scale(nums[0]); hi = scale(nums[1]) }
  else if (/이하|미만|under|below|까지/.test(s)) { lo = 0; hi = scale(nums[0]) }
  else if (/이상|초과|over|above|부터/.test(s)) { lo = scale(nums[0]); hi = Infinity }
  else if (/대\b|대$|전후|안팎|정도|쯤/.test(s)) {          // "12만원대" 는 12만~13만
    lo = scale(nums[0]); hi = man ? scale(nums[0] + 1) : scale(nums[0]) * 1.1
  } else { lo = scale(nums[0]) * 0.9; hi = scale(nums[0]) * 1.1 }
  if (!(hi > 0)) return null
  return { lo, hi, shown: text.trim() }
}

export type TargetVerdict = 'inside' | 'over' | 'under' | 'unknown'
export interface TargetCheck {
  verdict: TargetVerdict
  /** 견준 두 값 · 말은 화면에서 붙인다. 여기에 한국어를 넣으면 영어 화면으로 새어 나간다. */
  note: string
  band?: [number, number]
  target?: { lo: number; hi: number; shown: string }
}

/** 목표 가격(소비자가)과 제안 판매가를 견준다.
 *  원가가 아니라 판매가로 견주는 것이 맞다 — 사람이 적는 목표는 파는 값이다. */
export function checkTarget(c: CostEstimate, targetText?: string, kind: keyof typeof MARKUP = 'dtc'): TargetCheck {
  const tg = parsePriceTarget(targetText)
  if (!c.ok || !tg) return { verdict: 'unknown', note: '', target: tg ?? undefined }
  const [rLo, rHi] = retailBand(c, kind)
  const money = (n: number) => (n === Infinity ? '∞' : `$${n < 10 ? n.toFixed(1) : Math.round(n)}`)
  // 말은 넣지 않는다 · 견준 두 값만 남긴다
  const note = `${money(rLo)}–${money(rHi)} vs ${tg.shown} (${money(tg.lo)}–${money(tg.hi)})`
  const band: [number, number] = [rLo, rHi]
  if (rLo > tg.hi) return { verdict: 'over', note, band, target: tg }
  if (rHi < tg.lo) return { verdict: 'under', note, band, target: tg }
  return { verdict: 'inside', note, band, target: tg }
}

// ── 표기 ────────────────────────────────────────────────────────────
// 화면과 덱이 같은 규칙을 써야 한다. 따로 쓰다가 한쪽만 "1.2 이상 mm" 가 됐다.

/** 치수 표기 · 이미 단위가 있거나 숫자로 끝나지 않으면 mm 를 붙이지 않는다.
 *  "1.2 이상" 에 mm 를 뒤에 붙이면 "1.2 이상 mm" 가 되어 어순이 깨진다. */
export function dimText(mm: string): string {
  const v = String(mm ?? '').trim()
  if (!v) return ''
  if (/mm|㎜|cm|인치|inch/i.test(v)) return v
  return /[\d.]$/.test(v) ? `${v} mm` : v
}

/** 스톤 한 줄 · 비어 있는 칸은 구분자까지 함께 지운다.
 *  안 그러면 "청록 사파이어 ·  · 2.3 · 1" 처럼 가운뎃점만 남는다. */
export function stoneText(s: SpecStone): string {
  const size = dimText(s.mm)
  return [s.type, s.cut, size, s.count ? `${s.count}` : '']
    .map(x => String(x ?? '').trim()).filter(Boolean).join(' · ')
}
