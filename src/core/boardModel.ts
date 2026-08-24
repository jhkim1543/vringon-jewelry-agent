// ── 품평 보드 모델 · 화면(React Flow)과 Miro 내보내기가 같은 구조를 쓴다 ──
// 순서: 스케치 프롬프트 → 스케치 → 디자인 프롬프트 → 디자인 → 멀티 생성 → 선정·3D
// 조사·신호·디렉션은 보드에 올리지 않는다 — 그건 분석 리포트의 일이고,
// 보드는 "무슨 문장으로 무엇이 그려졌고 거기서 무엇이 파생됐는가"의 계보만 보인다.
// 연결(edge)은 장식이 아니라 실제 데이터다. 각 이미지의 promptUsed 와
// origin/editedFrom 이 곧 선이 된다.
import type { Design, RunState } from './types'
import { TIER_LABEL } from './types'
import { buildLocalPitch } from './pitch'
import { t, tf } from './i18n'

export type BoardNodeKind = 'prompt' | 'design' | 'selection' | 'appendix'

export interface BoardNode {
  id: string
  kind: BoardNodeKind
  column: number            // 0..5 · 좌에서 우로 흐른다
  row: number
  title: string
  body: string[]
  tone?: 'neutral' | 'accent' | 'warn' | 'muted'
  design?: Design           // design 노드일 때만
  imageUrl?: string
  /** 3D 모델 (GLB) · 보드에서 뷰어로 돌려 본다 */
  modelUrl?: string
  isPitch?: boolean         // 발표 근거 카드
}

export interface BoardEdge {
  from: string
  to: string
  label?: string
  weight?: number           // 굵기 · 기여도
  dashed?: boolean
}

export interface BoardModel {
  columns: { key: string; title: string; note: string }[]
  nodes: BoardNode[]
  edges: BoardEdge[]
}

export function buildBoardModel(st: RunState): BoardModel {
  const nodes: BoardNode[] = []
  const edges: BoardEdge[] = []

  const columns = [
    { key: 'sketchPrompt', title: t('1 · Sketch prompt'), note: t('The exact sentence sent to the image model') },
    { key: 'sketch', title: t('2 · Sketch'), note: t('The form is fixed here, in ink') },
    { key: 'designPrompt', title: t('3 · Design prompt'), note: t('Turns the sketch into a photoreal design, geometry kept') },
    { key: 'design', title: t('4 · Designs'), note: t('Spec, rules, image') },
    { key: 'multi', title: t('5 · Multi generation'), note: t('Views, colorways, variations and campaign cuts, all edits of the base') },
    { key: 'final', title: t('6 · Selection and 3D'), note: t('Top picks, MD feedback and the showroom') },
  ]

  const alive = st.designs.filter(d => !d.rejected)
  const rejected = st.designs.filter(d => d.rejected)
  const deck = buildLocalPitch(st)
  const pitchOf = (id: string) => deck.designPitches.find(x => x.design_id === id)

  // 프롬프트가 저장되지 않은 옛 저장본을 위한 한 줄
  const promptOf = (p?: string) => p ?? t('Prompt not stored for this older run')

  let skRow = 0        // 스케치 열 · 원본과 변형이 함께 쌓인다
  let multiRow = 0     // 멀티 생성 열
  let finalRow = 0     // 선정·3D 열

  alive.forEach((d, i) => {
    const id = d.spec.design_id
    const sketch = d.images.find(im => im.view === 'sketch')
    const sketchVars = d.images.filter(im => im.view === 'sketch_var')
    const base = d.images.find(im => im.origin === 'generated' && im.view !== 'sketch')
    const hero = base ?? sketch ?? d.images[0]

    // ── 1 스케치 프롬프트 · 이 문장이 스케치를 만들었다 ──────────────
    nodes.push({
      id: `skp-${id}`, kind: 'prompt', column: 0, row: i,
      title: `${id} · ${t('Sketch prompt')}`,
      body: [
        ...(d.recipe ? [tf('Recipe: {title}', { title: d.recipe.title })] : []),
        promptOf(sketch?.promptUsed),
      ],
      tone: 'muted',
    })

    // ── 2 스케치 · 외형은 여기서 확정된다 ────────────────────────────
    if (sketch) {
      nodes.push({
        id: `sk-${id}`, kind: 'design', column: 1, row: skRow++,
        title: `${id} · ${t('Sketch')}`,
        body: sketchVars.length ? [tf('{n} variant sketches, same form', { n: sketchVars.length })] : [],
        imageUrl: sketch.url,
      })
      edges.push({ from: `skp-${id}`, to: `sk-${id}`, label: t('generated') })
      sketchVars.forEach((v, k) => {
        nodes.push({
          id: `sk-${id}-v${k}`, kind: 'design', column: 1, row: skRow++,
          title: `${id} · ${tf('Variant {n}', { n: k + 2 })}`,
          body: [t('Same form, varied detailing')],
          imageUrl: v.url,
        })
        edges.push({ from: `sk-${id}`, to: `sk-${id}-v${k}`, label: t('variant'), dashed: true })
      })
    } else {
      // 이미지 상한 밖 · 스케치 없이 도식만 남은 디자인
      nodes.push({
        id: `sk-${id}`, kind: 'design', column: 1, row: skRow++,
        title: `${id} · ${t('Sketch')}`,
        body: [t('Past the image cap, so this one stayed a diagram')],
        tone: 'muted',
      })
      edges.push({ from: `skp-${id}`, to: `sk-${id}`, dashed: true })
    }

    // ── 3 디자인 프롬프트 · 스케치를 실사로 옮긴 지시 ─────────────────
    nodes.push({
      id: `dp-${id}`, kind: 'prompt', column: 2, row: i,
      title: `${id} · ${t('Design prompt')}`,
      body: [promptOf(base?.promptUsed)],
      tone: 'muted',
    })
    edges.push({ from: `sk-${id}`, to: `dp-${id}`, dashed: true })

    // ── 4 디자인 · 스펙·룰·QA 를 붙인 본 카드 ───────────────────────
    nodes.push({
      id, kind: 'design', column: 3, row: i,
      title: `${id} · ${TIER_LABEL[d.spec.tier]}`,
      body: [...d.metrics.map(m => `${m.label} ${m.value}`)],
      design: d, imageUrl: hero?.url,
    })
    edges.push({ from: `dp-${id}`, to: id, label: t('colourised') })

    // ── 5 멀티 생성 · 전부 기준 렌더의 편집이다 ──────────────────────
    const pushMulti = (nid: string, title: string, note: string, url: string | undefined, label: string, from = id) => {
      if (!url) return
      nodes.push({
        id: nid, kind: 'design', column: 4, row: multiRow++,
        title, body: [note], imageUrl: url,
      })
      edges.push({ from, to: nid, label })
    }
    // 변형 스케치에서 나온 추가 디자인 · 원류가 변형 스케치임을 선으로 남긴다
    d.images.filter(im => im.view === 'design').forEach((im, k) => {
      pushMulti(`des-${id}-${k}`, `${id} · ${tf('Design {n}', { n: k + 2 })}`,
        t('Colourised from a variant sketch of the same form'), im.url, t('colourised'),
        k < sketchVars.length ? `sk-${id}-v${k}` : `sk-${id}`)
    })
    // 추가 뷰
    d.images.filter(im => im.origin === 'edited_from' && !im.colorway
      && !['sketch', 'sketch_var', 'design', 'variation', 'wear', 'concept'].includes(im.view))
      .forEach(im => {
        if (im === base) return
        pushMulti(`view-${id}-${im.view}`, `${id} · ${im.view}`,
          t('Same product, camera moved by an edit'), im.url, t('view'))
      })
    // 컬러웨이
    d.images.filter(im => !!im.colorway).forEach(im => {
      pushMulti(`cw-${id}-${im.colorway}`, `${id} · ${im.colorway}`,
        t('Same form, only the material recoloured'), im.url, t('colorway'))
    })
    // 베리에이션 · 축 하나씩 바꾼 제품안
    d.images.filter(im => im.view === 'variation').forEach((im, k) => {
      pushMulti(`var-${id}-${k}`, `${id} · ${im.variantAxis ?? t('Variation')}`,
        t('Same silhouette, one axis changed, so the two stay comparable.'), im.url, t('variation'))
    })
    // 캠페인 컷 · 착용과 연출
    d.images.filter(im => im.view === 'wear' || im.view === 'concept').forEach((im, k) => {
      pushMulti(`shot-${id}-${k}`,
        `${id} · ${im.view === 'wear' ? t('Virtual fitting') : (im.conceptLabel ?? t('Concept'))}`,
        im.view === 'wear' ? t('Simulated wear. The real fit may differ.')
          : (im.persona ? tf('Virtual model: {persona}', { persona: im.persona }) : t('Staged for the concept, not a real shoot.')),
        im.url, t('campaign'))
    })
  })

  if (rejected.length) {
    nodes.push({
      id: 'rejected', kind: 'design', column: 3, row: alive.length,
      title: tf('{n} rejected on rules', { n: rejected.length }),
      body: rejected.slice(0, 4).map(d =>
        `${d.spec.design_id} · ${d.ruleResults.filter(r => r.severity === 'fail').map(r => r.rule).join(', ')}`),
      tone: 'muted',
    })
  }

  // ── 6 선정 · 3D ──────────────────────────────────────────────────
  const top = st.designs.filter(d => d.isTop)
  if (top.length) {
    nodes.push({
      id: 'top', kind: 'selection', column: 5, row: finalRow++,
      title: tf('Top {n}', { n: top.length }),
      body: [
        ...top.map(d => `${tf('{id} · {tier} · distance {distance}', { id: d.spec.design_id, tier: TIER_LABEL[d.spec.tier], distance: d.topDistance ?? t('n/a') })}${d.mdReview ? ` · MD ${d.mdReview.verdict}` : ''}`),
        ...(st.mdPickRationale ? [`MD: ${st.mdPickRationale}`] : []),
      ],
      tone: 'accent',
    })
    top.forEach(d => edges.push({ from: d.spec.design_id, to: 'top', label: t('selected') }))

    const reviewed = st.designs.filter(d => d.mdReview)
    if (reviewed.length) {
      nodes.push({
        id: 'md-review', kind: 'selection', column: 5, row: finalRow++,
        title: t('MD feedback'),
        body: reviewed.slice(0, 6).map(d =>
          `${d.spec.design_id} · ${d.mdReview!.verdict}: ${d.mdReview!.reason}${d.mdReview!.fix ? ` · ${tf('Fix: {fix}', { fix: d.mdReview!.fix })}` : ''}`),
        tone: 'accent',
      })
      for (const d of reviewed.slice(0, 6)) edges.push({ from: d.spec.design_id, to: 'md-review', label: 'MD', dashed: true })
    }

    // 발표 근거 · 왜 이 안인가 (top 에만 붙는다)
    top.forEach(d => {
      const pit = pitchOf(d.spec.design_id)
      if (!pit) return
      nodes.push({
        id: `pitch-${d.spec.design_id}`, kind: 'selection', column: 5, row: finalRow++,
        title: `${d.spec.design_id} · ${t('Why this one')}`,
        body: [
          pit.why[0],
          pit.feasibility[0],
          ...(pit.objections.length ? [tf('Objection: {q} - {a}', { q: pit.objections[0].q, a: pit.objections[0].a })] : []),
        ].filter(Boolean),
        tone: 'muted',
        isPitch: true,
      })
      edges.push({ from: d.spec.design_id, to: `pitch-${d.spec.design_id}`, label: t('reasoning'), dashed: true })
    })

    // 3D · 멀티뷰에서 구운 모델
    top.forEach(d => {
      if (!d.model) return
      const id = `model-${d.spec.design_id}`
      nodes.push({
        id, kind: 'selection', column: 5, row: finalRow++,
        title: `${d.spec.design_id} · 3D`,
        body: [
          tf('Built from {n} views of this design, not from one photo.', { n: d.model.views }),
          t('Drag to turn it. Scroll to zoom. Click the image to open it full size.'),
          ...(d.model.note ? [d.model.note] : []),
        ],
        modelUrl: d.model.url,
        imageUrl: (d.images.find(i => i.origin === 'generated' && i.view !== 'sketch') ?? d.images[0])?.url,
      })
      edges.push({ from: d.spec.design_id, to: id, label: t('3D showroom') })
    })
  }

  const approved = st.designs.filter(d => d.verdict === 'approve')
  const rejectedByUser = st.designs.filter(d => d.verdict === 'reject')
  if (approved.length || rejectedByUser.length) {
    const tagCount: Record<string, number> = {}
    rejectedByUser.forEach(d => d.verdictTags?.forEach(t => { tagCount[t] = (tagCount[t] ?? 0) + 1 }))
    nodes.push({
      id: 'verdict', kind: 'selection', column: 5, row: finalRow++,
      title: t('Review calls'),
      body: [
        tf('{approved} approved · {rejected} rejected', { approved: approved.length, rejected: rejectedByUser.length }),
        ...(Object.keys(tagCount).length ? [tf('Reasons: {list}', { list: Object.entries(tagCount).map(([k, v]) => `${k} ${v}`).join(', ') })] : []),
        t('Rejected designs are dropped from the rest of this run. Nothing carries over to a later run.'),
      ],
    })
    approved.forEach(d => edges.push({ from: d.spec.design_id, to: 'verdict', label: t('approved') }))
    rejectedByUser.forEach(d => edges.push({ from: d.spec.design_id, to: 'verdict', label: t('rejected'), dashed: true }))
  }

  nodes.push({
    id: 'appendix', kind: 'appendix', column: 5, row: finalRow++,
    title: t('Appendix · assumptions and limits'),
    body: [
      t('Costs are rough. The band, the assumptions and what is excluded sit on each card.'),
      t('Worn shots are simulated. The real fit may differ.'),
      t('Competitor references were read for attributes only and never fed into generation.'),
      t('Generated elements may not be copyrightable depending on jurisdiction.'),
      // 분석(조사·신호·디렉션)은 이 보드에 없다 · 리포트 화면이 그걸 맡는다
      t('The research behind these designs lives in the Analysis tab, not on this board.'),
    ],
    tone: 'muted',
  })

  return { columns, nodes, edges }
}
