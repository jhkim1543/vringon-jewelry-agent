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
/** 순금(24K) 시세 · 금 합금은 전부 여기서 유도한다.
 *  값을 따로 적어 두다가 "18K 가 24K 보다 비싸다" 같은 앞뒤 안 맞는 표가 나왔다.
 *  하나만 고치면 10K·14K·18K 가 함께 움직인다. 거래처 시세로 바꿔 쓰는 자리다. */
export const GOLD_24K_USD_G = 105

/** 합금 함량 · 세공 프리미엄(정련·압연·손실 관리) 15% 를 얹는다 */
const KARAT = { gold10k: 0.417, gold14k: 0.585, gold18k: 0.75 } as const
const FABRICATION = 1.15
const goldAt = (k: keyof typeof KARAT) => Math.round(GOLD_24K_USD_G * KARAT[k] * FABRICATION)

export const METAL_USD_G: Record<string, number> = {
  // 패션 주얼리는 귀금속만 쓰지 않는다. 스틸·티타늄이 빠져 있어서
  // 실측으로 데모 샘플 두 건이 "금속 규격을 읽지 못했습니다" 로 막혔다.
  steel316: 0.02,
  titanium: 0.06,
  brass: 0.03,
  silver925: 1.25,
  gold10k: goldAt('gold10k'),
  gold14k: goldAt('gold14k'),
  gold18k: goldAt('gold18k'),
  platinum950: 38,
}

/** 이 금속값이 어디서 나왔는지 한 줄 · 화면에 그대로 띄운다 */
export function metalBasis(key: string, m: Money = moneyIn('USD')): string {
  if (key in KARAT) {
    const k = key as keyof typeof KARAT
    return `24K ${m(GOLD_24K_USD_G)}/g × 순도 ${Math.round(KARAT[k] * 1000)}/1000 × 세공 ${Math.round((FABRICATION - 1) * 100)}%`
  }
  return ''
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
/** 알이 작아도 이 아래로는 안 내려간다 · 지름 세제곱만 쓰면 1mm 짜리가 1센트가 된다.
 *  작은 멜레는 재료비가 아니라 절삭·선별·취급비가 값을 정한다 (현장 지적으로 넣었다). */
const STONE_FLOOR: Record<string, number> = {
  cz: 0.05, moissanite: 3, labdiamond: 4, labsapphire: 0.8, pearl: 0.5,
}
export function stoneKey(type: string): keyof typeof STONE_BASE_3MM | 'natural' | '' {
  const s = type.toLowerCase().replace(/\s/g, '')
  // 조사·설계가 어느 언어로든 나온다. 일본어 가타카나를 못 읽어 "ダイヤモンド" 가
  // 가장 싼 CZ(개당 0.05달러)로 떨어졌다 — 다이아 세 알이 15센트로 계산됐다.
  if (/cz|큐빅|지르코|zirconia|ジルコニア|锆石|锆/.test(s)) return 'cz'
  if (/moissan|모아사|모이사|モアッサ|モアサ|莫桑/.test(s)) return 'moissanite'
  const grown = /lab|랩|양식|인공|합성|배양|created|synthetic|cultured|ラボ|人工|合成|培養|培育|实验室/.test(s)
  const dia = /diamond|다이아|ダイヤ|钻石|鑽石/.test(s)
  const col = /sapph|사파|ruby|루비|emerald|에메|spinel|스피넬|サファイア|ルビー|エメラルド|スピネル|蓝宝|红宝|祖母绿|尖晶/.test(s)
  if (grown && dia) return 'labdiamond'
  if (grown && col) return 'labsapphire'
  if (/pearl|진주|パール|真珠|珍珠/.test(s)) return 'pearl'
  if (dia || col) return 'natural'
  // 못 알아보는 이름은 가장 싼 것으로 떨어뜨리지 않는다 · 조용히 원가를 줄여 버린다.
  // "未指定"(미지정) 같은 것도 여기로 온다 — 모르면 모른다고 하고 견적으로 넘긴다.
  return ''
}

/** 진짜 도금인가 · "细砂雾面(고운 무광)" 같은 표면 마감이 plating 칸에 적혀 오는 일이 있다.
 *  그것까지 도금 공임을 매기면 없는 공정에 값이 붙는다 (현장 지적). */
const PLATING_RX = /도금|plated|plating|코팅|coating|ip|pvd|로듐|rhodium|vermeil|버메일|镀|금장|은장/i

/** 해당 없음 표기 · 모델이 빈 칸을 지우는 대신 이렇게 적는다 */
const NONE_RX = /없음|해당\s*없|not\s*applicable|^n\/?a$|none|불요|불필요/i

/** 부속 단가 (USD/개) · 은·황동 기준. 금은 금속값이 따로 붙는다. */
const FINDING_USD: Array<[RegExp, number]> = [
  [/클래스프|clasp|lobster|잠금|toggle|クラスプ|留め具/i, 2.2],
  [/이어.*백|earring back|butterfly|라푸세트|push.?back|clutch|キャッチ|ピアスキャッチ/i, 0.6],
  [/베일|bail|バチカン/i, 1.1],
  [/점프.*링|jump ?ring|오링/i, 0.15],
  [/체인|chain|チェーン/i, 3.5],
  [/포스트|post|귀걸이.*침|ポスト/i, 0.5],
  [/후프|hoop|힌지|hinge/i, 1.8],
]

/** 사서 붙이는 부속이 아니라 몸체에 깎아 낸 형상 · 값을 따로 매기면 안 된다.
 *  실측: "chain interface slots"(체인이 걸리는 홈)가 체인 부속 3.5달러로 계산됐다. */
const INTEGRATED_RX = /slot|interface|integrated|일체|일체형|통짜|machined|성형|홈|groove|한몸|一体/i

/** 공임 (USD) · 소량 생산 기준. 대량이면 내려가지만 그건 발주 조건이라 여기서 모른다. */
const LABOR = {
  polishing: 5,         // 연마·마무리
  settingProng: 1.6,    // 스톤 한 알당 · 프롱
  settingBezel: 2.6,    // 스톤 한 알당 · 베젤·파베
  plating: 4.5,         // 도금 한 번
  assembly: 2,          // 부속 조립
}

/** 성형 방식 · 공정에 적힌 대로 값을 매긴다.
 *  전에는 무엇을 쓰든 "주조 9달러" 를 얹었다. 공정이 "CNC milling" 인데 주조비가 붙고,
 *  "press forming" 인데 주조비가 붙었다 — 독일·태국 두 사람이 각각 그 모순을 짚었다. */
const FORMING: Array<[RegExp, { label: string; usd: number; how: string }]> = [
  [/cnc|밀링|milling|절삭|선반|turning|machin|加工|切削/i,
    { label: '절삭 가공', usd: 14, how: 'CNC · 소량 기준 · 셋업 별도' }],
  [/레이저|laser|판금|sheet|절곡|bend|프레스|press|스탬핑|stamping|도밍|doming|打刻|冲压/i,
    { label: '성형·가공', usd: 5, how: '프레스·레이저 · 금형비는 별도 견적' }],
  [/주조|캐스팅|casting|로스트왁스|lost.?wax|鋳造|铸造/i,
    { label: '주조', usd: 9, how: '로스트왁스 · 소량 생산 기준 · 왁스 소각 포함' }],
]
/** 공정 글에서 성형 방식을 고른다 · 아무것도 못 찾으면 주조로 본다(주얼리에서 가장 흔하다) */
function formingOf(process: string[]): { label: string; usd: number; how: string; guessed: boolean } {
  const text = (process ?? []).join(' ')
  for (const [rx, v] of FORMING) if (rx.test(text)) return { ...v, guessed: false }
  return { label: '주조', usd: 9, how: '로스트왁스 · 소량 생산 기준', guessed: true }
}

/** 금속 손실률 · 주조(3~6%)와 연마·마무리(1~3%)에서 깎여 나가는 몫을 합쳐 잡은 값.
 *  회수·재정련을 하면 실질은 이보다 낮다 — 거래처 조건에 맞춰 고칠 자리다. */
const SCRAP = 0.08

/** 원가 한 줄 · 반드시 범위로 남긴다. 줄의 합이 곧 전체 범위여야 표를 믿을 수 있다. */
export interface CostLine { label: string; lo: number; hi: number; how: string }
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
  /** 한 쌍 기준으로 두 배 올렸는가 (귀걸이) */
  pair?: boolean
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
  /** 그 중량이 무엇을 포함하는가 · "한 짝 기준, 이어백 제외" 처럼.
   *  귀걸이가 낱개인지 쌍인지, 목걸이가 체인을 포함하는지 안 밝히면 원가를 비교할 수 없다.
   *  공방 오너가 실제로 이것 때문에 "비교 불가" 판정을 냈다. */
  weight_basis?: string
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
export function estimateCost(
  spec: MakeSpec | undefined,
  /** 계산 근거를 적을 통화 · 금액은 유로인데 근거만 달러면 읽는 사람이 다시 환산해야 한다 */
  m: Money = moneyIn('USD'),
  metalUsdG = METAL_USD_G,
): CostEstimate {
  const empty: CostEstimate = { ok: false, blocked: '', low: 0, high: 0, lines: [], quotes: [], pricedAt: PRICED_AT }
  if (!spec) return { ...empty, blocked: '제작 사양이 없습니다' }

  const mk = metalKey(spec.metal)
  if (!mk) return { ...empty, blocked: `금속 규격을 읽지 못했습니다 (${spec.metal || '빈 값'})` }
  const wMin = Number(spec.weight_g?.min) || 0
  const wMax = Number(spec.weight_g?.max) || wMin
  if (wMin <= 0) return { ...empty, blocked: '금속 중량 추정이 없습니다' }

  const lines: CostLine[] = []
  const quotes: string[] = []
  // 천연석은 한 줄에 모은다 · 알마다 같은 문장을 되풀이하면 인쇄본에서 넘쳐 잘린다
  const natural: string[] = []
  let low = 0, high = 0
  // 줄마다 범위를 그대로 남긴다. 전에는 줄에 중간값을 적고 합계만 범위로 냈는데,
  // 그러면 "금속 $722 · 합계 $557~922" 처럼 한 줄이 합계 하한을 넘는 표가 나온다.
  // 원가표에서 줄이 합계와 안 맞으면 그 표는 통째로 못 믿는다 — 실제로 그 지적을 받았다.
  const add = (label: string, lo: number, hi: number, how: string) => {
    low += lo; high += hi
    lines.push({ label, lo, hi, how })
  }

  // ── 금속 ──
  const g = metalUsdG[mk]
  const mLo = wMin * g * (1 + SCRAP)
  const mHi = wMax * g * (1 + SCRAP)
  const basis = metalBasis(mk, m)
  add('금속', mLo, mHi,
    `${spec.metal} ${wMin === wMax ? `${wMin}g` : `${wMin}~${wMax}g`} × ${m(g)}/g${
      basis ? ` (${basis})` : ''} · 주조·연마 손실 ${Math.round(SCRAP * 100)}% 포함`)

  // ── 스톤 ──
  let stoneCount = 0
  for (const st of spec.stones ?? []) {
    const n = Math.max(0, Number(st.count) || 0)
    if (!n || NONE_RX.test(`${st.type} ${st.cut}`)) continue
    stoneCount += n
    const k = stoneKey(st.type)
    if (k === 'natural') {
      natural.push(`${st.type} ${dimText(st.mm)} ${n}알`)
      continue
    }
    if (!k) {
      quotes.push(`${st.type || '종류 미상'} ${dimText(st.mm)} ${n}알 · 종류를 읽지 못해 값을 매기지 않았습니다`)
      continue
    }
    const mm = mmOf(st.mm) || 3
    const each = Math.max(STONE_FLOOR[k], STONE_BASE_3MM[k] * Math.pow(mm / 3, 3))
    add(`스톤 · ${st.type} ${st.mm}`, each * n, each * n * 1.4,
      `${n}알 × ${m(each)} (3mm ${m(STONE_BASE_3MM[k])} 기준, 지름 세제곱${
        each === STONE_FLOOR[k] ? ` · 작은 알 최저 ${m(STONE_FLOOR[k])} 적용` : ''})`)
  }

  // ── 부속 ──
  // 모델은 해당 없는 칸을 지우지 않고 "없음(반지)" 처럼 적어 둔다. 그것까지 값을 매기면
  // 반지 하나에 클래스프와 베일 값이 붙는다 — 실측으로 3.3달러가 잘못 얹혔다.
  let fittedFindings = 0
  for (const f of spec.findings ?? []) {
    const text = `${f.name} ${f.spec}`
    if (NONE_RX.test(text)) continue
    if (INTEGRATED_RX.test(text)) continue      // 깎아 낸 형상은 사 오는 부속이 아니다
    const hit = FINDING_USD.find(([rx]) => rx.test(text))
    if (!hit) continue
    fittedFindings++
    add(`부속 · ${f.name}`, hit[1], hit[1] * 1.3, `${f.spec || '표준 규격'} 기준`)
  }

  // ── 공임 ──
  const form = formingOf(spec.process)
  add(form.label, form.usd, form.usd * 1.3,
    form.how + (form.guessed ? ' · 공정에 성형 방식이 적혀 있지 않아 주조로 봤습니다' : ''))
  add('연마·마무리', LABOR.polishing, LABOR.polishing * 1.3, '')
  if (/프레스|press|스탬핑|stamping|도밍|doming|冲压/i.test((spec.process ?? []).join(' ')))
    quotes.push('프레스·성형 금형비는 수량에 따라 갈려 여기 넣지 않았습니다 · 별도 견적이 필요합니다')
  if (stoneCount) {
    // 세팅 방식은 cut 칸에만 적히지 않는다 · 공정과 스톤 설명 전체에서 찾는다.
    // 전에는 cut 만 봐서, 플러시·채널·에나멜 인레이인 디자인이 전부 프롱으로 잡혔다.
    const setText = [...(spec.stones ?? []).map(s => `${s.cut} ${s.type}`), ...(spec.process ?? [])].join(' ')
    const hard = /베젤|bezel|파베|pave|채널|channel|플러시|flush|집시|gypsy|마이크로|micro/i.test(setText)
    const rate = hard ? LABOR.settingBezel : LABOR.settingProng
    add('스톤 세팅', rate * stoneCount, rate * stoneCount * 1.3,
      `${stoneCount}알 × ${m(rate)} (${hard ? '베젤·파베·채널' : '프롱'})`)
    if (/에나멜|enamel|칠보|법랑|珐琅/i.test(setText))
      quotes.push('에나멜 공정이 있습니다 · 소성 횟수와 불량률에 따라 값이 달라져 견적이 필요합니다')
  }
  const plating = spec.plating?.trim() ?? ''
  if (plating && PLATING_RX.test(plating) && !NONE_RX.test(plating))
    add('도금', LABOR.plating, LABOR.plating * 1.4, plating)
  if (fittedFindings) add('조립', LABOR.assembly, LABOR.assembly * 1.3, `부속 ${fittedFindings}종`)

  if (natural.length)
    quotes.unshift(`${natural.join(' · ')} · 천연석은 등급으로 값이 갈려 견적이 필요합니다`)

  // 귀걸이는 한 쌍이 파는 단위다. 사양의 중량 기준이 "한 짝" 이면 여기서 두 배로 올린다 —
  // 안 그러면 한 짝 원가를 한 쌍 판매가와 견주게 되어 마진이 두 배로 부풀어 보인다.
  // 실측: 이어 포스트와 클러치가 한 개 값으로만 잡혀 있었다.
  // 부속 이름은 그 나라 말로 온다. 라틴자 post 만 보다가 한글 "포스트" 를 놓쳐
  // 귀걸이 한 쌍이 한 짝 값으로 나갔다 — 화면 실측에서 걸렸다.
  const EARRING_RX = /이어|귀걸이|귀고리|포스트|클러치|라푸세트|나비|earring|ear ?post|post|clutch|butterfly|ピアス|イヤ|ポスト|キャッチ|耳/i
  const isEarring = (spec.findings ?? []).some(f => EARRING_RX.test(`${f.name} ${f.spec}`))
    || EARRING_RX.test(spec.weight_basis ?? '')
  const perPiece = /한\s*짝|낱개|single|per piece|片方|각 한 개|one earring/i.test(spec.weight_basis ?? '')
  let pair = false
  if (isEarring && perPiece) {
    pair = true
    low *= 2; high *= 2
    for (const l of lines) { l.lo *= 2; l.hi *= 2 }
  }

  return { ok: true, blocked: '', low, high, lines, quotes, pair, pricedAt: PRICED_AT }
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

// ── 시장 가격 대조 ───────────────────────────────────────────────────
// 원가를 내고 판매가를 제안해도, 그 값이 시장에서 어느 자리인지 모르면 판단이 안 된다.
// 페르소나 재측정에서 다섯 사람이 같은 것을 다시 요구했다.
// 수집된 실제 판매가를 그대로 줄 세워 사분위를 낸다 — 모델에게 묻지 않는다.

/** 참고 환율 · 금속 시세와 같은 성격이라 같은 자리에 둔다 */
const FX_PER_USD: Record<string, number> = {
  USD: 1, KRW: KRW_PER_USD, EUR: EUR_PER_USD, JPY: 150, GBP: 0.79,
  CNY: 7.1, AED: 3.67, THB: 34, CAD: 1.36, AUD: 1.5, INR: 84,
}

/** 조사 모델은 통화 칸에 코드만 넣지 않는다 · 기호와 우리말이 섞여 온다.
 *  코드만 받다가 실측으로 표본 41건 중 31건("원" 31 · "€" 6 · "$" 6)을 버리고 있었다.
 *  네 건 중 세 건을 버린 "시장 가격대" 는 없느니만 못하다. */
const CURRENCY_ALIAS: Record<string, string> = {
  '원': 'KRW', '₩': 'KRW', '원화': 'KRW',
  '$': 'USD', 'US$': 'USD', '달러': 'USD', 'USD$': 'USD',
  '€': 'EUR', '유로': 'EUR',
  '£': 'GBP', '파운드': 'GBP',
  '¥': 'JPY', '엔': 'JPY', '円': 'JPY',
  '元': 'CNY', '위안': 'CNY', 'RMB': 'CNY', '¥CN': 'CNY',
  '฿': 'THB', 'د.إ': 'AED', 'DHS': 'AED', '₹': 'INR',
}

/** 통화 표기를 코드로 맞춘다 · 못 알아보면 빈 문자열 (지어내지 않는다) */
export function currencyCode(raw?: string): string {
  const v = String(raw ?? '').trim()
  if (!v) return ''
  const up = v.toUpperCase()
  if (FX_PER_USD[up]) return up
  if (CURRENCY_ALIAS[v]) return CURRENCY_ALIAS[v]
  if (CURRENCY_ALIAS[up]) return CURRENCY_ALIAS[up]
  // "12,000 원" 처럼 값이 섞여 온 것도 있다 · 아는 표기가 들어 있는지 본다
  for (const [sym, code] of Object.entries(CURRENCY_ALIAS)) if (v.includes(sym)) return code
  for (const code of Object.keys(FX_PER_USD)) if (up.includes(code)) return code
  return ''
}

export interface MarketBand {
  n: number
  /** 통화를 몰라 뺀 것 · 숨기지 않는다 */
  skipped: number
  p25: number
  p50: number
  p75: number
}

/** 수집된 제품 가격을 달러로 모아 사분위를 낸다. 표본이 5개 미만이면 내지 않는다 —
 *  세 개짜리 "시장 가격대" 는 없느니만 못하다. */
export function marketBand(items: Array<{ price?: number; currency?: string }>): MarketBand | null {
  const usd: number[] = []
  let skipped = 0
  for (const it of items ?? []) {
    const p = Number(it.price) || 0
    const fx = FX_PER_USD[currencyCode(it.currency)]
    if (p <= 0) continue
    if (!fx) { skipped++; continue }
    usd.push(p / fx)
  }
  if (usd.length < 5) return null
  usd.sort((a, b) => a - b)
  const at = (q: number) => usd[Math.min(usd.length - 1, Math.floor(usd.length * q))]
  return { n: usd.length, skipped, p25: at(0.25), p50: at(0.5), p75: at(0.75) }
}

export type MarketVerdict = 'below' | 'inside' | 'above'
/** 계산된 제안가가 시장 어디에 앉는가 */
export function placeInMarket(retail: [number, number], m: MarketBand): MarketVerdict {
  const mid = (retail[0] + retail[1]) / 2
  if (mid < m.p25) return 'below'
  if (mid > m.p75) return 'above'
  return 'inside'
}

// ── 수집 가격 분포 ───────────────────────────────────────────────────
// "상위 비중과 가격 히스토그램을 달라" 는 요구가 되풀이됐다. 모델에게 세어 달라고 하면
// "많이 보인다" 가 돌아온다 — 세는 것은 코드가 할 일이다.
// 원가 엔진과 같은 원칙: 수집된 값에서 계산만 하고, 못 세는 것은 안 세었다고 말한다.

export interface PriceBin { from: number; to: number; n: number }
export interface PriceStats {
  n: number
  skipped: number
  min: number
  max: number
  band: MarketBand
  bins: PriceBin[]
  /** 브랜드·샵별 중앙값 · 표본 3개 미만은 넣지 않는다 */
  byGroup: Array<{ name: string; n: number; median: number }>
}

/** 수집된 제품에서 가격 분포를 낸다 · 달러로 맞춘 뒤 센다 */
export function priceStats(
  items: Array<{ price?: number; currency?: string; brand?: string; shopName?: string }>,
  bins = 6,
): PriceStats | null {
  const rows: Array<{ usd: number; group: string }> = []
  let skipped = 0
  for (const it of items ?? []) {
    const p = Number(it.price) || 0
    const fx = FX_PER_USD[currencyCode(it.currency)]
    if (p <= 0) continue
    if (!fx) { skipped++; continue }
    rows.push({ usd: p / fx, group: it.brand || it.shopName || '' })
  }
  const band = marketBand(items)
  if (!band || rows.length < 5) return null

  const usd = rows.map(r => r.usd).sort((a, b) => a - b)
  const min = usd[0], max = usd[usd.length - 1]
  // 로그 눈금으로 나눈다. 등간격으로 자르면 11달러부터 5136달러까지가 한 구간에 들어가
  // 76건 중 64건이 첫 칸에 몰린다 — 그런 그래프는 아무것도 말해 주지 않는다.
  // 주얼리 가격은 몇 배씩 뛰지 몇 달러씩 뛰지 않는다.
  const lo = Math.log(Math.max(1, min)), hi = Math.log(Math.max(min + 1, max))
  const step = (hi - lo) / bins
  const out: PriceBin[] = Array.from({ length: bins }, (_, i) => ({
    from: Math.exp(lo + step * i), to: Math.exp(lo + step * (i + 1)), n: 0,
  }))
  out[bins - 1].to = max
  for (const v of usd) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((Math.log(Math.max(1, v)) - lo) / step)))
    out[i].n++
  }

  const groups = new Map<string, number[]>()
  for (const r of rows) {
    if (!r.group) continue
    if (!groups.has(r.group)) groups.set(r.group, [])
    groups.get(r.group)!.push(r.usd)
  }
  const byGroup = [...groups.entries()]
    .filter(([, v]) => v.length >= 3)
    .map(([name, v]) => {
      const s = [...v].sort((a, b) => a - b)
      return { name, n: s.length, median: s[Math.floor(s.length / 2)] }
    })
    .sort((a, b) => b.n - a.n)

  return { n: rows.length, skipped, min, max, band, bins: out, byGroup }
}

// ── 화면 통화 ────────────────────────────────────────────────────────
// 계산은 달러로 하지만, 유럽 공방은 유로로 일하고 한국 MD 는 원으로 일한다.
// "$292~385" 만 보여 주면 그 사람이 다시 환산해야 한다 — 이탈리아 공방 오너가 짚었다.
// 환산했다는 사실과 쓴 환율을 함께 적는다. 숨기면 그것도 못 믿을 숫자가 된다.

const REGION_CURRENCY: Record<string, string> = {
  Korea: 'KRW', Japan: 'JPY', Europe: 'EUR', 'United States': 'USD',
  'Middle East': 'AED', Asia: 'USD',
}
const SYMBOL: Record<string, string> = {
  USD: '$', KRW: '₩', EUR: '€', JPY: '¥', GBP: '£', AED: 'AED ', CNY: '¥', THB: '฿', INR: '₹',
}

export interface Money {
  /** 달러 값을 그 통화로 바꿔 글자로 */
  (usd: number): string
  code: string
  /** 환산했으면 쓴 환율 한 줄 · 달러면 빈 문자열 */
  note: string
}

/** 고른 지역에서 화면에 쓸 통화를 정한다 · 여러 지역이면 첫 번째를 따른다 */
export function currencyFor(regions: string[]): string {
  for (const r of regions ?? []) if (REGION_CURRENCY[r]) return REGION_CURRENCY[r]
  return 'USD'
}

/** 그 통화로 찍는 함수 · 환율과 통화 코드를 함께 들고 다닌다 */
export function moneyIn(code: string): Money {
  const fx = FX_PER_USD[code] ?? 1
  const sym = SYMBOL[code] ?? ''
  const fn = ((usd: number) => {
    const v = usd * fx
    // 원·엔은 소수점이 의미 없고, 달러·유로는 작은 값에서 의미가 있다
    const n = fx >= 100 ? Math.round(v / 100) * 100 : v < 10 ? Math.round(v * 10) / 10 : Math.round(v)
    return `${sym}${n.toLocaleString()}`
  }) as Money
  fn.code = code
  fn.note = code === 'USD' ? '' : `1 USD = ${fx.toLocaleString()} ${code}`
  return fn
}
