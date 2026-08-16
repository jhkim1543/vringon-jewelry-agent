// ── 비전 QA · 스펙에서 "사진으로 확인 가능한 것"만 검사 목록으로 뽑는다 ──
// 목록을 모델이 정하게 두면 매번 다른 것을 보고, 못 본 항목이 조용히 사라진다.
// 무엇을 검사할지는 여기서 결정하고, 모델은 "무엇이 보이는가"만 답한다.
// 통과 기준도 여기 있다 — 사진에는 자가 없어서, 개수는 밴드로 크기는 등급으로 본다.
import type { DesignSpec, LineProfile, QAResult } from './types'
import type { VisionQaRead } from './research'

export type QaSurface = 'render' | 'sketch'
export const CROSS_VIEW_ID = 'cross_view'
export const CROSS_VIEW_LABEL = 'Same object across the views'

export interface QaCheckDef {
  id: string
  label: string          // 화면·PDF 가 그대로 쓰는 이름
  target: string         // 사람이 읽는 목표값
  want: string           // 기계 대조용 값
  onSketch: boolean      // 흑백 도면으로도 확인되는가
}

const BAND_ORDER = ['accent', 'small', 'medium', 'large']
const sizeBand = (mm: number) => mm < 1.5 ? 'accent' : mm < 3 ? 'small' : mm < 5 ? 'medium' : 'large'
const SIZE_TEXT: Record<string, string> = {
  accent: 'an accent, the metal still dominates',
  small: 'small but clearly visible',
  medium: 'the focal point of the piece',
  large: 'large enough to dominate the piece',
}

/** 보이는 색은 소재가 아니라 도금이 정한다. 라인 코팅이 스펙보다 우선이다. */
export function toneOf(spec: DesignSpec, line?: LineProfile | null): { want: string; text: string } {
  const f = spec.fields as Record<string, string | number | boolean>
  const plating = String(f.plating ?? 'none')
  const metal = String(f.metal ?? '')
  if (line?.coating === 'oxidized') return { want: 'dark_metal', text: 'dark oxidised metal' }
  if (plating === '18k gold' || line?.coating === 'gold_vermeil' || line?.coating === 'gold_plated')
    return { want: 'yellow_gold', text: 'yellow gold' }
  if (metal.includes('gold')) return { want: 'yellow_gold', text: 'yellow gold' }
  if (metal === 'brass' && plating === 'none') return { want: 'yellow_gold', text: 'yellow brass' }
  return { want: 'white_silver', text: 'white silver' }
}

export function qaChecksFor(spec: DesignSpec, line?: LineProfile | null,
                            surface: QaSurface = 'render', viewCount = 1): QaCheckDef[] {
  const f = spec.fields as Record<string, string | number | boolean>
  const n = Number(f.stone_count) || 0
  const mm = Number(f.stone_size_mm) || 0
  const setting = String(f.setting_type)
  const prongs = Number(f.prong_count) || 0
  const chain = String(f.chain_type ?? 'none')
  const tone = toneOf(spec, line)
  const out: QaCheckDef[] = []

  // 무석 스펙에 팬텀 파베가 나오는 것이 이 검사의 첫 목적이다 (MD 리뷰가 실제로 잡은 결함)
  out.push(n === 0
    ? { id: 'stone_count', label: 'No stones on the piece', target: 'no stones anywhere', want: '0', onSketch: true }
    : { id: 'stone_count', label: 'Stone count matches', target: `${n} stone${n > 1 ? 's' : ''}`, want: String(n), onSketch: true })

  if (n > 0) {
    const band = sizeBand(mm)
    out.push({ id: 'stone_size', label: 'Stone size against the piece',
      target: `${mm}mm, reading as ${SIZE_TEXT[band]}`, want: band, onSketch: true })
    out.push({ id: 'setting_type', label: 'Setting reads correctly', target: setting, want: setting, onSketch: true })
    // 프롱 수는 단석·소수석에서만 셀 수 있다. 파베 40석의 프롱을 세라고 하면 답이 지어진다.
    if (setting === 'prong' && n <= 3)
      out.push({ id: 'prong_count', label: 'Prong count', target: `${prongs} prongs on the centre stone`, want: String(prongs), onSketch: true })
  }
  if (surface === 'render') {
    out.push({ id: 'metal_tone', label: 'Metal tone', target: tone.text, want: tone.want, onSketch: false })
    out.push({ id: 'finish', label: 'Surface finish', target: String(f.finish), want: String(f.finish), onSketch: false })
  }
  out.push(chain === 'none'
    ? { id: 'chain_type', label: 'No chain attached', target: 'no chain', want: 'none', onSketch: true }
    : { id: 'chain_type', label: 'Chain type', target: `${chain} chain`, want: chain, onSketch: true })
  out.push(f.is_pair
    ? { id: 'pair', label: 'Shown as a matched pair', target: 'two matching pieces', want: 'true', onSketch: true }
    : { id: 'pair', label: 'Shown as a single piece', target: 'one piece only', want: 'false', onSketch: true })
  if (viewCount >= 2)
    out.push({ id: CROSS_VIEW_ID, label: CROSS_VIEW_LABEL, target: 'the same piece in every cut', want: 'same_object', onSketch: true })

  return out.filter(c => surface === 'render' || c.onSketch)
}

/** 통과 기준 · 모델이 정하지 않는다.
 *  사진에는 자가 없다. 그래서 개수는 많아질수록 밴드로, 크기는 인접 등급까지 인정한다.
 *  이 관용을 좁히면 에터니티·테니스가 전부 불일치로 잡혀 검사가 무의미해진다. */
function grade(def: QaCheckDef, got: string, verdict: 'match' | 'mismatch' | 'unclear'): 'pass' | 'fail' | 'unknown' {
  if (verdict === 'unclear' || !got || got === 'unclear') return 'unknown'
  if (def.id === 'stone_count') {
    const want = Number(def.want), seen = Number(got)
    if (!Number.isFinite(seen)) return 'unknown'
    if (want <= 6) return seen === want ? 'pass' : 'fail'          // 셀 수 있는 범위는 정확히
    return Math.abs(seen - want) <= Math.max(1, Math.round(want * 0.2)) ? 'pass' : 'fail'
  }
  if (def.id === 'stone_size') {
    const a = BAND_ORDER.indexOf(def.want), b = BAND_ORDER.indexOf(got)
    if (a < 0 || b < 0) return 'unknown'
    return Math.abs(a - b) <= 1 ? 'pass' : 'fail'
  }
  if (def.id === CROSS_VIEW_ID) return got === 'different_object' ? 'fail' : 'pass'
  // 체인 링크 종류는 실제로 구분이 어렵다. other 는 틀렸다는 뜻이 아니라 못 봤다는 뜻이다.
  if (def.id === 'chain_type' && def.want !== 'none' && got === 'other') return 'unknown'
  if (got === def.want) return 'pass'
  // 문장은 일치라는데 값이 다르면 그건 모순이다. 통과로 밀지 않는다.
  return verdict === 'match' ? 'unknown' : 'fail'
}

export function gradeQa(defs: QaCheckDef[], read: VisionQaRead): QAResult[] {
  const byId = new Map(read.checks.map(c => [c.check_id, c]))
  /** 모델이 check_id 에 줄 전체를 복사해 오는 일이 있다(실제로 관측됨).
   *  정확히 맞는 것이 없으면 id 를 포함하는 항목을 찾아 준다 — 못 찾으면 미확인이 되고,
   *  멀쩡한 검사가 통째로 사라지는 것보다 낫다. */
  const find = (id: string) => byId.get(id) ?? read.checks.find(c => (c.check_id ?? '').includes(id))
  return defs.map(def => {
    const c = def.id === CROSS_VIEW_ID
      ? { check_id: def.id,
          observed: read.cross_view.verdict === 'same_object' ? 'the same piece in every cut'
            : read.cross_view.verdict === 'minor_differences' ? 'the same piece, with small differences between cuts'
            : 'the cuts show different pieces',
          observed_value: read.cross_view.verdict,
          verdict: read.cross_view.verdict === 'different_object' ? 'mismatch' as const : 'match' as const,
          evidence_view: '', note: read.cross_view.differences.join('. ') }
      : find(def.id)
    if (!c) return { check: def.label, target: def.target,
      observed: 'the check did not come back for this item', pass: false, status: 'unknown' as const }
    const status = grade(def, c.observed_value, c.verdict)
    return {
      check: def.label,
      target: def.target,
      observed: status === 'unknown' ? `could not tell from these cuts, ${c.observed}` : c.observed,
      pass: status === 'pass',
      status,
      view: c.evidence_view || undefined,
      note: c.note || undefined,
    }
  })
}

/** 검사가 못 돌았을 때 · 통과로 두지 않고, 무엇을 확인 못 했는지 항목마다 남긴다.
 *  빈 배열을 주면 안 된다 — Card.tsx 가 d.qa.length 로 렌더 여부를 가른다. */
export function qaUnavailable(defs: QaCheckDef[], why: string): QAResult[] {
  return defs.map(def => ({
    check: def.label, target: def.target,
    observed: `not checked, ${why}`, pass: false, status: 'unknown' as const,
  }))
}

/** 어긋난 컷 한 장을 고치는 편집 지시 · 새 디자인이 아니라 같은 물건의 교정이다 */
export function qaFixPrompt(fails: QAResult[], specPhrase: string): string {
  return [
    'Correct this product photograph. It is the same piece, not a new design.',
    'Keep the silhouette, proportions, camera angle, background and lighting exactly as they are.',
    `Fix only this, which is wrong in this cut: ${fails.map(f =>
      `${f.check.toLowerCase()} must read as ${f.target}, it currently reads as ${f.observed}`).join('; ')}.`,
    `The piece is: ${specPhrase}.`,
    'Change nothing else. No text, no watermark, no human, no props.',
  ].join(' ')
}
