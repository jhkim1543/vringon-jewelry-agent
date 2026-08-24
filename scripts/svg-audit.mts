// ── 도식 SVG 감사 ──────────────────────────────────────────────────
// designSVG 가 만드는 SVG 를 전부 XML 로 파싱해 본다.
//
//   npx tsx scripts/svg-audit.mts
//
// 왜 필요한가 · 이 SVG 들은 data: URI 로 <img> 에 들어간다. XML 로 조금이라도
// 어긋나면 브라우저는 조용히 아무것도 그리지 않는다(naturalWidth 0). 콘솔 오류도
// 나지 않는다. 실제로 한 요소에 fill 이 두 번 붙어 스케치 도식이 전부 깨져 있었고,
// 화면을 열어 보기 전까지 아무도 몰랐다.
import { designSVG } from '../src/core/sketch'
import { ALL_TYPES } from '../src/core/types'
import type { DesignSpec } from '../src/core/types'
import type { RenderMode, ViewKey } from '../src/core/sketch'

const MODES: RenderMode[] = ['sketch', 'render']
const VIEWS: ViewKey[] = ['front', 'q45', 'detail']
const COLORWAYS = ['original', 'gold', 'black', 'bordeaux', 'ivory']

/** 스톤 수·세팅을 바꿔 가며 분기를 모두 지나가게 한다 */
const CASES = [
  { stone_count: 0, setting_type: 'none', prong_count: 4 },
  { stone_count: 1, setting_type: 'prong', prong_count: 6 },
  { stone_count: 1, setting_type: 'bezel', prong_count: 4 },
  { stone_count: 9, setting_type: 'pave', prong_count: 4 },
]

function spec(itemType: string, c: Record<string, unknown>): DesignSpec {
  return {
    design_id: 'audit', tier: 'core', category: 'jewelry', itemType,
    fields: {
      metal: '925 sterling silver', plating: 'none', target_weight_g: 2.2,
      stone_size_mm: 1.6, min_wall_thickness_mm: 1, chain_type: 'none',
      finish: 'polished', is_pair: false, is_new_mold: false, existing_mold_id: 'M',
      band_width_mm: 2.4, ...c,
    },
    fieldsLocked: [],
  } as unknown as DesignSpec
}

/** 같은 요소에 같은 속성이 두 번 오는지 · XML 파서가 이걸로 문서를 통째로 버린다 */
function dupAttr(svg: string): string | null {
  for (const tag of svg.match(/<[a-zA-Z]+\s[^>]*>/g) ?? []) {
    const seen = new Set<string>()
    for (const m of tag.matchAll(/([a-zA-Z-]+)\s*=\s*"/g)) {
      if (seen.has(m[1])) return `${m[1]} · ${tag.slice(0, 90)}`
      seen.add(m[1])
    }
  }
  return null
}

/** 열고 닫는 태그 수가 맞는지 · 간단하지만 잘린 SVG 를 잡는다 */
function wellFormed(svg: string): string | null {
  if (!svg.startsWith('<svg')) return 'svg 로 시작하지 않는다'
  if (!svg.trimEnd().endsWith('</svg>')) return '</svg> 로 끝나지 않는다'
  if (/NaN|undefined|Infinity/.test(svg)) return `숫자가 깨졌다 · ${(svg.match(/\S*(NaN|undefined|Infinity)\S*/) ?? [''])[0]}`
  const open = (svg.match(/<g[\s>]/g) ?? []).length
  const close = (svg.match(/<\/g>/g) ?? []).length
  if (open !== close) return `<g> ${open}개 · </g> ${close}개`
  return null
}

let n = 0
const bad: string[] = []
for (const ty of ALL_TYPES) {
  for (const mode of MODES) {
    for (const view of VIEWS) {
      for (const cw of COLORWAYS) {
        for (const c of CASES) {
          n++
          const svg = designSVG(spec(ty.id, c), mode, view, cw)
          const why = dupAttr(svg) ?? wellFormed(svg)
          if (why) bad.push(`${ty.id} · ${mode}/${view}/${cw} · stones ${c.stone_count} ${c.setting_type}\n      ${why}`)
        }
      }
    }
  }
}

console.log(`도식 ${n}개 검사 · 품목 ${ALL_TYPES.length} × 모드 ${MODES.length} × 뷰 ${VIEWS.length} × 컬러웨이 ${COLORWAYS.length} × 스톤 ${CASES.length}`)
if (bad.length) {
  console.log(`\n── 깨진 도식 ${bad.length}개 (화면에서는 빈 칸으로만 보인다)`)
  for (const b of bad.slice(0, 20)) console.log('   ' + b)
  if (bad.length > 20) console.log(`   … 외 ${bad.length - 20}개`)
}
console.log('\n' + '─'.repeat(58))
console.log(bad.length === 0 ? '통과 · 깨진 도식 0개' : `실패 · 깨진 도식 ${bad.length}개`)
process.exit(bad.length === 0 ? 0 : 1)
