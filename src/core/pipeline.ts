// ── 3-에이전트 파이프라인 ────────────────────────────────────────────
// 공통 골격: 수집(S1) → 리포트/콘셉트(S2) → 레퍼런스/콘셉트아트(S3)
//            → 프롬프트 쌍(S4) → 디자인 생성(S5)
// 모든 단계는 실제 호출이다. 폴백 샘플 데이터는 없다 — 조사가 실패하면
// 실패했다고 적고 멈춘다. 실패를 데이터로 가리는 순간 결과 전체를 설명할 수 없게 된다.
import type {
  AdoptionSignal, CollectionSet, CrawledProduct, DesignPair, PipelineEvent, Reference,
  RunParams, RunwayData, ShopCrawl, Stage, VariantKind,
} from './types'
import { ITEM_KO, clampSetCount, variantsFor, VARIANT_LABEL, regionsOf } from './types'
import {
  fetchAdoption, fetchCompetitorCrawl, fetchForecast, fetchItemPrompt, fetchKeyword, fetchPrompts,
  fetchRefDna, fetchReferences, fetchRunway, fetchScores, fetchSets, fetchShops, fetchTrendReport,
  generateImage,
} from './agents'
import type { RefCandidate } from './agents'

/** 레퍼런스 슬롯 수 · 디자인 수량이 이 값의 배수로 정해진다.
 *  전에는 10 이 코드 세 곳에 흩어져 있어서, 실제로 8개만 뽑혔는데도 로그는 10 이라고 찍었다. */
const REF_SLOTS = 10

export type Emit = (e: PipelineEvent) => void

export interface PipelineHandle { cancel: () => void }

/** 동시 실행 풀 · 개별 실패는 워커 안에서 처리한다 */
async function pool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>) {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      try { await worker(items[i], i) } catch { /* worker 내부에서 기록 */ }
    }
  })
  await Promise.all(runners)
}

export function runPipeline(params: RunParams, emit: Emit): PipelineHandle {
  let cancelled = false
  const handle: PipelineHandle = { cancel() { cancelled = true } }

  const log = (stage: Stage, text: string) => emit({ kind: 'log', stage, text })
  const addSearches = (n?: number) => { if (n) emit({ kind: 'searches', n }) }

  ;(async () => {
    try {
      if (params.mode === 'collection') await runCollection(params, emit, () => cancelled, addSearches)
      else await runResearchAgent(params, emit, () => cancelled, addSearches)
      if (!cancelled) emit({ kind: 'done' })
    } catch (e) {
      const note = String((e as Error).message || e).slice(0, 200)
      log('S1', `The run stopped: ${note}`)
      emit({ kind: 'failed', note })
      emit({ kind: 'done' })
    }
  })()

  return handle
}

// ════════════════════════════════════════════════════════════════════
// 에이전트 1 · 2 — 조사형 (경쟁사 / 패션)
// ════════════════════════════════════════════════════════════════════
async function runResearchAgent(params: RunParams, emit: Emit, stopped: () => boolean, addSearches: (n?: number) => void) {
  const log = (stage: Stage, text: string) => emit({ kind: 'log', stage, text })
  const itemKo = ITEM_KO[params.itemType]

  // ── S1 수집 ────────────────────────────────────────────────────────
  emit({ kind: 'stage-start', stage: 'S1' })
  const candidates: RefCandidate[] = []
  const candidateIndex = new Map<string, { title: string; subtitle: string; imageUrl: string; sourceUrl: string; price?: number; currency?: string }>()

  if (params.mode === 'competitor') {
    log('S1', `Crawling ${params.competitors.length} competitors for ${itemKo} · representative, best and new (within 6 months)`)
    const crawls: { brand: string; note: string; items: CrawledProduct[]; sources: string[] }[] = []
    await pool(params.competitors, 2, async (brand) => {
      if (stopped()) return
      try {
        const r = await fetchCompetitorCrawl(params, brand)
        addSearches(r.searches)
        const items: CrawledProduct[] = (r.items ?? []).map((x, k) => ({
          id: `cp-${brand}-${k}`, source: 'competitor', brand,
          name: x.name, group: x.group, price: x.price, currency: x.currency,
          imageUrl: x.image_url, productUrl: x.product_url,
        }))
        crawls.push({ brand, note: (r as { brand_note?: string }).brand_note ?? '', items, sources: r.sources ?? [] })
        log('S1', `${brand}: ${items.length} products (${items.filter(i => i.imageUrl).length} with photos)`)
      } catch (e) {
        crawls.push({ brand, note: `crawl failed: ${String((e as Error).message).slice(0, 100)}`, items: [], sources: [] })
        log('S1', `${brand}: crawl failed · ${String((e as Error).message).slice(0, 100)}`)
      }
    })
    if (stopped()) return
    emit({ kind: 'crawl', crawl: crawls })

    // 편집샵은 지역마다 다르다 · 고른 지역 수만큼 조사가 늘어난다
    // 샵 이름 정제 · 조사 모델이 name 칸에 "상호 · URL · 설명"을 통째로 넣을 때가 있다.
    // 그대로 id 를 만들면 선정 모델이 돌려주는 깔끔한 id 와 어긋나 레퍼런스가 제목·사진을 잃는다.
    const cleanName = (n: string) => n.split('·')[0].trim() || n.trim()
    const regions = regionsOf(params)
    log('S1', `Finding 10 jewelry select shops per region (${regions.join(', ')}), then their popular ${itemKo}`)
    const allShops: ShopCrawl[] = []
    await pool(regions, 2, async (region) => {
      if (stopped()) return
      try {
        const s = await fetchShops(params, region)
        addSearches(s.searches)
        for (const sh of s.shops ?? []) {
          const shName = cleanName(sh.name)
          allShops.push({
            name: shName, url: sh.url, note: sh.note, failed: sh.failed, region,
            items: (sh.items ?? []).map((x, k) => ({
              id: `sh-${region}-${shName}-${k}`, source: 'shop' as const, brand: x.brand, shopName: shName,
              name: x.name, rankBasis: x.rank_basis, rankNote: x.rank_note,
              price: x.price, currency: x.currency, imageUrl: x.image_url, productUrl: x.product_url,
            })),
          })
        }
        log('S1', `${region}: ${(s.shops ?? []).length} shops`)
      } catch (e) {
        log('S1', `${region}: shop crawl failed · ${String((e as Error).message).slice(0, 90)}`)
      }
    })
    if (stopped()) return
    emit({ kind: 'shops', shops: allShops })
    const official = allShops.flatMap(x => x.items).filter(i => i.rankBasis === 'official_best').length
    log('S1', `${allShops.length} shops · ${allShops.reduce((n, x) => n + x.items.length, 0)} items (${official} marked bestseller by the shop itself, the rest are exposure order)`)
    for (const it of [...crawls.flatMap(c => c.items), ...allShops.flatMap(x => x.items)]) {
      candidates.push({
        id: it.id, title: it.name, subtitle: `${it.brand}${it.shopName ? ` @ ${it.shopName}` : ''} · ${it.price ? `${it.price.toLocaleString()} ${it.currency}` : 'price unconfirmed'}`,
        traits: ('group' in it ? it.group : undefined) ?? ('rankNote' in it ? it.rankNote : undefined) ?? '', image_url: it.imageUrl,
      })
      candidateIndex.set(it.id, { title: it.name, subtitle: `${it.brand}${it.shopName ? ` @ ${it.shopName}` : ''}`, imageUrl: it.imageUrl, sourceUrl: it.productUrl, price: it.price, currency: it.currency })
    }
    if (!candidates.length)
      log('S1', 'Shop crawl gave nothing · continuing with competitor items only')
  } else {
    // 런웨이·확산도 지역별 · 룩과 신호가 지역 수만큼 쌓인다
    const regions = regionsOf(params)
    log('S1', `Collecting runway looks and adoption signals for ${regions.join(', ')} · current and announced next season`)
    const looksAll: RunwayData['looks'] = []
    let season: { now: string; next: string } | null = null
    const signalsAll: AdoptionSignal[] = []
    await pool(regions, 2, async (region) => {
      if (stopped()) return
      const [rw, ad] = await Promise.all([
        fetchRunway(params, region).catch(e => { log('S1', `${region}: runway failed · ${String((e as Error).message).slice(0, 90)}`); return null }),
        fetchAdoption(params, region).catch(e => { log('S1', `${region}: adoption failed · ${String((e as Error).message).slice(0, 90)}`); return null }),
      ])
      if (rw) {
        addSearches(rw.searches)
        looksAll.push(...rw.looks.map(l => ({ ...l, region })))
        season = season ?? { now: rw.season_now, next: rw.season_next }
        log('S1', `${region}: ${rw.looks.length} looks (${rw.looks.filter(l => l.image_url).length} with images)`)
      }
      if (ad) {
        addSearches(ad.searches)
        signalsAll.push(...(ad.signals ?? []).map(s => ({ ...s, region })))
      }
    })
    if (stopped()) return
    if (!looksAll.length) throw new Error('runway research failed for every region')
    const rwAll: RunwayData = { season_now: season!.now, season_next: season!.next, looks: looksAll, sources: [] }
    emit({ kind: 'runway', runway: rwAll })
    emit({ kind: 'adoption', signals: signalsAll })
    log('S1', `${looksAll.length} looks total · ${signalsAll.length} adoption signals, each labelled by its real basis`)
    looksAll.forEach((l, k) => {
      const id = `lk-${k}`
      candidates.push({
        id, title: `${l.brand} · ${l.collection}`, subtitle: `${l.season} · ${l.look_note}`,
        traits: `${l.silhouette} · ${l.colors.join('/')} · ${l.materials.join('/')} · jewelry zone: ${l.jewelry_zone}`,
        image_url: l.image_url,
      })
      candidateIndex.set(id, { title: `${l.brand} · ${l.collection}`, subtitle: `${l.season} · ${l.look_note}`, imageUrl: l.image_url, sourceUrl: l.source_url })
    })
  }
  emit({ kind: 'stage-done', stage: 'S1' })
  if (stopped()) return
  if (!candidates.length) throw new Error('nothing was collected, so there is nothing to design from')

  // ── S2 트렌드 리포트 ───────────────────────────────────────────────
  emit({ kind: 'stage-start', stage: 'S2' })
  log('S2', params.direction
    ? `Researching along your direction: "${params.direction.slice(0, 80)}"`
    : 'No direction given · researching general trends for the item')
  const report = await fetchTrendReport(params)
  if (stopped()) return
  addSearches(report.searches)
  emit({ kind: 'trend-report', report })
  log('S2', `Report ready · ${report.elements.length} trend axes, ${report.sources.length} sources`)
  // 다음 시즌 예측 · 리포트의 부록이다. 실패해도 리포트를 잡고 늘어지지 않는다.
  try {
    log('S2', 'Looking one year ahead: forecasting the next same season from present signals')
    const fc = await fetchForecast(params)
    addSearches(fc.searches)
    emit({ kind: 'forecast', forecast: fc })
    log('S2', `Forecast ready · ${fc.predictions.length} predictions for ${fc.horizon}`)
  } catch (e) {
    log('S2', `Forecast failed · ${String((e as Error).message).slice(0, 90)} · the report stands without it`)
  }
  emit({ kind: 'stage-done', stage: 'S2' })

  // ── S3 레퍼런스 10개 ───────────────────────────────────────────────
  emit({ kind: 'stage-start', stage: 'S3' })
  const trendSummary = [
    report.headline, report.summary,
    ...report.elements.map(e => `${e.axis}: ${e.trends.map(t => t.label).join(', ')}`),
  ].join('\n')
  const sel = await fetchReferences(params, candidates, trendSummary)
  if (stopped()) return
  // 모델이 돌려준 id 의 한글이 분해형(NFD)으로 올 때가 있다 — '아몬즈' 가 눈에는 같아도
  // Map 키와 코드포인트가 달라 조회가 빗나가고, 그 레퍼런스는 제목·사진·출처를 통째로 잃는다.
  // (실제로 편집샵 레퍼런스 8/10 이 이렇게 비었다.) NFC 로 맞춰 찾는다.
  const nfcIndex = new Map([...candidateIndex].map(([k, v]) => [k.normalize('NFC'), v]))
  const references: Reference[] = (sel.picks ?? []).slice(0, REF_SLOTS).map(p => {
    const c = candidateIndex.get(p.candidate_id) ?? nfcIndex.get(String(p.candidate_id).normalize('NFC'))
    return {
      slot: p.slot, candidateId: p.candidate_id,
      title: c?.title ?? p.candidate_id, subtitle: c?.subtitle ?? '',
      trendCombo: p.trend_combo, reason: p.reason,
      imageUrl: c?.imageUrl ?? '', sourceUrl: c?.sourceUrl ?? '',
      price: c?.price, currency: c?.currency,
    }
  })
  // 모델이 10개를 채우지 못할 때가 있다. 그러면 디자인 수가 조용히 줄어든다 —
  // 20개를 고른 사람이 14개를 받고, 그런데 로그는 계속 "10 references" 라고 찍혔다.
  // 모자란 슬롯은 아직 안 쓴 후보로 채운다. 사진이 있는 것을 먼저 쓴다.
  const picked = references.length
  if (picked < REF_SLOTS) {
    const used = new Set(references.map(r => r.candidateId))
    const spare = candidates
      .filter(c => !used.has(c.id))
      .sort((a, b) => (b.image_url ? 1 : 0) - (a.image_url ? 1 : 0))
    for (const c of spare.slice(0, REF_SLOTS - picked)) {
      const info = candidateIndex.get(c.id)
      references.push({
        slot: references.length + 1, candidateId: c.id,
        title: info?.title ?? c.title, subtitle: info?.subtitle ?? c.subtitle, trendCombo: [],
        reason: 'Auto-filled · the research agent returned fewer picks than there were slots, so this candidate was added to keep the design count.',
        imageUrl: info?.imageUrl ?? c.image_url, sourceUrl: info?.sourceUrl ?? '',
        price: info?.price, currency: info?.currency,
      })
    }
    log('S3', `The research agent picked only ${picked} of ${REF_SLOTS} references · ${references.length - picked} slot(s) auto-filled from the remaining candidates so the design count still holds`)
  }
  emit({ kind: 'references', references })
  log('S3', `${references.length} references picked, each slot by a different trend combination · ${references.filter(r => r.imageUrl).length} carry a real photo`)
  emit({ kind: 'stage-done', stage: 'S3' })
  if (stopped()) return

  // ── S4 + S5 · 레퍼런스별 DNA → 변형별 프롬프트 → 생성 ─────────────
  emit({ kind: 'stage-start', stage: 'S4' })
  emit({ kind: 'stage-start', stage: 'S5' })
  const variants = variantsFor(params.designCount)
  log('S4', `${references.length * variants.length} designs = ${references.length} references × ${variants.length} variant kind(s): ${variants.map(v => VARIANT_LABEL[v]).join(', ')}`)

  const dnaCache = new Map<number, Record<string, unknown>>()
  const jobs: { ref: Reference; variant: VariantKind; n: number }[] = []
  let n = 0
  for (const variant of variants) for (const ref of references) jobs.push({ ref, variant, n: ++n })

  let made = 0
  // 사진을 몇 장 실제로 읽었는지 센다. 실패만 한 줄씩 찍으면 0/10 인지 1/10 인지 눈에 안 들어온다 —
  // 전부 실패했는데도 "사이트가 막았나 보다" 로 넘어간 적이 있다. 총계가 있으면 고장으로 보인다.
  let withPhoto = 0
  await pool(jobs, 3, async ({ ref, variant, n: idx }) => {
    if (stopped()) return
    const id = `D${String(idx).padStart(2, '0')}`
    try {
      // DNA 는 레퍼런스당 한 번 · 변형들이 공유한다
      let dna = dnaCache.get(ref.slot)
      if (!dna) {
        const context = `${ref.title} · ${ref.subtitle} · 슬롯 ${ref.slot} 선정 이유: ${ref.reason}`
        const d = await fetchRefDna(params, `ref-${ref.slot}`, ref.imageUrl, ref.sourceUrl, context)
        dna = d.dna
        dnaCache.set(ref.slot, dna)
        if (d.hadImage) withPhoto++
        else emit({ kind: 'log', stage: 'S4', text: `Ref ${ref.slot}: photo could not be fetched · DNA read from the description only, marked as such` })
      }
      const pr = await fetchPrompts(params, `ref-${ref.slot}`, variant, dna, ref.trendCombo)
      if (stopped()) return
      const pair: DesignPair = {
        id, refSlot: ref.slot, variant, title: pr.title,
        dna, direction: pr.direction, prompt: pr.final_prompt, versions: [],
      }
      emit({ kind: 'pair', pair })
      const img = await generateImage(pr.final_prompt, params.imageEngine)
      pair.versions = [{ url: img.url, hash: img.hash, prompt: pr.final_prompt, at: new Date().toISOString() }]
      made++
      emit({ kind: 'pair-update', pair: { ...pair } })
      emit({ kind: 'log', stage: 'S5', text: `${id} generated (${VARIANT_LABEL[variant]}, ref ${ref.slot})${img.cached ? ' · reused' : ''}` })
      emit({ kind: 'progress', stage: 'S5', pct: Math.round((made / jobs.length) * 100) })
    } catch (e) {
      emit({ kind: 'pair', pair: { id, refSlot: ref.slot, variant, title: id, prompt: '', versions: [], error: String((e as Error).message).slice(0, 140) } })
      emit({ kind: 'log', stage: 'S5', text: `${id} failed · ${String((e as Error).message).slice(0, 120)}` })
    }
  })
  log('S4', `Reference photos actually read: ${withPhoto}/${dnaCache.size}. The rest were analysed from their description only.`)
  emit({ kind: 'stage-done', stage: 'S4' })
  if (stopped()) return

  emit({ kind: 'stage-done', stage: 'S5' })
}

// ════════════════════════════════════════════════════════════════════
// 에이전트 3 — 주얼리 컬렉션 (키워드 기반 세트)
// ════════════════════════════════════════════════════════════════════
async function runCollection(params: RunParams, emit: Emit, stopped: () => boolean, addSearches: (n?: number) => void) {
  const log = (stage: Stage, text: string) => emit({ kind: 'log', stage, text })

  // ── S1 키워드 조사 ────────────────────────────────────────────────
  emit({ kind: 'stage-start', stage: 'S1' })
  log('S1', `Researching the keyword in ${regionsOf(params).join(', ')}: culture, symbols, forms, colors, and the cliches to avoid`)
  const insight = await fetchKeyword(params)
  if (stopped()) return
  addSearches(insight.searches)
  emit({ kind: 'insight', insight })
  log('S1', `Insight ready · ${insight.abstraction.length} abstraction axes, ${insight.cautions.length} cautions`)

  // ── S1b 시장 가격 대조 ────────────────────────────────────────────
  // 컬렉션은 원래 크롤을 하지 않았다. 그런데 페르소나 재측정에서 다섯 사람이
  // 같은 것을 다시 요구했다 — "원가는 나오는데 그 값이 시장에서 맞는 자리인지 모르겠다".
  // 경쟁사를 훑는 것이 아니라, 같은 품목·같은 지역의 실제 판매가를 모아
  // 계산된 제안가를 견줄 수 있게만 한다. 실패해도 컬렉션은 계속 간다.
  const shopsAll: ShopCrawl[] = []
  await pool(regionsOf(params), 2, async (region) => {
    if (stopped()) return
    try {
      const s = await fetchShops(params, region)
      addSearches(s.searches)
      for (const sh of s.shops ?? []) {
        const shName = (sh.name.split('·')[0].trim() || sh.name.trim())
        shopsAll.push({
          name: shName, url: sh.url, note: sh.note, failed: sh.failed, region,
          items: (sh.items ?? []).map((x, k) => ({
            id: `sh-${region}-${shName}-${k}`, source: 'shop' as const, brand: x.brand, shopName: shName,
            name: x.name, rankBasis: x.rank_basis, rankNote: x.rank_note,
            price: x.price, currency: x.currency, imageUrl: x.image_url, productUrl: x.product_url,
          })),
        })
      }
    } catch (e) {
      log('S1', `${region}: price benchmark could not be collected · ${String((e as Error).message).slice(0, 90)}`)
    }
  })
  if (stopped()) return
  if (shopsAll.length) {
    emit({ kind: 'shops', shops: shopsAll })
    const n = shopsAll.reduce((a, s) => a + s.items.length, 0)
    log('S1', `Price benchmark · ${shopsAll.length} shops, ${n} comparable items · the tech pack compares your computed price against these`)
  } else {
    log('S1', 'No price benchmark collected · the tech pack will show cost without a market comparison')
  }
  emit({ kind: 'stage-done', stage: 'S1' })

  // ── S2 세트 콘셉트 ────────────────────────────────────────────────
  emit({ kind: 'stage-start', stage: 'S2' })
  const setsRes = await fetchSets(params, insight)
  if (stopped()) return
  // 세트 수는 화면이 주는 1/3/5 안에서만 쓴다. 계약 밖 값(저장본·API 직접 호출)이 들어오면
  // 모델이 그 수만큼 만들지 않아 "고른 수와 나온 수가 다르다" 가 된다 — 실측으로 4를 받아 12개가 나왔다.
  const wantSets = clampSetCount(params.setCount)
  const sets: CollectionSet[] = (setsRes.sets ?? []).slice(0, wantSets)
  if (sets.length < wantSets) {
    log('S3', `Asked for ${wantSets} sets, got ${sets.length} · the rest could not be built from this keyword`)
  }
  emit({ kind: 'sets', sets })
  log('S2', `${sets.length} set concept(s): ${sets.map(s => s.name).join(' / ')}`)
  emit({ kind: 'stage-done', stage: 'S2' })

  // ── S3 콘셉트 아트 · Form/Motion/Material/Atmosphere + 라인업 ───────
  emit({ kind: 'stage-start', stage: 'S3' })
  log('S3', 'Abstract concept images first, with no jewelry products yet, then one lineup image per set')
  await pool(sets, 2, async (set) => {
    if (stopped()) return
    const art: NonNullable<CollectionSet['art']> = {}
    for (const key of ['form', 'motion', 'material', 'atmosphere'] as const) {
      if (stopped()) return
      try {
        const img = await generateImage(
          `${set.concept_art[key]} Abstract concept study, no jewelry, no product, no text, no watermark.`,
          params.imageEngine)
        art[key] = { url: img.url, hash: img.hash }
      } catch { /* 이 컷만 빈다 · 세트는 계속 */ }
    }
    let lineup: CollectionSet['lineup']
    try {
      const items = params.items.map(i => ITEM_KO[i]).join(', ')
      const img = await generateImage(
        `A cohesive jewelry set lineup laid flat on one neutral studio surface: ${params.items.map(i => `one ${i}`).join(', ')}. `
        + `Shared design DNA: ${set.design_dna.slice(0, 6).join(' ')} Metal: ${set.metal}. Surface: ${set.surface}. Stones: ${set.stones}. Master motif: ${set.motif}. `
        + `All pieces clearly belong to the same collection while differing by item type (${items}). `
        + `Soft even light, photorealistic, no text, no watermark, no hands.`,
        params.imageEngine)
      lineup = { url: img.url, hash: img.hash }
    } catch { /* 라인업 없이 진행 */ }
    set.art = art
    set.lineup = lineup
    emit({ kind: 'set-art', setName: set.name, art, lineup })
    log('S3', `${set.name}: ${Object.keys(art).length}/4 concept images${lineup ? ' + lineup' : ''}`)
  })
  emit({ kind: 'stage-done', stage: 'S3' })
  if (stopped()) return

  // ── S4 + S5 · 세트 × 품목 프롬프트 → 생성 ─────────────────────────
  emit({ kind: 'stage-start', stage: 'S4' })
  emit({ kind: 'stage-start', stage: 'S5' })
  const jobs: { set: CollectionSet; setIdx: number; item: string; n: number }[] = []
  let n = 0
  sets.forEach((set, si) => { for (const item of params.items) jobs.push({ set, setIdx: si + 1, item, n: ++n }) })
  log('S4', `${jobs.length} designs = ${sets.length} set(s) × ${params.items.length} item(s) · the set DNA stays locked, only the item changes`)

  let made = 0
  await pool(jobs, 3, async ({ set, setIdx, item, n: idx }) => {
    if (stopped()) return
    const id = `D${String(idx).padStart(2, '0')}`
    try {
      const pr = await fetchItemPrompt(params, set, item)
      if (stopped()) return
      const pair: DesignPair = {
        id, refSlot: setIdx, variant: 'base', setName: set.name, item,
        title: `${set.name} · ${ITEM_KO[item]}`, prompt: pr.final_prompt, versions: [], feature: pr.feature,
      }
      emit({ kind: 'pair', pair })
      const img = await generateImage(pr.final_prompt, params.imageEngine)
      pair.versions = [{ url: img.url, hash: img.hash, prompt: pr.final_prompt, at: new Date().toISOString() }]
      made++
      emit({ kind: 'pair-update', pair: { ...pair } })
      emit({ kind: 'log', stage: 'S5', text: `${id} generated (${set.name} · ${item})${img.cached ? ' · reused' : ''}` })
      emit({ kind: 'progress', stage: 'S5', pct: Math.round((made / jobs.length) * 100) })
    } catch (e) {
      emit({ kind: 'pair', pair: { id, refSlot: setIdx, variant: 'base', setName: set.name, item, title: id, prompt: '', versions: [], error: String((e as Error).message).slice(0, 140) } })
      emit({ kind: 'log', stage: 'S5', text: `${id} failed · ${String((e as Error).message).slice(0, 120)}` })
    }
  })
  emit({ kind: 'stage-done', stage: 'S4' })
  if (stopped()) return

  emit({ kind: 'stage-done', stage: 'S5' })
}

/** 실행이 끝난 뒤 분석 탭에서 부르는 일괄 평가 · App 이 pairs 를 넘겨 준다 */
export async function scoreFinishedPairs(params: RunParams, pairs: DesignPair[]): Promise<Map<string, { total: number; note: string }>> {
  const out = new Map<string, { total: number; note: string }>()
  const targets = pairs.filter(p => p.prompt && !p.error)
  for (let i = 0; i < targets.length; i += 10) {
    const batch = targets.slice(i, i + 10)
    try {
      const r = await fetchScores(params, batch.map(p => ({ id: p.id, prompt: p.prompt })))
      for (const s of r.scores ?? []) out.set(s.id, { total: s.total, note: s.note })
    } catch { /* 배치 하나 실패는 건너뛴다 */ }
  }
  return out
}

/** 프롬프트 수정 후 그 디자인만 재생성 · 새 버전이 뒤에 붙는다 */
/** 개별 재생성 · 버전을 하나 더 붙인다.
 *  이미지 캐시는 프롬프트 내용으로 주소를 잡으므로, 프롬프트를 고치지 않고 다시 누르면
 *  똑같은 그림이 돌아온다. 그걸 "새 버전"이라고 쌓으면 화면이 거짓말을 한다 —
 *  같은 해시면 아무것도 붙이지 않고 그대로 돌려준다. */
export async function regeneratePair(params: RunParams, pair: DesignPair, prompt: string): Promise<DesignPair> {
  const img = await generateImage(prompt, params.imageEngine)
  const last = pair.versions[pair.versions.length - 1]
  if (last && last.hash === img.hash) return { ...pair, prompt, error: undefined }
  return {
    ...pair, prompt,
    versions: [...pair.versions, { url: img.url, hash: img.hash, prompt, at: new Date().toISOString() }],
    // 점수는 옛 그림을 보고 매긴 것이다. 그림이 바뀌었으면 같이 지운다.
    score: undefined, scoreNote: undefined,
    error: undefined,
  }
}
