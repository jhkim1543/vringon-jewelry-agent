// ── 발표 구조 · 보드가 "왜 이 안인가"를 스스로 말하게 한다 ────────────
// 카드마다 근거는 이미 데이터로 있다. 그것을 발표용 문장으로 바꾸는 층이다.
import type { Design, RunState } from './types'
import { TIER_LABEL, TYPE_LABEL, CAT_LABEL, MODE_LABEL } from './types'

export interface DesignPitch {
  design_id: string
  /** 한 줄 요약 · 슬라이드 제목이 된다 */
  headline: string
  /** 왜 이 안이 나왔는가 */
  why: string[]
  /** 만들 수 있는가 */
  feasibility: string[]
  /** 예상 반론과 대응 */
  objections: { q: string; a: string }[]
}

export interface PitchDeck {
  title: string
  subtitle: string
  agenda: { no: number; title: string; note: string }[]
  designPitches: DesignPitch[]
  closing: string[]
}

/** Baseline talk track, built with no server call.
  *  Even if the AI pass fails, the board always has this. */
export function buildLocalPitch(st: RunState): PitchDeck {
  const p = st.params
  const alive = st.designs.filter(d => !d.rejected)
  const top = st.designs.filter(d => d.isTop)
  const rejected = st.designs.filter(d => d.rejected)

  const agenda = [
    { no: 1, title: 'Where this started', note: `${MODE_LABEL[p.mode]} mode · inputs and how far we looked` },
    { no: 2, title: 'What we actually saw', note: `${st.signals.length} signals, all sourced` },
    { no: 3, title: 'How we narrowed it', note: `${st.directions.length} directions` },
    { no: 4, title: 'What we made', note: `${alive.length} of ${st.designs.length} specs passed the rules` },
    { no: 5, title: 'What we are putting up', note: top.length ? `Top ${top.length}` : 'not selected yet' },
    { no: 6, title: 'What you need to decide', note: 'approve or reject, and why' },
  ]

  const designPitches = alive.map(d => buildDesignPitch(d, st))

  const closing = [
    top.length
      ? `What you decide today is whether the Top ${top.length} go through, and if not, which axis is the problem.`
      : 'What you decide today is which ones move on to render.',
    rejected.length
      ? `The ${rejected.length} the rules caught never got an image. They break manufacturing constraints, so they are not up for discussion.`
      : 'Nothing was rejected on rules this round.',
    'Costs are rough. The assumptions and exclusions sit on each card.',
  ]

  return {
    title: `${CAT_LABEL[p.category]} ${TYPE_LABEL[p.itemType] ?? p.itemType} review`,
    subtitle: `${MODE_LABEL[p.mode]} mode · ${st.designs.length} specs · ${new Date().toISOString().slice(0, 10)}`,
    agenda, designPitches, closing,
  }
}

function buildDesignPitch(d: Design, st: RunState): DesignPitch {
  const f = d.spec.fields as Record<string, unknown>
  const sigs = d.rationale.driving_signals
    .map(ds => st.signals.find(s => s.signal_id === ds.signal_id))
    .filter(Boolean)

  const why: string[] = []
  sigs.forEach(s => {
    if (!s) return
    why.push(`${s.label} showed up ${s.observed_count} times. It is a shift on the ${s.axis} axis, and confidence is ${s.confidence}.`)
  })
  if (d.rationale.type_placement_reason) why.push(d.rationale.type_placement_reason + '.')

  const feasibility: string[] = []
  const mold = d.cost.tooling.mold_count_required
  feasibility.push(mold === 0
    ? 'No new moulds. This runs on existing tooling.'
    : `${mold} new moulds are needed. Each size takes its own mould, so amortisation has to be read alongside this.`)
  const cap = Math.round((d.cost.cap_ratio - 1) * 100)
  feasibility.push(cap <= 0
    ? `Cost sits ${Math.abs(cap)}% below the cap.`
    : `Cost runs ${cap}% over the cap.`)
  const warns = d.ruleResults.filter(r => r.severity === 'warn')
  if (warns.length) feasibility.push(`${warns.length} warnings: ${warns.map(w => w.message).join(' / ')}`)

  const objections: { q: string; a: string }[] = []
  const weakest = sigs.filter(Boolean).sort((a, b) => (a!.observed_count) - (b!.observed_count))[0]
  if (weakest && weakest.observed_count <= 3) {
    objections.push({
      q: `Is the ${weakest.label} evidence thin?`,
      a: `Seen ${weakest.observed_count} times, so the sample is small. We are not claiming more than that, and this axis only drives Push and above.`,
    })
  }
  if (cap > 0) {
    objections.push({
      q: 'Cost is over the cap. Can this still go?',
      a: `${cap}% over. ${d.spec.tier === 'core' ? 'Core has no room for that, so the spec needs trimming.' : `${TIER_LABEL[d.spec.tier]} runs a wider cap and can absorb it.`}`,
    })
  }
  if (d.viewMismatch) {
    objections.push({
      q: 'The detail changes between views.',
      a: 'That gap survived a regeneration. We left it visible rather than hiding it, and the side view is the reference cut.',
    })
  }
  if (mold > 0) {
    objections.push({
      q: 'Does the tooling pay back?',
      a: `At ${d.cost.tooling.amortization_volume.toLocaleString()} units that is KRW ${d.cost.tooling.tooling_per_unit_krw.toLocaleString()} each. Change the volume assumption and this number moves first.`,
    })
  }

  const specBits = `${f.setting_type} setting · ${f.stone_count} stones · ${f.metal}`

  return {
    design_id: d.spec.design_id,
    headline: `${d.spec.design_id} · ${TIER_LABEL[d.spec.tier]} · ${specBits}`,
    why, feasibility, objections,
  }
}
