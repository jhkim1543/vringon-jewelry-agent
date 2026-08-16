// ── CategoryPack · 주얼리·신발 팩 (지시서 4.1, 6장, 7장) ─────────────
import type { Category, CostEstimate, DesignSpec, DesignTier, LineProfile, RuleResult } from './types'
import { TYPE_LABEL } from './types'
import type { Rng } from './rng'

export interface CategoryPack {
  id: Category
  types: string[]
  fieldLabels: Record<string, string>
  generateSpec: (rng: Rng, tier: DesignTier, itemType: string, locked: Record<string, string | number>) => DesignSpec
  /** 라인 프로필은 선택이다 · 도금 두께·컴플라이언스 룰만 이걸 본다.
   *  안 넘기면 그 룰들만 건너뛰고 나머지는 그대로 돈다. */
  rules: (spec: DesignSpec, line?: LineProfile | null) => RuleResult[]
  costModel: (spec: DesignSpec, rng: Rng) => CostEstimate
  signalAxes: string[]
  viewSet: { key: string; label: string; required: boolean }[]
  qaChecks: string[]
}

let seq = 0
export function resetSeq() { seq = 0 }
function nextId(cat: Category, tier: DesignTier) {
  seq += 1
  const p = cat === 'jewelry' ? 'JW' : 'SH'
  const t = tier === 'core' ? 'C' : tier === 'push' ? 'P' : 'S'
  return `${p}-26FW-${t}${String(seq).padStart(2, '0')}`
}

// ════════════════════════════════ 주얼리 팩 ═══════════════════════════
const METALS = ['925 silver', '14k gold', 'brass'] as const
const SETTINGS = ['prong', 'bezel', 'pave', 'channel'] as const
const FINISHES = ['polished', 'matte', 'hammered'] as const

// ── 주얼리 제조·착용 상수 ────────────────────────────────────────────
// 생성기와 룰이 같은 숫자를 봐야 한다. 한쪽만 고치면 전부 리젝트거나 전부 통과가 된다.
const RING_TYPES = ['band_ring', 'solitaire', 'eternity', 'signet']
/** 감기거나 꺾이면 복구가 안 되는 납작·중공 체인. 펜던트를 달면 안 된다. */
const FLAT_CHAINS = ['snake', 'herringbone', 'omega']
/** 펜던트 하중을 받는 체인 · 이쪽만 하중 구조로 쓴다 */
const LOAD_CHAINS = ['cable', 'box', 'curb', 'wheat']
const PLAIN_CHAINS = ['cable', 'box', 'snake', 'curb']
/** 링 밴드는 일반 주조 하한(0.8mm)이 아니라 착용 하한(1.0mm)을 따른다.
 *  0.8mm 는 "채워지는가"의 답이고 1.0mm 는 "연마와 착용을 견디는가"의 답이다. */
const wearFloorOf = (t: string) => RING_TYPES.includes(t) ? 1.0 : 0.8
/** 라운드 브릴리언트 거들~큐렛 깊이 근사 · 지름의 43%.
 *  스텝컷·카보숑에는 맞지 않으므로 파베·채널(사실상 브릴리언트)에만 쓴다. */
const pavilionDepth = (mm: number) => mm * 0.43
/** 도금 두께 요구는 마모 구간이 정한다 (반지·팔찌가 가장 험하다) */
function platingFloorOf(t: string): number {
  if (RING_TYPES.includes(t) || ['bangle', 'cuff', 'chain_bracelet', 'tennis'].includes(t)) return 2.5
  if (['stud', 'hoop', 'drop', 'ear_cuff'].includes(t)) return 1.0
  return 2.0
}

interface JewelProfile {
  stones: [number, number]
  weight: [number, number]
  cap: number                   // 유형별 원가 상한 기준 (Core 100% 기준액)
  pair?: boolean
  chain?: boolean
  settings?: string[]
  /** 밴드 폭 mm · 링·뱅글·커프처럼 폭이 착용성을 좌우하는 유형만 (J-26) */
  width?: [number, number]
  /** 귓불을 관통하는 유형 · 포스트 규격과 니켈 용출 한도가 더 엄격하다 (J-28) */
  pierced?: boolean
  /** 펜던트 하중을 체인이 받는 유형 · 체인 종류·게이지 제한이 붙는다 (J-14, J-29) */
  carriesPendant?: boolean
}
const JEWEL_PROFILE: Record<string, JewelProfile> = {
  band_ring: { stones: [0, 0], weight: [2.5, 6], cap: 58000, width: [2, 8] },
  solitaire: { stones: [1, 1], weight: [2, 4.5], cap: 72000, settings: ['prong', 'bezel'], width: [1.8, 3.5] },
  eternity: { stones: [12, 24], weight: [2.5, 5], cap: 115000, settings: ['channel', 'pave', 'bezel'], width: [1.8, 4] },
  signet: { stones: [0, 1], weight: [4, 9], cap: 88000, settings: ['bezel'], width: [8, 14] },
  stud: { stones: [1, 2], weight: [0.8, 2.5], cap: 42000, pair: true, pierced: true },
  hoop: { stones: [0, 12], weight: [1.5, 5], cap: 60000, pair: true, pierced: true },
  drop: { stones: [1, 6], weight: [2, 6], cap: 78000, pair: true, pierced: true },
  ear_cuff: { stones: [0, 5], weight: [1, 3], cap: 40000 },
  pendant: { stones: [1, 14], weight: [2, 7], cap: 82000, chain: true, carriesPendant: true },
  choker: { stones: [0, 10], weight: [4, 12], cap: 135000, chain: true },
  chain_necklace: { stones: [0, 0], weight: [5, 16], cap: 155000, chain: true },
  station: { stones: [5, 12], weight: [3, 9], cap: 118000, chain: true, settings: ['bezel', 'prong'], carriesPendant: true },
  bangle: { stones: [0, 8], weight: [8, 22], cap: 175000, width: [3, 12] },
  chain_bracelet: { stones: [0, 6], weight: [5, 15], cap: 145000, chain: true },
  cuff: { stones: [0, 6], weight: [10, 26], cap: 205000, width: [6, 25] },
  tennis: { stones: [20, 40], weight: [4, 10], cap: 195000, settings: ['prong', 'channel'] },
  brooch: { stones: [1, 16], weight: [3, 10], cap: 95000 },
  anklet: { stones: [0, 8], weight: [2, 6], cap: 72000, chain: true },
}
const DEFAULT_JEWEL_PROFILE: JewelProfile = { stones: [1, 6], weight: [2, 5], cap: 68000 }
export const jewelCapOf = (t: string) => (JEWEL_PROFILE[t] ?? DEFAULT_JEWEL_PROFILE).cap

export const jewelryPack: CategoryPack = {
  id: 'jewelry',
  types: Object.keys(JEWEL_PROFILE),
  fieldLabels: {
    metal: 'Metal', plating: 'Plating', target_weight_g: 'Target weight (g)',
    stone_count: 'Stones', stone_size_mm: 'Stone size (mm)', setting_type: 'Setting',
    min_wall_thickness_mm: 'Min wall (mm)', prong_count: 'Prongs',
    chain_type: 'Chain', finish: 'Finish', is_pair: 'Pair', is_new_mold: 'New mould',
    existing_mold_id: 'Mould ID',
    band_width_mm: 'Band width (mm)', prong_wire_mm: 'Prong wire (mm)',
    post_diameter_mm: 'Post diameter (mm)', chain_gauge_mm: 'Chain gauge (mm)',
  },
  generateSpec(rng, tier, itemType, locked) {
    const prof = JEWEL_PROFILE[itemType] ?? DEFAULT_JEWEL_PROFILE
    // 유형이 허용하는 범위 안에서, 티어가 위로 갈수록 상단을 쓴다
    const span = prof.stones[1] - prof.stones[0]
    const bias = tier === 'core' ? 0.35 : tier === 'push' ? 0.65 : 1
    const stoneCount = prof.stones[0] + Math.round(span * rng.next() * bias)
    const wSpan = prof.weight[1] - prof.weight[0]
    const weight = prof.weight[0] + wSpan * (tier === 'signature' ? 0.5 + rng.next() * 0.5 : rng.next() * 0.7)
    // Core는 원가가 낮은 금속 위주, Signature에서만 금을 폭넓게 쓴다
    const metalPool = tier === 'core' ? ['925 silver', '925 silver', 'brass']
      : tier === 'push' ? ['925 silver', '925 silver', 'brass', '14k gold']
      : METALS as unknown as string[]
    let stoneSize = Math.round((0.8 + rng.next() * (itemType === 'tennis' || itemType === 'eternity' ? 1.8 : 4.5)) * 10) / 10
    // Signature 단석은 존재감이 곧 스펙이다 · 0.2ct 상당(3.8mm)을 하한으로 (Gemini 감사 반영)
    if (tier === 'signature' && stoneCount > 0 && stoneCount <= 2) stoneSize = Math.max(stoneSize, 3.8)
    let setting = rng.pick(prof.settings ?? SETTINGS)
    // 채널은 스톤 열, 파베는 다석이 전제다. 단석에 쓰면 공법 오류 (Gemini 감사 반영)
    if (stoneCount > 0 && stoneCount <= 2 && (setting === 'channel' || setting === 'pave'))
      setting = rng.pick(['bezel', 'prong'])
    // 파베와 채널은 멜레를 촘촘히 앉히는 공법이다. 5mm 돌을 파베로 깔 수는 없다.
    // 이 상한이 없으면 생성기가 물리적으로 불가능한 스펙을 쏟아내고 J-24가 그것을 전부 걷어낸다.
    if (setting === 'pave') stoneSize = Math.round(Math.min(stoneSize, 0.9 + rng.next() * 1.1) * 10) / 10
    else if (setting === 'channel') stoneSize = Math.round(Math.min(stoneSize, 1.3 + rng.next() * 1.5) * 10) / 10
    // 돌이 많아질수록 개별 돌은 작아진다. 16석을 5mm 로 깔면 브로치가 아니라 왕관이다.
    if (stoneCount >= 6) stoneSize = Math.round(Math.min(stoneSize, 1.0 + rng.next() * 1.9) * 10) / 10
    // 귓불을 관통하는 유형에 황동을 쓰면 니켈 용출 한도(0.2μg/cm²/주)를 맞추기 어렵다
    const metalUse = prof.pierced ? metalPool.filter(m => m !== 'brass') : metalPool
    // 벽두께는 유형의 착용 하한에서 만든다. 아래로 조금 남겨 두어야 룰이 실제로 걸러낸다.
    const wallFloor = wearFloorOf(itemType)
    const f: Record<string, string | number | boolean> = {
      metal: rng.pick(metalUse.length ? metalUse : metalPool),
      plating: rng.pick(['rhodium', '18k gold', 'none']),
      target_weight_g: Math.round(weight * 10) / 10,
      stone_count: stoneCount,
      stone_size_mm: stoneSize,
      setting_type: setting,
      prong_count: rng.pick([4, 4, 4, 6, 3]),
      min_wall_thickness_mm: Math.round(wallFloor * (0.95 + rng.next() * 0.62) * 100) / 100,
      chain_type: prof.chain ? rng.pick(prof.carriesPendant ? LOAD_CHAINS : PLAIN_CHAINS) : 'none',
      finish: rng.pick(FINISHES),
      is_pair: !!prof.pair,
      is_new_mold: tier === 'signature' ? rng.chance(0.6) : rng.chance(0.15),
      existing_mold_id: `MLD-2024-${rng.int(3, 18)}`,
    }
    // 유형이 가진 치수만 채운다. 없는 치수를 0으로 채우면 룰이 헛돈다.
    if (prof.width) {
      const [lo, hi] = prof.width
      f.band_width_mm = Math.round((lo + (hi - lo) * rng.next()) * 10) / 10
    }
    // 프롱 와이어는 자립 주조 하한 0.8mm 근처, 위로는 1.0mm 가 상용 상한이다
    if (setting === 'prong' && stoneCount > 0)
      f.prong_wire_mm = Math.round((0.68 + rng.next() * 0.4) * 100) / 100
    // 귀걸이 포스트는 20~18게이지가 사실상 표준이다
    if (prof.pierced) f.post_diameter_mm = Math.round((0.72 + rng.next() * 0.34) * 100) / 100
    if (f.chain_type !== 'none') f.chain_gauge_mm = Math.round((1.1 + rng.next() * 2.4) * 10) / 10
    const lockedKeys: string[] = []
    for (const [k, v] of Object.entries(locked)) { f[k] = v; lockedKeys.push(k) }
    return { design_id: nextId('jewelry', tier), tier, category: 'jewelry', itemType, fields: f, fieldsLocked: lockedKeys }
  },
  rules(spec, line) {
    const f = spec.fields
    const r: RuleResult[] = []
    // 옛 저장본에는 새 치수가 없다. 없으면 그 룰만 건너뛴다 —
    // undefined 를 숫자로 강제하면 지난 디자인이 소급해서 룰에 걸린다.
    const num = (k: string): number | null => {
      const v = f[k]
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    }
    const t = spec.itemType
    const prof = JEWEL_PROFILE[t] ?? DEFAULT_JEWEL_PROFILE
    const isRing = RING_TYPES.includes(t)
    const wall = num('min_wall_thickness_mm')
    const stones = num('stone_count') ?? 0
    const stoneMm = num('stone_size_mm') ?? 0
    const grams = num('target_weight_g') ?? 0
    const setting = String(f.setting_type ?? '')
    const chain = String(f.chain_type ?? 'none')
    const microns = line?.coatingMicrons ?? null
    if ((f.min_wall_thickness_mm as number) < 0.8)
      r.push({ rule: 'J-01', severity: 'fail', message: `Wall thickness ${f.min_wall_thickness_mm}mm is under 0.8mm. Cannot be cast.` })
    if (f.is_new_mold && spec.tier === 'core')
      r.push({ rule: 'J-02', severity: 'fail', message: 'New mould on a Core piece. Core has to reuse an existing mould.' })
    if (f.setting_type === 'pave' && (f.stone_size_mm as number) < 1.0)
      r.push({ rule: 'J-03', severity: 'warn', message: `Pave with ${f.stone_size_mm}mm stones under 1.0mm. Setting labour climbs sharply.` })
    if (f.metal === '925 silver' && f.plating === 'none' && f.finish === 'polished')
      r.push({ rule: 'J-04', severity: 'warn', message: 'Unplated polished silver will tarnish.' })
    if ((f.prong_count as number) < 4 && (f.stone_size_mm as number) > 5.0)
      r.push({ rule: 'J-05', severity: 'fail', message: `${f.prong_count} prongs on a ${f.stone_size_mm}mm stone. The stone can work loose.` })
    // 멀티스톤에서 보조석이 커지면 밸런스와 원가가 같이 무너진다 (Gemini 감사 반영)
    if ((f.stone_count as number) >= 6 && (f.stone_size_mm as number) > 3.0)
      r.push({ rule: 'J-11', severity: 'fail', message: `${f.stone_count} accent stones at ${f.stone_size_mm}mm. Multi-stone accents past 3mm break both the balance and the budget.` })
    else if ((f.stone_count as number) >= 6 && (f.stone_size_mm as number) > 2.0)
      r.push({ rule: 'J-11', severity: 'warn', message: `${f.stone_count} accent stones at ${f.stone_size_mm}mm. Accents on a multi-stone piece usually stay at or under 2mm.` })
    // 연속 세팅 유형은 스톤 크기 편차가 크면 라인이 흐트러진다
    if ((spec.itemType === 'tennis' || spec.itemType === 'eternity') && (f.stone_size_mm as number) > 3.0)
      r.push({ rule: 'J-09', severity: 'warn', message: `${f.stone_size_mm}mm stones on a ${spec.itemType}. Both worn thickness and unit cost jump.` })
    // 귀걸이류는 무게가 귓불 부담으로 직결된다
    // 귀걸이 무게는 두 단계다. 7g 위는 귓불 통로가 늘어나는 손상 구간이고,
    // 5g 위는 하루 착용이 불편해지는 구간이다. 하나로 묶으면 멀쩡한 드롭이 통째로 떨어진다.
    if (f.is_pair && grams > 7)
      r.push({ rule: 'J-10', severity: 'fail', message: `${grams}g per earring. Past 7g the piercing channel stretches with daily wear.` })
    else if (f.is_pair && grams > 5)
      r.push({ rule: 'J-10', severity: 'warn', message: `${grams}g per earring. Comfortable daily wear usually stops around 5g.` })

    // ── 링 밴드 ────────────────────────────────────────────────────
    // J-01 은 "주조로 채워지는가"의 하한이다. 반지 밴드는 손가락에서 눌리고 갈리므로
    // 그것만으로는 부족하다. 현장에서 깨지는 반지는 대부분 이 구간에 있다.
    if (isRing && wall != null && wall >= 0.8 && wall < 1.0)
      r.push({ rule: 'J-12', severity: 'fail', message: `Ring shank at ${wall}mm. It casts, but a band under 1.0mm bends and wears through in daily use.` })
    // 연마로 사라지는 살을 계산에 넣지 않으면 도면은 통과하고 실물은 미달한다
    const floor = wearFloorOf(t)
    if (wall != null && wall >= floor && wall < floor + 0.1)
      r.push({ rule: 'J-13', severity: 'warn', message: `Wall ${wall}mm leaves nothing for polishing. Finishing removes about 0.1mm, so model at ${(floor + 0.1).toFixed(2)}mm or more.` })

    // ── 체인과 하중 ─────────────────────────────────────────────────
    // 스네이크·헤링본·오메가는 한 번 꺾이면 수리가 안 된다. 펜던트 하중에 안전한 무게는 0이다.
    if (prof.carriesPendant && FLAT_CHAINS.includes(chain))
      r.push({ rule: 'J-14', severity: 'fail', message: `A ${chain} chain carrying a pendant. Flat and hollow chains kink under a hanging load and cannot be repaired once they do.` })
    else if (FLAT_CHAINS.includes(chain))
      r.push({ rule: 'J-15', severity: 'warn', message: `A ${chain} chain cannot be repaired once kinked. Say so at point of sale, or move to a link chain.` })
    const gauge = num('chain_gauge_mm')
    if (prof.carriesPendant && gauge != null) {
      if (gauge < 1.5)
        r.push({ rule: 'J-29', severity: 'warn', message: `Chain at ${gauge}mm under a pendant. Everyday pendant chains start around 1.5mm.` })
      else if (grams > 8 && gauge < 3)
        r.push({ rule: 'J-29', severity: 'warn', message: `A ${grams}g pendant on a ${gauge}mm chain. Statement weights want 3mm or more.` })
    }

    // ── 세팅 ───────────────────────────────────────────────────────
    // 파베·채널은 스톤 아래로 금속이 남아 있어야 물린다. 거들에서 큐렛까지가 기준선이다.
    if (stones > 0 && (setting === 'pave' || setting === 'channel') && wall != null) {
      const need = Math.round((pavilionDepth(stoneMm) + 0.15) * 100) / 100
      if (wall < need)
        r.push({ rule: 'J-24', severity: 'fail', message: `${setting} with ${stoneMm}mm stones needs about ${need}mm of metal depth, and there is ${wall}mm. The stones sit proud or break through.` })
    }
    // 프롱은 거들 아래 자리를 파고 물린다. 그 살이 없으면 세팅 자체가 안 된다.
    if (stones > 0 && setting === 'prong' && wall != null && wall < 0.7)
      r.push({ rule: 'J-25', severity: 'fail', message: `Prong setting on ${wall}mm of metal. A seat needs about 0.7mm below the girdle.` })
    const prongWire = num('prong_wire_mm')
    if (setting === 'prong' && prongWire != null && prongWire < 0.7)
      r.push({ rule: 'J-27', severity: 'fail', message: `Prong wire at ${prongWire}mm. Under 0.7mm it will not cast free standing and bends open in wear.` })
    else if (setting === 'prong' && prongWire != null && prongWire > 1.0)
      r.push({ rule: 'J-27', severity: 'warn', message: `Prong wire at ${prongWire}mm. Past 1.0mm the prongs start to cover the stone.` })

    // ── 반지 폭과 두께 ───────────────────────────────────────────────
    const width = num('band_width_mm')
    if (width != null && wall != null) {
      if (width >= 6 && wall < 1.5)
        r.push({ rule: 'J-26', severity: 'warn', message: `A ${width}mm wide band at ${wall}mm thick. Wide bands need about 1.5mm or they flex out of round.` })
      else if (width >= 4 && wall < 1.3)
        r.push({ rule: 'J-26', severity: 'warn', message: `A ${width}mm wide band at ${wall}mm thick. Around 1.3mm is where a band this wide stops distorting.` })
    }
    // 풀 에터니티와 연속 채널은 사이즈 조정이 불가능하다. 판매 시점에 고지해야 한다.
    if (t === 'eternity' && (setting === 'channel' || setting === 'pave'))
      r.push({ rule: 'J-23', severity: 'warn', message: 'A continuous eternity band cannot be resized later. It has to be remade to a new size, so state the size policy up front.' })

    // ── 귀걸이 포스트 ────────────────────────────────────────────────
    const post = num('post_diameter_mm')
    if (prof.pierced && post != null) {
      if (post < 0.7)
        r.push({ rule: 'J-28', severity: 'fail', message: `Earring post at ${post}mm. Under 0.7mm the post bends and cuts the piercing channel.` })
      else if (post > 1.0)
        r.push({ rule: 'J-28', severity: 'warn', message: `Earring post at ${post}mm. Past 1.0mm it will not pass a healed standard piercing.` })
    }

    // ── 도금과 컴플라이언스 · 라인 프로필이 있을 때만 ─────────────────
    if (line) {
      // 버메일은 마케팅 용어가 아니라 법적 정의다. 은 바탕에 10K 이상, 2.5μm 이상.
      if (line.coating === 'gold_vermeil') {
        if (line.baseMetal !== '925_silver')
          r.push({ rule: 'J-17', severity: 'fail', message: 'Vermeil has to sit on sterling silver. On any other base it cannot be sold as vermeil.' })
        else if (microns != null && microns < 2.5)
          r.push({ rule: 'J-17', severity: 'fail', message: `Vermeil needs 2.5 microns of gold and this line specifies ${microns}. Under that it is gold plate, not vermeil.` })
      }
      if (microns != null && microns > 0 && microns < 0.175)
        r.push({ rule: 'J-18', severity: 'warn', message: `${microns} microns is a flash. It can only be described as gold flashed, never as gold plated.` })
      // 로듐은 얇으면 3개월에 벗겨지고, 두꺼우면 취성으로 갈라진다. 양쪽이 다 불량이다.
      if (String(f.plating) === 'rhodium' && microns != null) {
        if (microns < 0.75)
          r.push({ rule: 'J-19', severity: 'fail', message: `Rhodium at ${microns} microns wears through within months. The working window starts at 0.75.` })
        else if (microns > 2.0)
          r.push({ rule: 'J-19', severity: 'fail', message: `Rhodium at ${microns} microns turns brittle and crazes. Stay under 2.0.` })
      }
      if (microns != null && line.coating !== 'none' && String(f.plating) !== 'rhodium') {
        const need = platingFloorOf(t)
        if (microns < need)
          r.push({ rule: 'J-20', severity: 'warn', message: `${microns} microns on a ${TYPE_LABEL[t] ?? t}. This wear zone rubs, so ${need} microns is the everyday figure.` })
      }
      // 니켈 프리는 성분 주장이 아니라 용출 주장이다. 도금 황동은 도금이 닳으면 바탕이 드러난다.
      if (line.compliance?.includes('nickel_free') && line.baseMetal === 'plated_brass')
        r.push({ rule: 'J-21', severity: 'fail', message: 'A nickel safe claim on a plated brass base. Once the plating wears through the base is exposed, so the claim cannot be held for the life of the piece.' })
    }

    // 홀마킹은 무게에 걸린다. 각인 자리를 CAD 에서 미리 비워 두지 않으면 나중에 낼 곳이 없다.
    const metalName = String(f.metal ?? '')
    const hallmark = metalName.includes('gold') ? 1.0 : metalName.includes('silver') ? 7.78 : null
    if (hallmark != null && grams > hallmark)
      r.push({ rule: 'J-22', severity: 'warn', message: `At ${grams}g this needs a UK assay hallmark. Reserve a flat area that can take the mark without distorting.` })

    return r
  },
  costModel(spec, rng) {
    const f = spec.fields
    const metalRate = f.metal === '18k gold' ? 31000 : f.metal === '14k gold' ? 21000 : f.metal === '925 silver' ? 6600 : 2400
    const metal = Math.round((f.target_weight_g as number) * metalRate)
    const stone = (f.stone_count as number) * (f.stone_size_mm as number) * 480
    const setting = f.setting_type === 'pave' ? (f.stone_count as number) * 1400 : (f.stone_count as number) * 700
    const casting = 5000, findings = 3000
    const plating = f.plating === 'none' ? 0 : 4000
    const finishing = 3500
    const chain = f.chain_type === 'none' ? 0 : 8000
    const newMold = f.is_new_mold ? 480000 : 0
    const amort = 500
    const toolingPerUnit = Math.round(newMold / amort)
    const lines = [
      { label: 'Metal', krw: metal }, { label: 'Stones', krw: Math.round(stone) },
      { label: 'Findings', krw: findings }, { label: 'Chain', krw: chain },
      { label: 'Casting', krw: casting }, { label: 'Setting labour', krw: Math.round(setting) },
      { label: 'Plating', krw: plating }, { label: 'Finishing', krw: finishing },
      { label: 'Tooling, amortised', krw: toolingPerUnit },
    ]
    const total = lines.reduce((s, l) => s + l.krw, 0)
    const yieldFactor = 1.12
    const est = Math.round(total * yieldFactor)
    const capBase = jewelCapOf(spec.itemType)
    return {
      lines,
      tooling: { total_tooling_krw: newMold, mold_count_required: f.is_new_mold ? 1 : 0, amortization_volume: amort, tooling_per_unit_krw: toolingPerUnit },
      estimated_total_krw: est,
      estimated_band_krw: [Math.round(est * 0.85), Math.round(est * (1.18 + rng.next() * 0.06))],
      cap_ratio: Math.round((est / capBase) * 100) / 100,
      confidence: 'low',
      assumptions: ['MOQ 300', 'Silver and gold priced at 2026-08-01', 'Standard setting labour rate', `Amortised over ${amort} units`],
      excluded_costs: ['Packaging', 'Freight', 'Vendor margin', 'Defect rate', 'Sampling'],
    }
  },
  signalAxes: ['Form', 'Metal and colour', 'Stones', 'Setting', 'How it is worn', 'Scale', 'Layering', 'Price band'],
  viewSet: [
    { key: 'front', label: 'Front (reference)', required: true },
    { key: 'q45', label: '45 degrees', required: true },
    { key: 'detail', label: 'Detail close-up', required: true },
    { key: 'wear', label: 'Worn angle', required: false },
  ],
  // 실제 검사 목록은 스펙마다 다르다 · visionQa.ts 의 qaChecksFor 가 정한다.
  // 여기 남은 것은 카탈로그일 뿐이고, 예전의 '>=0.80' 유사도는 실재하지 않는 수치였다.
  qaChecks: ['stone_count', 'stone_size', 'setting_type', 'prong_count', 'metal_tone', 'finish', 'chain_type', 'pair', 'cross_view'],
}

export const PACKS: Record<Category, CategoryPack> = { jewelry: jewelryPack }

// ── 원가 상한 (유형 프리셋 · Core 100% / Push 130% / Signature 200%) ──
export const TIER_COST_CAP: Record<DesignTier, number> = { core: 1.0, push: 1.3, signature: 2.0 }

export function tierCapRule(spec: DesignSpec, cost: CostEstimate): RuleResult[] {
  const cap = TIER_COST_CAP[spec.tier]
  const out: RuleResult[] = []
  if (cost.cap_ratio > cap)
    out.push({ rule: 'J-CAP', severity: cost.cap_ratio > cap * 1.25 ? 'fail' : 'warn', message: `Cost sits at ${Math.round(cost.cap_ratio * 100)}% against a ${Math.round(cap * 100)}% cap` })
  // J-08 / S-10: 툴링 상각 > 상한의 15%
  if (cost.tooling.tooling_per_unit_krw > 0) {
    const capBase = jewelCapOf(spec.itemType)
    if (cost.tooling.tooling_per_unit_krw > capBase * cap * 0.15)
      out.push({ rule: 'J-08', severity: 'warn', message: `Tooling amortises to KRW ${cost.tooling.tooling_per_unit_krw.toLocaleString()} per unit, over 15% of the cap` })
  }
  return out
}
