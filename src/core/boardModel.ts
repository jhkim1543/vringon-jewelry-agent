// ── 품평 보드 모델 · 16:9 카드 덱 ────────────────────────────────────
// 개편 스펙: 보드는 발표용 카드 덱이다. 에이전트 1·2 는 레퍼런스 카드 2장(1-5 / 6-10)
// 뒤에 디자인 쌍 카드가 하나씩, 컬렉션은 표지 1장 + 세트당 1장.
// 발표 모드는 이 카드들을 PPT 쇼처럼 한 장씩 크게 넘긴다.
import type { DesignPair, Reference, RunState } from './types'
import { agesOf, GENDER_LABEL, ITEM_LABEL, MODE_LABEL, regionsLabel, targetText } from './types'
import { t, tf } from './i18n'

export interface RefCell {
  slot: number; title: string; subtitle: string
  price?: number; currency?: string
  imageUrl: string; shot?: string
}

export type SlidePayload =
  | { type: 'cover'; title: string; subtitle: string; lines: string[]; imageUrl?: string }
  | { type: 'refs'; heading: string; cells: RefCell[] }
  | { type: 'design'; pair: DesignPair; ref?: Reference; target: string }
  | {
      type: 'set'
      name: string; kind: string; concept: string
      palette: string[]; metal: string; surface: string; stones: string; motif: string
      dna: string[]
      conceptImg?: string; lineupImg?: string
      items: { item: string; feature: string; imageUrl?: string }[]
      story: string
    }

export interface BoardNode {
  id: string
  kind: 'slide'
  column: number
  row: number
  title: string
  body: string[]
  slide: SlidePayload
  tone?: 'neutral' | 'accent' | 'muted'
}

export interface BoardEdge { from: string; to: string; label?: string; dashed?: boolean }

export interface BoardModel {
  columns: { key: string; title: string; note: string }[]
  nodes: BoardNode[]
  edges: BoardEdge[]
}

/** 카드 배치 · 한 줄에 3장씩 격자로 놓는다. 발표 순서는 배열 순서다. */
function place(nodes: BoardNode[]): BoardNode[] {
  return nodes.map((n, i) => ({ ...n, column: i % 3, row: Math.floor(i / 3) }))
}

export function buildBoardModel(st: RunState): BoardModel {
  const p = st.params
  const nodes: BoardNode[] = []
  const target = targetText(p.target)
  const targetLabel = `${agesOf(p.target).join(', ')} · ${t(GENDER_LABEL[p.target.gender])}`

  if (p.mode === 'collection') {
    // ── 표지 ─────────────────────────────────────────────────────────
    const rep = st.sets?.find(s => s.lineup)?.lineup?.url ?? st.sets?.[0]?.art?.atmosphere?.url
    nodes.push({
      id: 'cover', kind: 'slide', column: 0, row: 0,
      title: t('Collection cover'), body: [],
      slide: {
        type: 'cover',
        title: p.direction.slice(0, 60) || t('Jewelry collection'),
        subtitle: `${t(MODE_LABEL[p.mode])} · ${regionsLabel(p)} · ${targetLabel}`,
        lines: [
          ...(st.sets ?? []).map(s => `${s.name} — ${s.concept}`),
          tf('{n} items per set: {list}', { n: p.items.length, list: p.items.map(i => t(ITEM_LABEL[i])).join(', ') }),
        ],
        imageUrl: rep,
      },
      tone: 'accent',
    })
    // ── 세트 카드 · 세트당 한 장 ─────────────────────────────────────
    for (const s of st.sets ?? []) {
      const items = p.items.map(item => {
        const pair = st.pairs.find(x => x.setName === s.name && x.item === item)
        return {
          item: t(ITEM_LABEL[item]),
          feature: pair?.feature ?? (pair?.error ? t('generation failed') : t('pending')),
          imageUrl: pair?.versions[pair.versions.length - 1]?.url,
        }
      })
      nodes.push({
        id: `set-${s.name}`, kind: 'slide', column: 0, row: 0,
        title: s.name, body: [],
        slide: {
          type: 'set', name: s.name, kind: s.kind, concept: s.concept,
          palette: s.palette, metal: s.metal, surface: s.surface, stones: s.stones, motif: s.motif,
          dna: s.design_dna, conceptImg: s.art?.atmosphere?.url ?? s.art?.form?.url,
          lineupImg: s.lineup?.url, items, story: s.story,
        },
      })
    }
    return { columns: [], nodes: place(nodes), edges: [] }
  }

  // ── 에이전트 1·2 · 레퍼런스 카드 두 장 (1-5 / 6-10) ─────────────────
  const refs = [...st.references].sort((a, b) => a.slot - b.slot)
  const cellOf = (r: Reference): RefCell => ({
    slot: r.slot, title: r.title, subtitle: r.subtitle,
    price: r.price, currency: r.currency, imageUrl: r.imageUrl, shot: r.shot,
  })
  if (refs.length) {
    nodes.push({
      id: 'refs-1', kind: 'slide', column: 0, row: 0,
      title: t('References 1-5'), body: [],
      slide: { type: 'refs', heading: t('References 1-5'), cells: refs.slice(0, 5).map(cellOf) },
      tone: 'accent',
    })
    if (refs.length > 5) nodes.push({
      id: 'refs-2', kind: 'slide', column: 0, row: 0,
      title: t('References 6-10'), body: [],
      slide: { type: 'refs', heading: t('References 6-10'), cells: refs.slice(5, 10).map(cellOf) },
      tone: 'accent',
    })
  }

  // ── 디자인 카드 · 쌍 하나당 한 장, 좌측 상단에 타겟 고객 ─────────────
  for (const pair of [...st.pairs].sort((a, b) => a.id.localeCompare(b.id))) {
    const ref = refs.find(r => r.slot === pair.refSlot)
    nodes.push({
      id: `pair-${pair.id}`, kind: 'slide', column: 0, row: 0,
      title: `${pair.id} · ${pair.title}`,
      body: [],
      slide: { type: 'design', pair, ref, target },
      tone: pair.error ? 'muted' : 'neutral',
    })
  }

  return { columns: [], nodes: place(nodes), edges: [] }
}
