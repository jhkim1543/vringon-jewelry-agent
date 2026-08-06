// ── 파라메트릭 스케치/렌더 SVG · 스펙이 먼저, 이미지가 나중 (지시서 5장)
// 스톤 수·프롱 수·힐 높이·토 셰이프·패널 수가 실제 도형에 반영된다.
import type { DesignSpec } from './types'

export type ViewKey = 'front' | 'q45' | 'detail' | 'lateral' | 'q34' | 'top' | 'outsole' | 'wear'
export type RenderMode = 'sketch' | 'render'

const COLORWAY_HUES: Record<string, [string, string]> = {
  original: ['#C9CDD6', '#9AA0AD'],
  gold: ['#D9B96C', '#A8833B'],
  black: ['#4A4A52', '#26262C'],
  bordeaux: ['#9C5560', '#6B3540'],
  ivory: ['#E4DECE', '#B5AD97'],
}
export const COLORWAY_NAMES = Object.keys(COLORWAY_HUES).filter(k => k !== 'original')

function svgWrap(inner: string, mode: RenderMode): string {
  const bg = mode === 'sketch' ? '#F5F4F0' : '#FAFAF8'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="${bg}"/>${inner}</svg>`
}

function stroke(mode: RenderMode) {
  return mode === 'sketch'
    ? `fill="none" stroke="#3A3A40" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`
    : `stroke="#2E2E33" stroke-width="0.8" stroke-linejoin="round"`
}

// ════════ 주얼리 ════════
function ringSVG(f: Record<string, any>, mode: RenderMode, view: ViewKey, cw: string): string {
  const [hi, lo] = COLORWAY_HUES[cw] ?? COLORWAY_HUES.original
  const s = stroke(mode)
  const stones = Math.min(18, Number(f.stone_count) || 1)
  const stoneR = Math.max(2.5, Math.min(8, Number(f.stone_size_mm) * 1.8))
  const bandW = f.setting_type === 'bezel' ? 9 : 7
  const fill = mode === 'render' ? `fill="url(#m)"` : 'fill="none"'
  const defs = mode === 'render' ? `<defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs>` : ''
  let stonesSvg = ''
  const cx = 100, cy = view === 'detail' ? 120 : 78
  if (stones === 1) {
    stonesSvg = gem(cx, cy - 26, stoneR * 2.2, mode, hi)
    if (f.setting_type === 'prong') {
      const pc = Number(f.prong_count) || 4
      for (let i = 0; i < pc; i++) {
        const a = (i / pc) * Math.PI * 2 - Math.PI / 2
        stonesSvg += `<line x1="${cx + Math.cos(a) * stoneR * 2.4}" y1="${cy - 26 + Math.sin(a) * stoneR * 2.4}" x2="${cx + Math.cos(a) * stoneR * 3.1}" y2="${cy - 26 + Math.sin(a) * stoneR * 3.1}" ${s}/>`
      }
    } else if (f.setting_type === 'bezel') {
      stonesSvg += `<circle cx="${cx}" cy="${cy - 26}" r="${stoneR * 2.6}" ${s} fill="none"/>`
    }
  } else {
    // 멀티스톤: 링 상단 아크에 배열 (halo/pave)
    const arcR = 34
    for (let i = 0; i < stones; i++) {
      const a = Math.PI * (0.15 + 0.7 * (i / Math.max(1, stones - 1))) + Math.PI
      stonesSvg += gem(cx + Math.cos(a) * arcR, cy + 20 + Math.sin(a) * arcR, Math.max(2.2, stoneR), mode, hi)
    }
  }
  const scale = view === 'detail' ? 'scale(1.45) translate(-31,-38)' : view === 'q45' ? 'scale(1 .78) translate(0 28)' : ''
  return svgWrap(`${defs}<g transform="${scale}">
    <ellipse cx="100" cy="112" rx="42" ry="46" ${s} ${fill}/>
    <ellipse cx="100" cy="112" rx="${42 - bandW}" ry="${46 - bandW}" ${s} fill="${mode === 'render' ? '#FAFAF8' : 'none'}"/>
    ${stonesSvg}</g>`, mode)
}

function gem(x: number, y: number, r: number, mode: RenderMode, hue: string): string {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    return `${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`
  }).join(' ')
  const fill = mode === 'render' ? `fill="#EDF2F7" stroke="${hue}" stroke-width="0.8"` : `fill="none" stroke="#3A3A40" stroke-width="1.2"`
  return `<polygon points="${pts}" ${fill}/><line x1="${x - r * 0.5}" y1="${y - r * 0.4}" x2="${x + r * 0.5}" y2="${y + r * 0.4}" stroke="${mode === 'render' ? hue : '#3A3A40'}" stroke-width="0.6"/>`
}

function earringSVG(f: Record<string, any>, mode: RenderMode, view: ViewKey, cw: string): string {
  const [hi, lo] = COLORWAY_HUES[cw] ?? COLORWAY_HUES.original
  const s = stroke(mode)
  const stones = Math.min(9, Number(f.stone_count) || 1)
  const defs = mode === 'render' ? `<defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs>` : ''
  const fill = mode === 'render' ? `fill="url(#m)"` : 'fill="none"'
  const one = (ox: number) => {
    let drop = ''
    for (let i = 0; i < stones; i++) {
      const t = i / Math.max(1, stones - 1)
      drop += gem(ox, 78 + t * 62, Math.max(2.4, 6 - t * 3), mode, hi)
    }
    return `<circle cx="${ox}" cy="58" r="9" ${s} ${fill}/>
      <line x1="${ox}" y1="67" x2="${ox}" y2="74" ${s}/>${drop}`
  }
  // 페어: 좌우 2개 (지시서 6.5 · 페어 일관성)
  return svgWrap(`${defs}${one(70)}${view === 'detail' ? '' : one(130)}`, mode)
}

function necklaceSVG(f: Record<string, any>, mode: RenderMode, view: ViewKey, cw: string): string {
  const [hi, lo] = COLORWAY_HUES[cw] ?? COLORWAY_HUES.original
  const s = stroke(mode)
  const stones = Math.min(16, Number(f.stone_count) || 1)
  const defs = mode === 'render' ? `<defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs>` : ''
  // 체인: 링크 반복
  let chain = ''
  const links = 26
  for (let i = 0; i <= links; i++) {
    const t = i / links
    const x = 30 + t * 140
    const y = 40 + Math.sin(t * Math.PI) * 52
    chain += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" ${s} fill="none"/>`
  }
  let pend = ''
  if (stones === 1) pend = gem(100, 118, 9, mode, hi)
  else {
    // halo 펜던트
    pend = gem(100, 118, 6.5, mode, hi)
    for (let i = 0; i < Math.min(stones - 1, 14); i++) {
      const a = (i / Math.min(stones - 1, 14)) * Math.PI * 2
      pend += gem(100 + Math.cos(a) * 14, 118 + Math.sin(a) * 14, 2.8, mode, hi)
    }
  }
  pend += `<path d="M100 96 L96 104 L104 104 Z" ${s} ${mode === 'render' ? `fill="url(#m)"` : ''}/>`
  return svgWrap(`${defs}${chain}${pend}`, mode)
}

function braceletSVG(f: Record<string, any>, mode: RenderMode, view: ViewKey, cw: string): string {
  const [hi, lo] = COLORWAY_HUES[cw] ?? COLORWAY_HUES.original
  const s = stroke(mode)
  const stones = Math.min(12, Number(f.stone_count) || 0)
  const defs = mode === 'render' ? `<defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs>` : ''
  const fill = mode === 'render' ? `fill="url(#m)"` : 'fill="none"'
  let st = ''
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2
    st += gem(100 + Math.cos(a) * 52, 100 + Math.sin(a) * 44, 3, mode, hi)
  }
  return svgWrap(`${defs}
    <ellipse cx="100" cy="100" rx="58" ry="50" ${s} ${fill}/>
    <ellipse cx="100" cy="100" rx="46" ry="38" ${s} fill="${mode === 'render' ? '#FAFAF8' : 'none'}"/>
    ${st}<rect x="94" y="44" width="12" height="10" rx="3" ${s} ${fill}/>`, mode)
}

// ════════ 신발 (lateral 기준 · 지시서 7.6) ════════

// 세부 품목 → 도식 계열
const JEWEL_SHAPE: Record<string, 'ring' | 'earring' | 'necklace' | 'bracelet'> = {
  band_ring: 'ring', solitaire: 'ring', eternity: 'ring', signet: 'ring',
  stud: 'earring', hoop: 'earring', drop: 'earring', ear_cuff: 'earring',
  pendant: 'necklace', choker: 'necklace', chain_necklace: 'necklace', station: 'necklace', anklet: 'necklace',
  bangle: 'bracelet', chain_bracelet: 'bracelet', cuff: 'bracelet', tennis: 'bracelet', brooch: 'bracelet',
}

export function designSVG(spec: DesignSpec, mode: RenderMode, view: ViewKey, colorway = 'original'): string {
  const f = spec.fields as Record<string, any>
  switch (JEWEL_SHAPE[spec.itemType] ?? 'ring') {
    case 'ring': return ringSVG(f, mode, view, colorway)
    case 'earring': return earringSVG(f, mode, view, colorway)
    case 'necklace': return necklaceSVG(f, mode, view, colorway)
    default: return braceletSVG(f, mode, view, colorway)
  }
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
