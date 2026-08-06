// ── CategoryPack · 주얼리·신발 팩 (지시서 4.1, 6장, 7장) ─────────────
import type { Category, CostEstimate, DesignSpec, DesignTier, RuleResult } from './types'
import { TYPE_LABEL } from './types'
import type { Rng } from './rng'

export interface CategoryPack {
  id: Category
  types: string[]
  fieldLabels: Record<string, string>
  generateSpec: (rng: Rng, tier: DesignTier, itemType: string, locked: Record<string, string | number>) => DesignSpec
  rules: (spec: DesignSpec) => RuleResult[]
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

interface JewelProfile {
  stones: [number, number]
  weight: [number, number]
  cap: number                   // 유형별 원가 상한 기준 (Core 100% 기준액)
  pair?: boolean
  chain?: boolean
  settings?: string[]
}
const JEWEL_PROFILE: Record<string, JewelProfile> = {
  band_ring: { stones: [0, 0], weight: [2.5, 6], cap: 58000 },
  solitaire: { stones: [1, 1], weight: [2, 4.5], cap: 72000, settings: ['prong', 'bezel'] },
  eternity: { stones: [12, 24], weight: [2.5, 5], cap: 115000, settings: ['channel', 'pave', 'bezel'] },
  signet: { stones: [0, 1], weight: [4, 9], cap: 88000, settings: ['bezel'] },
  stud: { stones: [1, 2], weight: [0.8, 2.5], cap: 42000, pair: true },
  hoop: { stones: [0, 12], weight: [1.5, 5], cap: 60000, pair: true },
  drop: { stones: [1, 6], weight: [2, 6], cap: 78000, pair: true },
  ear_cuff: { stones: [0, 5], weight: [1, 3], cap: 40000 },
  pendant: { stones: [1, 14], weight: [2, 7], cap: 82000, chain: true },
  choker: { stones: [0, 10], weight: [4, 12], cap: 135000, chain: true },
  chain_necklace: { stones: [0, 0], weight: [5, 16], cap: 155000, chain: true },
  station: { stones: [5, 12], weight: [3, 9], cap: 118000, chain: true, settings: ['bezel', 'prong'] },
  bangle: { stones: [0, 8], weight: [8, 22], cap: 175000 },
  chain_bracelet: { stones: [0, 6], weight: [5, 15], cap: 145000, chain: true },
  cuff: { stones: [0, 6], weight: [10, 26], cap: 205000 },
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
    const f: Record<string, string | number | boolean> = {
      metal: rng.pick(metalPool),
      plating: rng.pick(['rhodium', '18k gold', 'none']),
      target_weight_g: Math.round(weight * 10) / 10,
      stone_count: stoneCount,
      stone_size_mm: Math.round((0.8 + rng.next() * (itemType === 'tennis' || itemType === 'eternity' ? 1.8 : 4.5)) * 10) / 10,
      setting_type: rng.pick(prof.settings ?? SETTINGS),
      prong_count: rng.pick([4, 4, 4, 6, 3]),
      // 주조 하한(0.8mm) 근처를 노리되, 일부는 미달하게 두어 룰이 실제로 걸러내게 한다
      min_wall_thickness_mm: Math.round((0.74 + rng.next() * 0.86) * 100) / 100,
      chain_type: prof.chain ? rng.pick(['cable', 'box', 'snake']) : 'none',
      finish: rng.pick(FINISHES),
      is_pair: !!prof.pair,
      is_new_mold: tier === 'signature' ? rng.chance(0.6) : rng.chance(0.15),
      existing_mold_id: `MLD-2024-${rng.int(3, 18)}`,
    }
    const lockedKeys: string[] = []
    for (const [k, v] of Object.entries(locked)) { f[k] = v; lockedKeys.push(k) }
    return { design_id: nextId('jewelry', tier), tier, category: 'jewelry', itemType, fields: f, fieldsLocked: lockedKeys }
  },
  rules(spec) {
    const f = spec.fields
    const r: RuleResult[] = []
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
    if (f.chain_type === 'snake' && (f.target_weight_g as number) > 8)
      r.push({ rule: 'J-07', severity: 'warn', message: 'Snake chain with a pendant over 8g. Structurally marginal.' })
    // 연속 세팅 유형은 스톤 크기 편차가 크면 라인이 흐트러진다
    if ((spec.itemType === 'tennis' || spec.itemType === 'eternity') && (f.stone_size_mm as number) > 3.0)
      r.push({ rule: 'J-09', severity: 'warn', message: `${f.stone_size_mm}mm stones on a ${spec.itemType}. Both worn thickness and unit cost jump.` })
    // 귀걸이류는 무게가 귓불 부담으로 직결된다
    if (f.is_pair && (f.target_weight_g as number) > 5)
      r.push({ rule: 'J-10', severity: 'fail', message: `${f.target_weight_g}g per earring. Past what an earlobe carries comfortably.` })
    return r
  },
  costModel(spec, rng) {
    const f = spec.fields
    const metalRate = f.metal === '14k gold' ? 21000 : f.metal === '925 silver' ? 6600 : 2400
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
  qaChecks: ['Stone count matches', 'Setting reads correctly', 'Prong count', 'Same object across three views >=0.80', 'Pair matches left to right'],
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
