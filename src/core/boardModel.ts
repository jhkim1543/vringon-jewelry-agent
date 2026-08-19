// ── 품평 보드 모델 · 화면(React Flow)과 Miro 내보내기가 같은 구조를 쓴다 ──
// 순서: 입력 → 조사 → 신호 → 디렉션 → 디자인 → 선정
// 연결(edge)은 장식이 아니라 실제 데이터다. 디자인이 어떤 신호에서 나왔는지는
// rationale.driving_signals에, 디렉션이 어떤 신호를 묶었는지는 signal_ids에 있다.
import type { Design, RunState } from './types'
import { MODE_LABEL, MODE_SCOPE, TIER_LABEL, uploadImages, uploadName, isCollectedSignal, userUploads} from './types'
import { buildLocalPitch } from './pitch'
import type { SeasonDossier } from './research'
import { GRADE_LABEL, metricText , shotUrl } from './research'
import { t, tf } from './i18n'

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
    { key: 'input', title: t('1 · Input'), note: t('What you gave it') },
    { key: 'research', title: t('2 · Research'), note: scope.competitor ? t('What the agent collected') : scope.trend ? t('Trend research') : t('Your uploads, read') },
    { key: 'signal', title: t('3 · Signals'), note: t('Observations with a source') },
    { key: 'direction', title: t('4 · Directions'), note: t('Signals combined') },
    { key: 'design', title: t('5 · Designs'), note: t('Spec, rules, image') },
    { key: 'selection', title: t('6 · Selection'), note: t('Metrics and calls') },
    { key: 'variation', title: t('7 · Variations'), note: t('One sketch, several products') },
    { key: 'campaign', title: t('8 · Campaign shots'), note: t('Worn on a model, staged on set') },
    { key: 'showroom', title: t('9 · 3D showroom'), note: t('Turn it, or open it full size') },
  ]

  // ── 1 입력 ──────────────────────────────────────────────────────
  const inputBody: string[] = []
  if (p.mode === 'trend') {
    inputBody.push(tf('{n} competitors: {list}', { n: p.trend.competitors.length, list: p.trend.competitors.join(', ') }))
    inputBody.push(tf('Your band KRW {min}0k-{max}0k · {band}', { min: (p.trend.priceMinKrw / 10000).toFixed(0), max: (p.trend.priceMaxKrw / 10000).toFixed(0), band: p.trend.priceBand }))
  } else if (p.mode === 'series') {
    inputBody.push(tf('Series "{name}" · {n} designs', { name: p.series.seriesName || t('untitled'), n: userUploads(p.series.archiveFiles).length }))
    if (p.series.valueStatement) inputBody.push(tf('Value: {text}', { text: p.series.valueStatement.slice(0, 90) }))
    inputBody.push(p.series.trendSearch ? t('Trend research on, no competitor research') : t('No outside research'))
  } else {
    inputBody.push(tf('{n} uploads: {list}', { n: userUploads(p.moodboard.files).length, list: userUploads(p.moodboard.files).map(uploadName).join(', ') || t('none') }))
    inputBody.push(t('Nothing outside these files'))
  }
  nodes.push({
    id: 'in', kind: 'input', column: 0, row: 0,
    title: tf('{mode} mode input', { mode: MODE_LABEL[p.mode] }), body: inputBody, tone: 'accent',
  })

  // ── 2 조사 ──────────────────────────────────────────────────────
  let researchIds: string[] = []
  if (p.mode === 'trend') {
    const inBand = st.competitors.filter(c => c.in_band)
    const out = st.competitors.filter(c => !c.in_band)
    // 요약 한 장 + 제품별 사진 카드. 조사 레인은 글이 아니라 실물이 보여야 한다.
    nodes.push({
      id: 'r-comp', kind: 'research', column: 1, row: 0,
      title: t('Competitor products'),
      body: [
        tf('{n} collected · {inBand} inside the band', { n: st.competitors.length, inBand: inBand.length }),
        ...(out.length ? [tf('{n} dropped: {list} (outside the band)', { n: out.length, list: out.map(c => c.brand).join(', ') })] : []),
      ],
    })
    // 조사 레인은 글이 아니라 실물이 말한다 · 사진 크게, 캡션은 한 줄
    inBand.slice(0, 6).forEach((c, k) => {
      nodes.push({
        id: `cp-${k}`, kind: 'research', column: 1, row: 1 + k * 2.2,
        title: `${c.brand} · ${c.name.slice(0, 26)}`,
        imageUrl: shotUrl(c.image_urls?.[0] ?? '', c.product_url) || undefined,
        body: [
          `${tf('KRW {price}k', { price: (c.price_krw / 1000).toLocaleString() })}${c.competitor_class ? ` · ${c.competitor_class}` : ''}${c.design_traits?.[0] ? ` · ${c.design_traits[0]}` : ''}`,
        ],
      })
      edges.push({ from: 'r-comp', to: `cp-${k}` })
    })
    // 백화점·명품몰 베스트셀러 · "지금 실제로 팔리는 것"의 사진이 경쟁 구도의 기준점이다
    const best = st.bestsellers ?? []
    if (best.length) {
      nodes.push({
        id: 'r-best', kind: 'research', column: 1, row: 13,
        title: t('Department store bestsellers'),
        body: [tf('{n} products · {list}', { n: best.length, list: [...new Set(best.map(b => b.retailer))].slice(0, 3).join(', ') })],
        tone: 'accent',
      })
      edges.push({ from: 'in', to: 'r-best', label: t('category') })
      best.slice(0, 6).forEach((b, k) => {
        nodes.push({
          id: `bs-${k}`, kind: 'research', column: 1, row: 14 + k * 2.2,
          title: `${b.brand} · ${b.name.slice(0, 24)}`,
          imageUrl: shotUrl(b.image_urls?.[0] ?? '', b.product_url) || undefined,
          body: [
            `${b.retailer}${b.rank_note ? ` · ${b.rank_note}` : ''}${b.price_krw > 0 ? ` · ${tf('KRW {price}k', { price: (b.price_krw / 1000).toLocaleString() })}` : ''}`,
          ],
        })
        edges.push({ from: 'r-best', to: `bs-${k}` })
      })
    }
    const noProxy = st.competitors.filter(c => c.observation_count < 2)
    nodes.push({
      id: 'r-proxy', kind: 'research', column: 1, row: 10,
      title: t('Sales proxy'),
      body: [noProxy.length ? tf('{n} seen only once · no score without a time series', { n: noProxy.length }) : t('All seen at least twice')],
      tone: 'warn',
    })
    nodes.push({
      id: 'r-trend', kind: 'research', column: 1, row: 11,
      // 출처가 붙은 신호만 그렇게 말한다. 조사가 실패해 샘플로 돌아간 실행에서는
      // 하나도 안 붙어 있는데 예전에는 늘 "each tied to a source" 라고 적혀 있었다.
      title: t('Trend research'), body: [(() => {
        const n = st.signals.filter(isCollectedSignal).length
        return n === st.signals.length
          ? tf('{n} signals, each tied to a source', { n: st.signals.length })
          : tf('{n} signals · {sourced} tied to a source, the rest are sample data', { n: st.signals.length, sourced: n })
      })()],
    })
    researchIds = ['r-comp', 'r-proxy', 'r-trend']
    edges.push({ from: 'in', to: 'r-comp', label: t('competitor list') })
    edges.push({ from: 'r-comp', to: 'r-proxy', label: t('repeat observations') })
    edges.push({ from: 'in', to: 'r-trend', label: t('category') })
  } else if (p.mode === 'series') {
    nodes.push({
      id: 'r-dna', kind: 'research', column: 1, row: 0,
      title: t('Series DNA'),
      body: [
        tf('{fixed} fixed · {variable} variable · {unclear} unclear', { fixed: st.seriesDna?.invariant.length ?? 0, variable: st.seriesDna?.variable.length ?? 0, unclear: st.seriesDna?.ambiguous.length ?? 0 }),
        ...(st.seriesDna?.invariant.slice(0, 2).map(i => tf('Fixed: {label} ({seen}/{of})', { label: i.label, seen: i.observed_in, of: i.of })) ?? []),
      ],
      tone: 'accent',
    })
    nodes.push({
      id: 'r-check', kind: 'research', column: 1, row: 1,
      title: t('Stated vs observed'),
      body: st.dnaConflict
        ? [tf('You wrote {claim}', { claim: st.dnaConflict.brandClaim }), tf('We see {observed}', { observed: st.dnaConflict.observed }),
           st.dnaConflict.resolved ? tf('Going with: {choice}', { choice: st.dnaConflict.resolved }) : t('Not resolved yet')]
        : [t('No conflict')],
      tone: 'warn',
    })
    // 올린 디자인을 그대로 보여준다 · DNA 판정을 눈으로 대조할 수 있어야 한다
    uploadImages(p.series.archiveFiles).slice(0, 8).forEach((u, k) => {
      nodes.push({
        id: `up-${k}`, kind: 'research', column: 1, row: 3 + k * 2.2,
        title: u.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 26),
        imageUrl: u.url,
        body: [t('You uploaded this')],
      })
      edges.push({ from: 'r-dna', to: `up-${k}` })
    })
    researchIds = ['r-dna', 'r-check']
    edges.push({ from: 'in', to: 'r-dna', label: t('uploaded designs') })
    edges.push({ from: 'in', to: 'r-check', label: t('value statement') })
    edges.push({ from: 'r-dna', to: 'r-check', label: t('observed elements') })
    if (p.series.trendSearch) {
      nodes.push({ id: 'r-trend', kind: 'research', column: 1, row: 2, title: t('Trend research'), body: [t('The only outside research in Series mode'), t('No competitor research')] })
      researchIds.push('r-trend')
    }
  } else {
    nodes.push({
      id: 'r-pdf', kind: 'research', column: 1, row: 0,
      title: t('Uploads, read'),
      body: [tf('{list} · every signal below carries the page it came from', { list: userUploads(p.moodboard.files).map(uploadName).join(', ') || t('none') })],
      tone: 'accent',
    })
    // 문서에서 뽑아 둔 페이지 이미지 · 신호 옆에서 근거를 눈으로 확인한다
    uploadImages(p.moodboard.files).slice(0, 6).forEach((u, k) => {
      nodes.push({
        id: `pg-${k}`, kind: 'research', column: 1, row: 3 + k * 2.2,
        title: u.name.replace(/\.(png|webp|jpg)$/i, ''),
        imageUrl: u.url,
        body: [t('From your document')],
      })
      edges.push({ from: 'r-pdf', to: `pg-${k}` })
    })
    nodes.push({
      id: 'r-bias', kind: 'research', column: 1, row: 1,
      title: t('Source perspective'),
      body: st.reportBias ? [st.reportBias.perspective, ...st.reportBias.notes.slice(0, 2)] : [],
      tone: 'warn',
    })
    researchIds = ['r-pdf', 'r-bias']
    edges.push({ from: 'in', to: 'r-pdf', label: 'PDF' })
    edges.push({ from: 'r-pdf', to: 'r-bias', label: t('citation spread') })
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
        tf('{n} macrotrends · {sources} sources', { n: dossier.macrotrends.length, sources: dossier.sources?.length ?? 0 }),
      ].filter(Boolean),
      tone: 'accent',
    })
    edges.push({ from: 'in', to: 'dos', label: t('season brief') })

    dossier.macrotrends.forEach((m, i) => {
      const id = `macro-${i}`
      // 매크로 카드는 결론 한 문장 + 팔레트 한 줄만 · 상세는 도시에 PDF가 담당한다
      nodes.push({
        id, kind: 'research', column: 1, row: 4 + i * 2,
        title: `${m.name} · ${GRADE_LABEL[m.grade] ?? m.grade}`,
        body: [
          m.statement,
          (m.palette ?? []).length ? tf('Palette: {colors}', { colors: m.palette.slice(0, 4).map(c => c.name).join(', ') }) : '',
        ].filter(Boolean),
      })
      edges.push({ from: 'dos', to: id, label: t('macrotrend') })

      const items = (m.key_items ?? []).slice(0, 3)
      if (items.length) {
        const kid = `macro-${i}-items`
        nodes.push({
          id: kid, kind: 'research', column: 1, row: 5 + i * 2,
          title: tf('{name} key items', { name: m.name }),
          body: items.map(k => `${k.name} (${k.segment}) ${k.metric ? pct(k.metric) : '—'} · ${GRADE_LABEL[k.grade] ?? k.grade}`),
          tone: 'muted',
        })
        edges.push({ from: id, to: kid, label: t('key items') })
      }
    })
  }

  // ── 3 신호 ──────────────────────────────────────────────────────
  st.signals.forEach((s, i) => {
    nodes.push({
      id: `sg-${s.signal_id}`, kind: 'signal', column: 2, row: i,
      title: s.label,
      body: [
        tf('{axis} · seen {n}x · {direction}', { axis: s.axis, n: s.observed_count, direction: s.direction === 'rising' ? t('rising') : s.direction === 'stable' ? t('holding') : t('fading') }),
        // proxy_confidence 는 없을 수 있다 · 없으면 '미상'으로 적는다(빈칸으로 두면 괄호만 남는다)
        s.sales_proxy_score != null ? tf('proxy {score} ({confidence})', { score: s.sales_proxy_score, confidence: s.proxy_confidence ?? t('unknown') })
          : s.page_ref ? tf('source {ref}', { ref: s.page_ref }) : tf('{n} sources', { n: s.sources.length }),
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
    st.directions.forEach(d => edges.push({ from: 'r-dna', to: `dir-${d.id}`, label: t('DNA lock'), dashed: true }))
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
        title: t('Why this one'),
        body: [
          pit.why[0],
          pit.feasibility[0],
          ...(pit.objections.length ? [tf('Objection: {q} - {a}', { q: pit.objections[0].q, a: pit.objections[0].a })] : []),
        ].filter(Boolean),
        tone: 'muted',
        isPitch: true,
      })
      edges.push({ from: d.spec.design_id, to: `pitch-${d.spec.design_id}`, label: t('reasoning'), dashed: true })
    }
    nodes.push({
      id: d.spec.design_id, kind: 'design', column: 4, row: i,
      title: `${d.spec.design_id} · ${TIER_LABEL[d.spec.tier]}`,
      body: [
        // 조건 레시피 · 이 컨셉이 조사 결과의 어떤 조합에서 나왔는지 한 줄
        ...(d.recipe ? [tf('Recipe: {title}', { title: d.recipe.title })] : []),
        ...d.metrics.map(m => `${m.label} ${m.value}`),
      ],
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
      title: tf('{n} rejected on rules', { n: rejected.length }),
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
      title: tf('Top {n}', { n: top.length }),
      body: [
        // MD 판정이 있으면 픽 이유가 함께 실린다 · 지표와 별개 층
        ...top.map(d => `${tf('{id} · {tier} · distance {distance}', { id: d.spec.design_id, tier: TIER_LABEL[d.spec.tier], distance: d.topDistance ?? t('n/a') })}${d.mdReview ? ` · MD ${d.mdReview.verdict}` : ''}`),
        ...(st.mdPickRationale ? [`MD: ${st.mdPickRationale}`] : []),
        t('At least one per tier, with a distance threshold so they do not converge'),
      ],
      tone: 'accent',
    })
    // MD 피드백 카드 · 판정과 이유, 고칠 점 하나. 총평 카드 옆에 선다.
    const reviewed = st.designs.filter(d => d.mdReview)
    if (reviewed.length) {
      nodes.push({
        id: 'md-review', kind: 'selection', column: 5, row: 0.9,
        title: t('MD feedback'),
        body: reviewed.slice(0, 6).map(d =>
          `${d.spec.design_id} · ${d.mdReview!.verdict}: ${d.mdReview!.reason}${d.mdReview!.fix ? ` · ${tf('Fix: {fix}', { fix: d.mdReview!.fix })}` : ''}`),
        tone: 'accent',
      })
      for (const d of reviewed.slice(0, 6)) edges.push({ from: d.spec.design_id, to: 'md-review', label: 'MD', dashed: true })
    }
    top.forEach(d => edges.push({ from: d.spec.design_id, to: 'top', label: t('selected') }))

    // 캠페인 컷은 디자인 다음 단계다. 착용컷과 연출컷을 한 열에 나란히 올린다.
    let campaignRow = 0
    let showroomRow = 0
    top.forEach((d) => {
      const worn = d.images.filter(im => im.view === 'wear')
      const concepts = d.images.filter(im => im.view === 'concept')
      const frames = [
        ...worn.map(im => ({ im, label: t('Virtual fitting'), note: t('Simulated wear. The real fit may differ.') })),
        ...concepts.map(im => ({ im, label: im.conceptLabel ?? t('Concept'), note: im.persona ? tf('Virtual model: {persona}', { persona: im.persona }) : t('Staged for the concept, not a real shoot.') })),
      ]
      if (d.model) {
        const id = `model-${d.spec.design_id}`
        nodes.push({
          id, kind: 'selection', column: 8, row: showroomRow++,
          title: `${d.spec.design_id} · 3D`,
          body: [
            tf('Built from {n} views of this design, not from one photo.', { n: d.model.views }),
            t('Drag to turn it. Scroll to zoom. Click the image to open it full size.'),
            ...(d.model.note ? [d.model.note] : []),
          ],
          modelUrl: d.model.url,
          imageUrl: (d.images.find(i => i.origin === 'generated' && i.view !== 'sketch') ?? d.images[0])?.url,
        })
        edges.push({ from: 'top', to: id, label: t('3D showroom') })
      }
      frames.forEach((fr, k) => {
        const id = `shot-${d.spec.design_id}-${k}`
        nodes.push({
          id, kind: 'selection', column: 7, row: campaignRow++,
          title: `${d.spec.design_id} · ${fr.label}`,
          body: [fr.note, t('Edited from the base render, so it is the same product.')],
          imageUrl: fr.im.url,
        })
        edges.push({ from: 'top', to: id, label: k === 0 ? t('campaign') : undefined })
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
        title: `${d.spec.design_id} · ${im.variantAxis ?? t('Variation')}`,
        body: [
          t('Same silhouette, one axis changed, so the two stay comparable.'),
          t('Edited from the base render rather than generated fresh.'),
        ],
        imageUrl: im.url,
      })
      edges.push({ from: d.spec.design_id, to: id, label: t('variation') })
    })
  })

  const approved = st.designs.filter(d => d.verdict === 'approve')
  const rejectedByUser = st.designs.filter(d => d.verdict === 'reject')
  if (approved.length || rejectedByUser.length) {
    const tagCount: Record<string, number> = {}
    rejectedByUser.forEach(d => d.verdictTags?.forEach(t => { tagCount[t] = (tagCount[t] ?? 0) + 1 }))
    nodes.push({
      id: 'verdict', kind: 'selection', column: 5, row: 1,
      title: t('Review calls'),
      body: [
        tf('{approved} approved · {rejected} rejected', { approved: approved.length, rejected: rejectedByUser.length }),
        ...(Object.keys(tagCount).length ? [tf('Reasons: {list}', { list: Object.entries(tagCount).map(([k, v]) => `${k} ${v}`).join(', ') })] : []),
        // 다음 실행으로 넘어가는 저장소는 없다. 반려는 이번 실행에서 그 디자인을 빼는 데 쓰인다.
        t('Rejected designs are dropped from the rest of this run. Nothing carries over to a later run.'),
      ],
    })
    approved.forEach(d => edges.push({ from: d.spec.design_id, to: 'verdict', label: t('approved') }))
    rejectedByUser.forEach(d => edges.push({ from: d.spec.design_id, to: 'verdict', label: t('rejected'), dashed: true }))
  }

  nodes.push({
    id: 'appendix', kind: 'appendix', column: 5, row: 2,
    title: t('Appendix · assumptions and limits'),
    body: [
      t('Costs are rough. The band, the assumptions and what is excluded sit on each card.'),
      t('Worn shots are simulated. The real fit may differ.'),
      t('Competitor references were read for attributes only and never fed into generation.'),
      t('Generated elements may not be copyrightable depending on jurisdiction.'),
    ],
    tone: 'muted',
  })

  return { columns, nodes, edges }
}
