// ── 품평 보드 모델 · 화면(React Flow)과 Miro 내보내기가 같은 구조를 쓴다 ──
// 순서: 입력 → 조사 → 신호 → 디렉션 → 디자인 → 선정
// 연결(edge)은 장식이 아니라 실제 데이터다. 디자인이 어떤 신호에서 나왔는지는
// rationale.driving_signals에, 디렉션이 어떤 신호를 묶었는지는 signal_ids에 있다.
import type { Design, RunState } from './types'
import { MODE_LABEL, MODE_SCOPE, TIER_LABEL, uploadImages, uploadName } from './types'
import { buildLocalPitch } from './pitch'
import type { SeasonDossier } from './research'
import { GRADE_LABEL, metricText , shotUrl } from './research'

export type BoardNodeKind =
  | 'input' | 'research' | 'signal' | 'direction' | 'design' | 'selection' | 'appendix'

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
  const p = st.params
  const scope = MODE_SCOPE[p.mode]
  const nodes: BoardNode[] = []
  const edges: BoardEdge[] = []

  const columns = [
    { key: 'input', title: '1 · Input', note: 'What you gave it' },
    { key: 'research', title: '2 · Research', note: scope.competitor ? 'What the agent collected' : scope.trend ? 'Trend research' : 'Your uploads, read' },
    { key: 'signal', title: '3 · Signals', note: 'Observations with a source' },
    { key: 'direction', title: '4 · Directions', note: 'Signals combined' },
    { key: 'design', title: '5 · Designs', note: 'Spec, rules, image' },
    { key: 'selection', title: '6 · Selection', note: 'Metrics and calls' },
    { key: 'variation', title: '7 · Variations', note: 'One sketch, several products' },
    { key: 'campaign', title: '8 · Campaign shots', note: 'Worn on a model, staged on set' },
    { key: 'showroom', title: '9 · 3D showroom', note: 'Turn it, or open it full size' },
  ]

  // ── 1 입력 ──────────────────────────────────────────────────────
  const inputBody: string[] = []
  if (p.mode === 'trend') {
    inputBody.push(`${p.trend.competitors.length} competitors: ${p.trend.competitors.join(', ')}`)
    inputBody.push(`Your band KRW ${(p.trend.priceMinKrw / 10000).toFixed(0)}0k-${(p.trend.priceMaxKrw / 10000).toFixed(0)}0k · ${p.trend.priceBand}`)
  } else if (p.mode === 'series') {
    inputBody.push(`Series "${p.series.seriesName || 'untitled'}" · ${p.series.archiveFiles.length} designs`)
    if (p.series.valueStatement) inputBody.push(`Value: ${p.series.valueStatement.slice(0, 90)}`)
    inputBody.push(p.series.trendSearch ? 'Trend research on, no competitor research' : 'No outside research')
  } else {
    inputBody.push(`${p.moodboard.files.length} uploads: ${p.moodboard.files.map(uploadName).join(', ') || 'none'}`)
    inputBody.push('Nothing outside these files')
  }
  nodes.push({
    id: 'in', kind: 'input', column: 0, row: 0,
    title: `${MODE_LABEL[p.mode]} mode input`, body: inputBody, tone: 'accent',
  })

  // ── 2 조사 ──────────────────────────────────────────────────────
  let researchIds: string[] = []
  if (p.mode === 'trend') {
    const inBand = st.competitors.filter(c => c.in_band)
    const out = st.competitors.filter(c => !c.in_band)
    // 요약 한 장 + 제품별 사진 카드. 조사 레인은 글이 아니라 실물이 보여야 한다.
    nodes.push({
      id: 'r-comp', kind: 'research', column: 1, row: 0,
      title: 'Competitor products',
      body: [
        `${st.competitors.length} collected · ${inBand.length} inside the band`,
        ...(out.length ? [`${out.length} dropped: ${out.map(c => c.brand).join(', ')} (outside the band)`] : []),
      ],
    })
    // 조사 레인은 글이 아니라 실물이 말한다 · 사진 크게, 캡션은 한 줄
    inBand.slice(0, 6).forEach((c, k) => {
      nodes.push({
        id: `cp-${k}`, kind: 'research', column: 1, row: 1 + k * 2.2,
        title: `${c.brand} · ${c.name.slice(0, 26)}`,
        imageUrl: shotUrl(c.image_urls?.[0] ?? '', c.product_url) || undefined,
        body: [
          `KRW ${(c.price_krw / 1000).toLocaleString()}k${c.competitor_class ? ` · ${c.competitor_class}` : ''}${c.design_traits?.[0] ? ` · ${c.design_traits[0]}` : ''}`,
        ],
      })
      edges.push({ from: 'r-comp', to: `cp-${k}` })
    })
    // 백화점·명품몰 베스트셀러 · "지금 실제로 팔리는 것"의 사진이 경쟁 구도의 기준점이다
    const best = st.bestsellers ?? []
    if (best.length) {
      nodes.push({
        id: 'r-best', kind: 'research', column: 1, row: 13,
        title: 'Department store bestsellers',
        body: [`${best.length} products · ${[...new Set(best.map(b => b.retailer))].slice(0, 3).join(', ')}`],
        tone: 'accent',
      })
      edges.push({ from: 'in', to: 'r-best', label: 'category' })
      best.slice(0, 6).forEach((b, k) => {
        nodes.push({
          id: `bs-${k}`, kind: 'research', column: 1, row: 14 + k * 2.2,
          title: `${b.brand} · ${b.name.slice(0, 24)}`,
          imageUrl: shotUrl(b.image_urls?.[0] ?? '', b.product_url) || undefined,
          body: [
            `${b.retailer}${b.rank_note ? ` · ${b.rank_note}` : ''}${b.price_krw > 0 ? ` · KRW ${(b.price_krw / 1000).toLocaleString()}k` : ''}`,
          ],
        })
        edges.push({ from: 'r-best', to: `bs-${k}` })
      })
    }
    const noProxy = st.competitors.filter(c => c.observation_count < 2)
    nodes.push({
      id: 'r-proxy', kind: 'research', column: 1, row: 10,
      title: 'Sales proxy',
      body: [noProxy.length ? `${noProxy.length} seen only once · no score without a time series` : 'All seen at least twice'],
      tone: 'warn',
    })
    nodes.push({
      id: 'r-trend', kind: 'research', column: 1, row: 11,
      title: 'Trend research', body: [`${st.signals.length} signals, each tied to a source`],
    })
    researchIds = ['r-comp', 'r-proxy', 'r-trend']
    edges.push({ from: 'in', to: 'r-comp', label: 'competitor list' })
    edges.push({ from: 'r-comp', to: 'r-proxy', label: 'repeat observations' })
    edges.push({ from: 'in', to: 'r-trend', label: 'category' })
  } else if (p.mode === 'series') {
    nodes.push({
      id: 'r-dna', kind: 'research', column: 1, row: 0,
      title: 'Series DNA',
      body: [
        `${st.seriesDna?.invariant.length ?? 0} fixed · ${st.seriesDna?.variable.length ?? 0} variable · ${st.seriesDna?.ambiguous.length ?? 0} unclear`,
        ...(st.seriesDna?.invariant.slice(0, 2).map(i => `Fixed: ${i.label} (${i.observed_in}/${i.of})`) ?? []),
      ],
      tone: 'accent',
    })
    nodes.push({
      id: 'r-check', kind: 'research', column: 1, row: 1,
      title: 'Stated vs observed',
      body: st.dnaConflict
        ? [`You wrote ${st.dnaConflict.brandClaim}`, `We see ${st.dnaConflict.observed}`,
           st.dnaConflict.resolved ? `Going with: ${st.dnaConflict.resolved}` : 'Not resolved yet']
        : ['No conflict'],
      tone: 'warn',
    })
    // 올린 디자인을 그대로 보여준다 · DNA 판정을 눈으로 대조할 수 있어야 한다
    uploadImages(p.series.archiveFiles).slice(0, 8).forEach((u, k) => {
      nodes.push({
        id: `up-${k}`, kind: 'research', column: 1, row: 3 + k * 2.2,
        title: u.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 26),
        imageUrl: u.url,
        body: ['You uploaded this'],
      })
      edges.push({ from: 'r-dna', to: `up-${k}` })
    })
    researchIds = ['r-dna', 'r-check']
    edges.push({ from: 'in', to: 'r-dna', label: 'uploaded designs' })
    edges.push({ from: 'in', to: 'r-check', label: 'value statement' })
    edges.push({ from: 'r-dna', to: 'r-check', label: 'observed elements' })
    if (p.series.trendSearch) {
      nodes.push({ id: 'r-trend', kind: 'research', column: 1, row: 2, title: 'Trend research', body: ['The only outside research in Series mode', 'No competitor research'] })
      researchIds.push('r-trend')
    }
  } else {
    nodes.push({
      id: 'r-pdf', kind: 'research', column: 1, row: 0,
      title: 'Uploads, read',
      body: [`${p.moodboard.files.map(uploadName).join(', ') || 'none'} · every signal below carries the page it came from`],
      tone: 'accent',
    })
    // 문서에서 뽑아 둔 페이지 이미지 · 신호 옆에서 근거를 눈으로 확인한다
    uploadImages(p.moodboard.files).slice(0, 6).forEach((u, k) => {
      nodes.push({
        id: `pg-${k}`, kind: 'research', column: 1, row: 3 + k * 2.2,
        title: u.name.replace(/\.(png|webp|jpg)$/i, ''),
        imageUrl: u.url,
        body: ['From your document'],
      })
      edges.push({ from: 'r-pdf', to: `pg-${k}` })
    })
    nodes.push({
      id: 'r-bias', kind: 'research', column: 1, row: 1,
      title: 'Source perspective',
      body: st.reportBias ? [st.reportBias.perspective, ...st.reportBias.notes.slice(0, 2)] : [],
      tone: 'warn',
    })
    researchIds = ['r-pdf', 'r-bias']
    edges.push({ from: 'in', to: 'r-pdf', label: 'PDF' })
    edges.push({ from: 'r-pdf', to: 'r-bias', label: 'citation spread' })
  }

  // ── 시즌 도시에 · MICAM 형식의 매크로트렌드를 조사 열에 얹는다 ──────
  const dossier = st.dossier as SeasonDossier | null
  if (dossier?.macrotrends?.length) {
    const pct = metricText
    nodes.push({
      id: 'dos', kind: 'research', column: 1, row: 12,
      title: `${dossier.season} · ${dossier.season_title}`,
      body: [
        dossier.powershift ? dossier.powershift : '',
        `${dossier.macrotrends.length} macrotrends · ${dossier.sources?.length ?? 0} sources`,
      ].filter(Boolean),
      tone: 'accent',
    })
    edges.push({ from: 'in', to: 'dos', label: 'season brief' })

    dossier.macrotrends.forEach((m, i) => {
      const id = `macro-${i}`
      // 매크로 카드는 결론 한 문장 + 팔레트 한 줄만 · 상세는 도시에 PDF가 담당한다
      nodes.push({
        id, kind: 'research', column: 1, row: 4 + i * 2,
        title: `${m.name} · ${GRADE_LABEL[m.grade] ?? m.grade}`,
        body: [
          m.statement,
          (m.palette ?? []).length ? `Palette: ${m.palette.slice(0, 4).map(c => c.name).join(', ')}` : '',
        ].filter(Boolean),
      })
      edges.push({ from: 'dos', to: id, label: 'macrotrend' })

      const items = (m.key_items ?? []).slice(0, 3)
      if (items.length) {
        const kid = `macro-${i}-items`
        nodes.push({
          id: kid, kind: 'research', column: 1, row: 5 + i * 2,
          title: `${m.name} key items`,
          body: items.map(k => `${k.name} (${k.segment}) ${k.metric ? pct(k.metric) : '—'} · ${GRADE_LABEL[k.grade] ?? k.grade}`),
          tone: 'muted',
        })
        edges.push({ from: id, to: kid, label: 'key items' })
      }
    })
  }

  // ── 3 신호 ──────────────────────────────────────────────────────
  st.signals.forEach((s, i) => {
    nodes.push({
      id: `sg-${s.signal_id}`, kind: 'signal', column: 2, row: i,
      title: s.label,
      body: [
        `${s.axis} · seen ${s.observed_count}x · ${s.direction === 'rising' ? 'rising' : s.direction === 'stable' ? 'holding' : 'fading'}`,
        s.sales_proxy_score != null ? `proxy ${s.sales_proxy_score} (${s.proxy_confidence})`
          : s.page_ref ? `source ${s.page_ref}` : `${s.sources.length} sources`,
      ],
      tone: s.confidence === 'low' ? 'muted' : 'neutral',
    })
    // 신호의 출처 노드 연결 · 프록시가 붙은 신호는 프록시 노드에서 온다
    const src = p.mode === 'trend'
      ? (s.sales_proxy_score != null ? 'r-proxy' : 'r-trend')
      : p.mode === 'series' ? (researchIds.includes('r-trend') ? 'r-trend' : 'r-dna')
      : 'r-pdf'
    edges.push({ from: src, to: `sg-${s.signal_id}`, dashed: s.confidence === 'low' })
  })

  // ── 4 디렉션 ────────────────────────────────────────────────────
  st.directions.forEach((d, i) => {
    nodes.push({
      id: `dir-${d.id}`, kind: 'direction', column: 3, row: i,
      title: d.title, body: [d.summary], tone: 'accent',
    })
    d.signal_ids.forEach(sid => edges.push({ from: `sg-${sid}`, to: `dir-${d.id}` }))
  })
  // 시리즈 불변 요소는 디렉션 전 단계에서 스펙을 직접 잠근다
  if (p.mode === 'series' && st.seriesDna) {
    st.directions.forEach(d => edges.push({ from: 'r-dna', to: `dir-${d.id}`, label: 'DNA lock', dashed: true }))
  }

  // ── 5 디자인 ────────────────────────────────────────────────────
  const alive = st.designs.filter(d => !d.rejected)
  const rejected = st.designs.filter(d => d.rejected)
  const deck = buildLocalPitch(st)
  const pitchOf = (id: string) => deck.designPitches.find(x => x.design_id === id)

  alive.forEach((d, i) => {
    const hero = d.images.find(im => im.view !== 'sketch') ?? d.images[0]
    const pit = pitchOf(d.spec.design_id)
    if (pit) {
      // 카드 옆에 "왜 이 안인가"를 붙여, 발표할 때 카드만 보고도 말이 되게 한다
      // 발표 카드도 핵심만 · 근거 한 줄, 실현성 한 줄, 예상 반론 한 줄
      nodes.push({
        id: `pitch-${d.spec.design_id}`, kind: 'selection', column: 4.5, row: i,
        title: 'Why this one',
        body: [
          pit.why[0],
          pit.feasibility[0],
          ...(pit.objections.length ? [`Objection: ${pit.objections[0].q} - ${pit.objections[0].a}`] : []),
        ].filter(Boolean),
        tone: 'muted',
        isPitch: true,
      })
      edges.push({ from: d.spec.design_id, to: `pitch-${d.spec.design_id}`, label: 'reasoning', dashed: true })
    }
    nodes.push({
      id: d.spec.design_id, kind: 'design', column: 4, row: i,
      title: `${d.spec.design_id} · ${TIER_LABEL[d.spec.tier]}`,
      body: d.metrics.map(m => `${m.label} ${m.value}`),
      design: d, imageUrl: hero?.url,
    })
    // 어떤 신호에서 나왔는지 · 가중치가 곧 선 굵기
    d.rationale.driving_signals.forEach(ds => {
      const dir = st.directions.find(x => x.signal_ids.includes(ds.signal_id))
      edges.push({
        from: dir ? `dir-${dir.id}` : `sg-${ds.signal_id}`,
        to: d.spec.design_id,
        label: `${Math.round(ds.weight * 100)}%`,
        weight: ds.weight,
      })
    })
  })
  if (rejected.length) {
    nodes.push({
      id: 'rejected', kind: 'design', column: 4, row: alive.length,
      title: `${rejected.length} rejected on rules`,
      body: rejected.slice(0, 4).map(d =>
        `${d.spec.design_id} · ${d.ruleResults.filter(r => r.severity === 'fail').map(r => r.rule).join(', ')}`),
      tone: 'muted',
    })
  }

  // ── 6 선정 ──────────────────────────────────────────────────────
  const top = st.designs.filter(d => d.isTop)
  if (top.length) {
    nodes.push({
      id: 'top', kind: 'selection', column: 5, row: 0,
      title: `Top ${top.length}`,
      body: [
        ...top.map(d => `${d.spec.design_id} · ${TIER_LABEL[d.spec.tier]} · distance ${d.topDistance ?? 'n/a'}`),
        'At least one per tier, with a distance threshold so they do not converge',
      ],
      tone: 'accent',
    })
    top.forEach(d => edges.push({ from: d.spec.design_id, to: 'top', label: 'selected' }))

    // 캠페인 컷은 디자인 다음 단계다. 착용컷과 연출컷을 한 열에 나란히 올린다.
    let campaignRow = 0
    let showroomRow = 0
    top.forEach((d) => {
      const worn = d.images.filter(im => im.view === 'wear')
      const concepts = d.images.filter(im => im.view === 'concept')
      const frames = [
        ...worn.map(im => ({ im, label: 'Virtual fitting', note: 'Simulated wear. The real fit may differ.' })),
        ...concepts.map(im => ({ im, label: im.conceptLabel ?? 'Concept', note: im.persona ? `Virtual model: ${im.persona}` : 'Staged for the concept, not a real shoot.' })),
      ]
      if (d.model) {
        const id = `model-${d.spec.design_id}`
        nodes.push({
          id, kind: 'selection', column: 8, row: showroomRow++,
          title: `${d.spec.design_id} · 3D`,
          body: [
            `Built from ${d.model.views} views of this design, not from one photo.`,
            'Drag to turn it. Scroll to zoom. Click the image to open it full size.',
            ...(d.model.note ? [d.model.note] : []),
          ],
          modelUrl: d.model.url,
          imageUrl: (d.images.find(i => i.origin === 'generated' && i.view !== 'sketch') ?? d.images[0])?.url,
        })
        edges.push({ from: 'top', to: id, label: '3D showroom' })
      }
      frames.forEach((fr, k) => {
        const id = `shot-${d.spec.design_id}-${k}`
        nodes.push({
          id, kind: 'selection', column: 7, row: campaignRow++,
          title: `${d.spec.design_id} · ${fr.label}`,
          body: [fr.note, 'Edited from the base render, so it is the same product.'],
          imageUrl: fr.im.url,
        })
        edges.push({ from: 'top', to: id, label: k === 0 ? 'campaign' : undefined })
      })
    })
  }
  // ── 7 베리에이션 · 스케치 하나에서 갈라진 실제 제품안들 ─────────────
  let varRow = 0
  st.designs.filter(d => !d.rejected).forEach(d => {
    const vars = d.images.filter(im => im.view === 'variation')
    vars.forEach((im, k) => {
      const id = `var-${d.spec.design_id}-${k}`
      nodes.push({
        id, kind: 'design', column: 6, row: varRow++,
        title: `${d.spec.design_id} · ${im.variantAxis ?? 'Variation'}`,
        body: [
          'Same silhouette, one axis changed, so the two stay comparable.',
          'Edited from the base render rather than generated fresh.',
        ],
        imageUrl: im.url,
      })
      edges.push({ from: d.spec.design_id, to: id, label: 'variation' })
    })
  })

  const approved = st.designs.filter(d => d.verdict === 'approve')
  const rejectedByUser = st.designs.filter(d => d.verdict === 'reject')
  if (approved.length || rejectedByUser.length) {
    const tagCount: Record<string, number> = {}
    rejectedByUser.forEach(d => d.verdictTags?.forEach(t => { tagCount[t] = (tagCount[t] ?? 0) + 1 }))
    nodes.push({
      id: 'verdict', kind: 'selection', column: 5, row: 1,
      title: 'Review calls',
      body: [
        `${approved.length} approved · ${rejectedByUser.length} rejected`,
        ...(Object.keys(tagCount).length ? [`Reasons: ${Object.entries(tagCount).map(([k, v]) => `${k} ${v}`).join(', ')}`] : []),
        'Calls and reasons feed the reference bank for the next run',
      ],
    })
    approved.forEach(d => edges.push({ from: d.spec.design_id, to: 'verdict', label: 'approved' }))
    rejectedByUser.forEach(d => edges.push({ from: d.spec.design_id, to: 'verdict', label: 'rejected', dashed: true }))
  }

  nodes.push({
    id: 'appendix', kind: 'appendix', column: 5, row: 2,
    title: 'Appendix · assumptions and limits',
    body: [
      'Costs are rough. The band, the assumptions and what is excluded sit on each card.',
      'Worn shots are simulated. The real fit may differ.',
      'Competitor references were read for attributes only and never fed into generation.',
      'Generated elements may not be copyrightable depending on jurisdiction.',
    ],
    tone: 'muted',
  })

  return { columns, nodes, edges }
}
