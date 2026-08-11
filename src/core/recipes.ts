// ── 조건 레시피 · 조사 결과를 조합해 디자인마다 다른 방향을 준다 ──────
// 문제: 모든 스케치에 같은 트렌드 절(상위 신호 4개 + 첫 매크로)이 실려서
// 스펙만 다르고 방향이 같은, 서로 비슷한 디자인만 나왔다.
// 해법: 조사에서 나온 조건(신호·매크로·경쟁사 특징)을 원자로 쪼개고,
// 디자인마다 단독 / 2개 조합 / 다중 융합을 번갈아 배정한다.
// 같은 조합은 두 번 쓰지 않는다 — 조합이 곧 컨셉의 정체성이다.
import type { TrendClauseInput } from './aiClient'
import type { Rng } from './rng'

export interface RecipeAtom {
  kind: 'signal' | 'macro' | 'competitor'
  label: string
  /** macro 원자만 갖는다 · 그 매크로의 소재·디테일·팔레트 */
  materials?: string[]
  details?: string[]
  colors?: { name: string; hex: string }[]
}

export interface DesignRecipe {
  /** 화면·PDF에 그대로 보이는 이름 · 예: "Charm stacking × LIQUID METAL" */
  title: string
  shape: 'solo' | 'pair' | 'fusion'
  atoms: { kind: RecipeAtom['kind']; label: string }[]
  clause: TrendClauseInput
}

export interface ConditionPoolInput {
  signals?: string[]
  macros?: { name: string; materials?: string[]; details?: string[]; colors?: { name: string; hex: string }[] }[]
  competitorTraits?: string[]
  /** 모든 레시피에 공통으로 실리는 앵커(키 아이템 실루엣 등) */
  keySpec?: string
}

/** 조사 결과를 원자 목록으로 편다. 많아야 좋은 게 아니라 서로 달라야 좋다. */
export function buildConditionPool(src: ConditionPoolInput): RecipeAtom[] {
  const pool: RecipeAtom[] = []
  for (const s of (src.signals ?? []).slice(0, 6)) pool.push({ kind: 'signal', label: s })
  for (const m of (src.macros ?? []).slice(0, 4)) pool.push({
    kind: 'macro', label: m.name,
    materials: m.materials?.slice(0, 3), details: m.details?.slice(0, 3), colors: m.colors?.slice(0, 3),
  })
  for (const t of (src.competitorTraits ?? []).slice(0, 5)) pool.push({ kind: 'competitor', label: t })
  return pool
}

/** 원자 묶음 → 프롬프트 절 입력. 매크로가 없으면 신호·특징만으로도 방향이 된다. */
function toClause(atoms: RecipeAtom[], title: string, keySpec?: string): TrendClauseInput {
  const macros = atoms.filter(a => a.kind === 'macro')
  const words = atoms.filter(a => a.kind !== 'macro').map(a => a.label)
  const nz = <T,>(a: T[]) => (a.length ? a : undefined)
  return {
    macroName: title,
    keySpec,
    signals: nz(words),
    materials: nz(macros.flatMap(m => m.materials ?? []).slice(0, 4)),
    details: nz(macros.flatMap(m => m.details ?? []).slice(0, 4)),
    colors: nz(macros.flatMap(m => m.colors ?? []).slice(0, 4)),
  }
}

/** count 개 디자인에 서로 다른 레시피를 배정한다.
 *  단독 → 2개 조합 → 융합(3개)을 순환하고, 이미 쓴 조합은 피한다.
 *  풀이 작으면 만들 수 있는 만큼만 다르게 하고 그다음부터 순환한다. */
export function assignRecipes(pool: RecipeAtom[], count: number, rng: Rng, keySpec?: string): DesignRecipe[] {
  if (!pool.length) return []
  // 결정적 셔플 · 같은 시드는 같은 배정을 낸다 (재실행 시 캐시가 살아 있도록)
  const order = pool.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const used = new Set<string>()
  const out: DesignRecipe[] = []
  let cursor = 0
  const take = (n: number): RecipeAtom[] => {
    const picked: RecipeAtom[] = []
    const seen = new Set<number>()
    while (picked.length < n && seen.size < order.length) {
      const idx = order[cursor % order.length]
      cursor++
      if (seen.has(idx)) continue
      seen.add(idx)
      picked.push(pool[idx])
    }
    return picked
  }
  const shapes: DesignRecipe['shape'][] = ['solo', 'pair', 'fusion']
  for (let i = 0; i < count; i++) {
    const want = shapes[i % shapes.length]
    const n = want === 'solo' ? 1 : want === 'pair' ? 2 : Math.min(3, pool.length)
    // 중복 조합 회피 · 풀이 다 돌면 어쩔 수 없이 재사용한다
    let atoms = take(Math.min(n, pool.length))
    let key = atoms.map(a => a.label).sort().join('|')
    for (let retry = 0; used.has(key) && retry < pool.length; retry++) {
      atoms = take(Math.min(n, pool.length))
      key = atoms.map(a => a.label).sort().join('|')
    }
    used.add(key)
    const title = atoms.map(a => a.label).join(' × ')
    out.push({ title, shape: atoms.length === 1 ? 'solo' : atoms.length === 2 ? 'pair' : 'fusion', atoms: atoms.map(a => ({ kind: a.kind, label: a.label })), clause: toClause(atoms, title, keySpec) })
  }
  return out
}
