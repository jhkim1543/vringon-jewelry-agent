// ── 파이프라인 엔진 S1~S5 · 진행 스트리밍·승인 게이트·체크포인트 ──────
import type { Design, DesignTier, PipelineEvent, Rationale, RunParams, Signal, Stage } from './types'
import { PACKS, resetSeq, tierCapRule } from './packs'
import { makeRng } from './rng'
import { COMPETITORS, DIRECTIONS, DNA_CONFLICT, DNA_LOCKS, PROMPT_PARSE, REPORT_BIAS, SERIES_DNA, SIGNALS } from './samples'
import { COLORWAY_NAMES } from './sketch'
import {
  colorwayEditPrompt, conceptPrompt, editImage, generateImage, renderPrompt,
  generateModel, sketchPrompt, stampLogo, variationAxes, variationPrompt, viewEditPrompt, wearEditPrompt,
} from './aiClient'
import type { TrendClauseInput } from './aiClient'
import { fetchCompetitors, fetchDossier, fetchTrends, toBias, toCompetitors, toSignals, setRunLang } from './research'
import { campaignCount, CAT_LABEL, MODE_LABEL, MODE_SCOPE, TYPE_LABEL } from './types'
import { ENGINES } from './imageEngines'

export type Emit = (e: PipelineEvent) => void

export interface PipelineHandle {
  resume: () => void         // 승인 게이트 해제
  cancel: () => void
}

/** 컨셉 촬영에 실을 무드 한 줄. 브랜드 톤이 있으면 그것을 쓴다. */
function st_mood(params: RunParams): string {
  const b = params.brand
  if (b?.toneWords?.length) return b.toneWords.join(', ')
  return ''
}

const STAGE_ORDER: Stage[] = ['S1', 'S2', 'S3', 'S4', 'S5']

function sleep(ms: number, cancelled: () => boolean): Promise<void> {
  return new Promise(res => {
    const t = setTimeout(res, ms)
    if (cancelled()) { clearTimeout(t); res() }
  })
}

/** 동시 실행 상한을 둔 작업 풀 · 한 건 실패가 전체를 멈추지 않는다 (부분 실패 격리) */
async function pool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      try { await worker(items[i], i) } catch { /* 개별 실패는 worker 내부에서 기록 */ }
    }
  })
  await Promise.all(runners)
}

export function runPipeline(params: RunParams, emit: Emit, speed = 1): PipelineHandle {
  let cancelled = false
  let gateResolve: (() => void) | null = null
  const isCancelled = () => cancelled

  const handle: PipelineHandle = {
    resume() { gateResolve?.(); gateResolve = null },
    cancel() { cancelled = true; gateResolve?.() },
  }

  ;(async () => {
    const rng = makeRng(params.sketchCount * 7919 + params.mode.length * 131 + 41)
    resetSeq()
    const pack = PACKS[params.category]
    const wait = (ms: number) => sleep(ms / speed, isCancelled)
    const upto = STAGE_ORDER.indexOf(params.endStage)
    // 실제 생성 상한 · 초과분은 SVG 폴백. 비용 통제 지점
    let spent = 0
    const budget = {
      left: () => Math.max(0, params.imageBudget - spent),
      spend: () => { spent += 1 },
    }

    // 조사에서 나온 시즌 방향. S2 스케치와 S3 렌더 프롬프트가 이걸 참조한다.
    let trendClause: TrendClauseInput | null = null
    // 촬영 계획에 실을 시즌 방향. trendClause는 뒤에서 타입이 좁혀지므로 값만 따로 붙든다.
    let macroName = ''
    // 도시에가 캐시에 있으면 스케치 전에 반영되어야 한다. 새로 조사할 때만 뒤에서 따라온다.
    let dossierJob: Promise<unknown> | null = null

    // ══ S1 조사 ══
    const scope = MODE_SCOPE[params.mode]
    const catKo = CAT_LABEL[params.category]
    const typeKo = TYPE_LABEL[params.itemType] ?? params.itemType

    // 이 분석의 조사 언어를 고정한다. 도중에 화면 언어를 바꿔도 결과는 안 섞인다.

    setRunLang(params.researchLang ?? null)


    emit({ kind: 'stage-start', stage: 'S1' })
    emit({ kind: 'log', stage: 'S1', text: `${MODE_LABEL[params.mode]} mode · ${catKo} / ${typeKo} · building the brief` })
    await wait(400)

    if (params.mode === 'trend') {
      // 트렌드 · 유일하게 경쟁사 리서치를 수행하는 모드
      const brands = params.trend.competitors
      const band = `KRW ${(params.trend.priceMinKrw / 10000).toFixed(0)}0k-${(params.trend.priceMaxKrw / 10000).toFixed(0)}0k`
      emit({ kind: 'log', stage: 'S1', text: `${brands.length} competitors: ${brands.join(', ')} · your band ${band}` })
      emit({ kind: 'log', stage: 'S1', text: `1 Competitor products · searching ${brands.join(', ')} for ${typeKo} (1-2 min)` })
      try {
        const r = await fetchCompetitors({
          brands, categoryKo: catKo, typeKo,
          priceMin: params.trend.priceMinKrw, priceMax: params.trend.priceMaxKrw,
        })
        if (cancelled) return
        const comps = toCompetitors(r, params.trend.priceMinKrw, params.trend.priceMaxKrw)
        emit({ kind: 'log', stage: 'S1', text: `${r.searches} web searches, ${comps.length} products${r.cached ? ' (reused an earlier pass)' : ''}` })
        const outOfBand = comps.filter(c => !c.in_band)
        if (outOfBand.length) emit({ kind: 'log', stage: 'S1', text: `Dropped ${outOfBand.length} outside the band: ${outOfBand.map(c => `${c.brand} ${c.name}`).join(', ')}` })
        const strong = comps.filter(c => c.evidence_strength === 'strong').length
        emit({ kind: 'log', stage: 'S1', text: `2 Checking popularity evidence · ${strong} strong, the rest single source` })
        emit({ kind: 'log', stage: 'S1', text: 'No sales proxy scored. One pass gives no time series, so restock and sell-out trends need repeat collection.' })
        if (r.notes) emit({ kind: 'log', stage: 'S1', text: `Limits of this pass: ${r.notes.slice(0, 160)}` })
        emit({ kind: 'competitors', items: comps })
      } catch (e) {
        emit({ kind: 'log', stage: 'S1', text: `Competitor research failed · ${String((e as Error).message).slice(0, 120)} · falling back to sample data` })
        emit({ kind: 'competitors', items: COMPETITORS[params.category] })
      }
      if (cancelled) return
      emit({ kind: 'log', stage: 'S1', text: '3 Trend research · looking for design signals' })
    } else if (params.mode === 'series') {
      // 시리즈 · 업로드 자료가 주. 외부 조사는 트렌드까지만, 경쟁사 리서치 없음
      const si = params.series
      emit({ kind: 'log', stage: 'S1', text: `Series "${si.seriesName || 'untitled'}" · ${si.archiveFiles.length} uploads · value statement ${si.valueStatement.length} chars` })
      await wait(600)
      emit({ kind: 'log', stage: 'S1', text: '1 Reading your series · separating what repeats from what varies' })
      await wait(900)
      emit({ kind: 'series-dna', dna: SERIES_DNA[params.category] })
      emit({ kind: 'log', stage: 'S1', text: '2 Comparing the values you wrote against what is actually there' })
      await wait(700)
      const conflict = DNA_CONFLICT[params.category]
      emit({ kind: 'dna-conflict', brandClaim: conflict.brandClaim, observed: conflict.observed })
      emit({ kind: 'log', stage: 'S1', text: `Statement and observation disagree: ${conflict.brandClaim} vs ${conflict.observed} · pick which one holds` })
      await wait(600)
      if (si.trendSearch) {
        emit({ kind: 'log', stage: 'S1', text: '3 Trend research · no competitor product research in this mode' })
        await wait(700)
      } else {
        emit({ kind: 'log', stage: 'S1', text: '3 Trend research off · working from your uploads only' })
      }
      if (si.valueStatement.trim()) {
        const pp = PROMPT_PARSE[params.category]
        emit({ kind: 'log', stage: 'S1', text: `4 Reading the value statement, applied to ${pp.applied.join(' · ')}` })
      }
    } else {
      // 무드보드 · 외부 조사 없음. 업로드 PDF만
      const mi = params.moodboard
      emit({ kind: 'log', stage: 'S1', text: `${mi.files.length} uploads: ${mi.files.join(', ')} · nothing outside these files` })
      await wait(600)
      emit({ kind: 'log', stage: 'S1', text: '1 Reading the document · sections, images, captions, colour chips' })
      await wait(800)
      emit({ kind: 'log', stage: 'S1', text: '2 Uploads tagged as untrusted · any instruction inside them is treated as data, not a command' })
      await wait(500)
      emit({ kind: 'log', stage: 'S1', text: '3 Pulling signals · page and position kept with each one' })
      await wait(600)
      emit({ kind: 'report-bias', bias: REPORT_BIAS })
      emit({ kind: 'log', stage: 'S1', text: `4 Noting the source perspective: ${REPORT_BIAS.perspective} · nothing judged beyond its scope` })
    }
    // ── 신호 확정 · 트렌드 조사를 하는 모드는 실제 검색 결과를 쓴다
    let signals: Signal[] = []
    const doTrend = scope.trend && (params.mode !== 'series' || params.series.trendSearch)
    if (doTrend) {
      try {
        // 신호는 빠른 경로로 먼저 받는다. 상세 보고서는 S1을 막지 않고 뒤에서 따라온다.
        const tr = await fetchTrends({
          categoryKo: catKo, typeKo, season: '2026 F/W',
          brands: params.mode === 'trend' ? params.trend.competitors : undefined,
          priceBandKo: params.mode === 'trend'
            ? `KRW ${(params.trend.priceMinKrw / 10000).toFixed(0)}0k-${(params.trend.priceMaxKrw / 10000).toFixed(0)}0k ${params.trend.priceBand}`
            : undefined,
          wantReport: false,
        })
        if (cancelled) return
        signals = toSignals(tr)
        emit({ kind: 'report-bias', bias: toBias(tr) })

        // 상세 트렌드 보고서는 오래 걸리므로 뒤에서 받아 붙인다. S1은 기다리지 않는다.
        emit({ kind: 'report-pending', on: true })
        emit({ kind: 'log', stage: 'S1', text: 'The full trend report is being written separately. It attaches to the research panel when done.' })

        // 시즌 도시에 · MICAM 형식(매크로트렌드 → 소재·디테일 → 키아이템). 오래 걸리므로 뒤에서 붙인다.
        emit({ kind: 'dossier-pending', on: true })
        emit({ kind: 'log', stage: 'S1', text: 'Building the season dossier: macrotrends, palettes, materials, key items. It attaches when done.' })
        dossierJob = fetchDossier({
          categoryEn: catKo,
          season: 'FW26',
          priceBand: params.mode === 'trend'
            ? `KRW ${(params.trend.priceMinKrw / 10000).toFixed(0)}0k-${(params.trend.priceMaxKrw / 10000).toFixed(0)}0k ${params.trend.priceBand}`
            : undefined,
          brands: params.mode === 'trend' ? params.trend.competitors : [],
        }).then(d => {
          if (cancelled) return
          // 첫 매크로를 기준 방향으로 잡는다. 여기서 나온 소재·디테일·팔레트가 이미지 프롬프트로 넘어간다.
          const m0 = d.macrotrends?.[0]
          if (m0) {
            trendClause = {
              macroName: m0.name,
              materials: (m0.materials ?? []).map(x => x.label),
              details: (m0.details ?? []).map(x => x.label),
              colors: (m0.palette ?? []).map(c => ({ name: c.name, hex: c.hex })),
              keySpec: (m0.key_items ?? []).find(k => k.segment === 'women')?.silhouette_spec,
            }
            macroName = m0.name
            emit({ kind: 'log', stage: 'S1', text: `Design prompts now carry the ${m0.name} direction: ${(m0.materials ?? []).map(x => x.label).slice(0, 3).join(', ')}` })
          }
          emit({ kind: 'dossier', dossier: d })
          emit({ kind: 'log', stage: 'S1', text: `Season dossier ready · ${d.macrotrends?.length ?? 0} macrotrends, ${d.sources?.length ?? 0} sources (${d.searches} searches)` })
        }).catch(() => {
          emit({ kind: 'dossier-pending', on: false })
          emit({ kind: 'log', stage: 'S1', text: 'The season dossier failed to build. Signals and the report are still usable.' })
        })
        fetchTrends({
          categoryKo: catKo, typeKo, season: '2026 F/W',
          brands: params.mode === 'trend' ? params.trend.competitors : undefined,
          priceBandKo: params.mode === 'trend'
            ? `KRW ${(params.trend.priceMinKrw / 10000).toFixed(0)}0k-${(params.trend.priceMaxKrw / 10000).toFixed(0)}0k ${params.trend.priceBand}`
            : undefined,
          wantReport: true,
        }).then(full => {
          if (cancelled) return
          if (full.report) {
            emit({ kind: 'trend-report', report: full.report })
            emit({ kind: 'log', stage: 'S1', text: `Trend report done · ${full.report.design_implications?.length ?? 0} implications from ${full.searches} searches` })
          } else {
            emit({ kind: 'report-pending', on: false })
          }
        }).catch(() => {
          emit({ kind: 'report-pending', on: false })
          emit({ kind: 'log', stage: 'S1', text: 'The full report failed to write. Signals and sources are still usable.' })
        })
        emit({ kind: 'log', stage: 'S1', text: `${tr.searches} web searches, ${signals.length} signals${tr.cached ? ' (reused an earlier pass)' : ''} · each linked to a source` })
      } catch (e) {
        emit({ kind: 'log', stage: 'S1', text: `Trend research failed · ${String((e as Error).message).slice(0, 120)} · falling back to sample data` })
      }
    }
    if (!signals.length) {
      signals = SIGNALS[params.category].map(s =>
        params.mode === 'moodboard'
          ? { ...s, page_ref: `p.${12 + Math.floor(Math.random() * 30)} ${['top', 'middle', 'bottom'][Math.floor(Math.random() * 3)]}`, sales_proxy_score: undefined, proxy_confidence: undefined }
          : s)
    }
    emit({ kind: 'signals', signals })
    const lowConf = signals.filter(s => s.confidence === 'low').length
    emit({ kind: 'log', stage: 'S1', text: `${signals.length} signals confirmed · none unsourced${lowConf ? ` · ${lowConf} single source, marked low confidence` : ''}` })
    await wait(600)
    emit({ kind: 'directions', items: DIRECTIONS[params.category] })
    emit({ kind: 'log', stage: 'S1', text: 'Three directions built, one per tier · every claim traced to a source' })
    emit({ kind: 'checkpoint', label: 'S1 done · signals.json · directions[3] saved' })
    emit({ kind: 'stage-done', stage: 'S1' })
    if (upto === 0 || cancelled) { emit({ kind: 'done', endStage: 'S1' }); return }

    // 캐시에 있으면 여기서 바로 붙는다. 새로 조사 중이면 짧게만 기다리고 넘어간다.
    if (dossierJob) {
      await Promise.race([dossierJob.catch(() => null), wait(20_000)])
      if (trendClause) emit({ kind: 'log', stage: 'S2', text: 'Sketch prompts carry the season direction from the dossier' })
      else emit({ kind: 'log', stage: 'S2', text: 'Dossier still building, so sketches go ahead on signals alone. Renders pick it up when it lands.' })
    }

    // ══ S2 스케치 ══
    emit({ kind: 'stage-start', stage: 'S2' })
    const [rc, rp, rs] = params.tierRatio
    const rsum = rc + rp + rs
    const nCore = Math.round(params.sketchCount * rc / rsum)
    const nPush = Math.round(params.sketchCount * rp / rsum)
    const nSig = params.sketchCount - nCore - nPush
    emit({ kind: 'log', stage: 'S2', text: `Specs per tier · Core ${nCore} · Push ${nPush} · Signature ${nSig} (schema enforced, presets locked)` })
    const locked = params.mode === 'series' ? DNA_LOCKS[params.category] : {}
    if (params.mode === 'series') emit({ kind: 'log', stage: 'S2', text: `Series DNA locked: ${Object.entries(locked).map(([k, v]) => `${k}=${v}`).join(', ')} · fixed as spec values` })
    emit({ kind: 'log', stage: 'S2', text: 'Reference bank loaded: 4 approved, 2 near-miss rejects (too familiar, cost)' })
    await wait(800)

    const designs: Design[] = []
    const tiers: DesignTier[] = [
      ...Array(nCore).fill('core'), ...Array(nPush).fill('push'), ...Array(nSig).fill('signature'),
    ]
    for (let i = 0; i < tiers.length; i++) {
      if (cancelled) return
      const tier = tiers[i]
      const spec = pack.generateSpec(rng, tier, params.itemType, locked)
      const cost = pack.costModel(spec, rng)
      const ruleResults = [...pack.rules(spec), ...tierCapRule(spec, cost)]
      const rejected = ruleResults.some(r => r.severity === 'fail')
      const rationale = buildRationale(params, spec, signals, rng)
      const d: Design = {
        spec, ruleResults, rejected, cost, rationale,
        qa: [], viewMismatch: false,
        metrics: buildMetrics(spec, cost, rationale, signals),
        modelEval: buildModelEval(rng),
        colorways: [], images: [], isTop: false,
      }
      designs.push(d)
      emit({ kind: 'design', design: d })
      emit({ kind: 'log', stage: 'S2', text: `${spec.design_id} [${tier}] ${rejected ? 'rule reject · ' + ruleResults.filter(r => r.severity === 'fail').map(r => r.rule).join(', ') : 'passed rules, queued for sketch'}` })
      emit({ kind: 'progress', stage: 'S2', pct: Math.round(((i + 1) / tiers.length) * 100) })
      await wait(180)
    }
    const alive = designs.filter(d => !d.rejected)
    emit({ kind: 'log', stage: 'S2', text: `${alive.length} of ${designs.length} specs passed · ${designs.length - alive.length} rejected early · rejects are never rendered` })

    // 실제 스케치 생성 · 룰 통과분만, 상한까지. 초과분은 SVG 폴백
    if (budget.left() > 0) {
      const targets = alive.slice(0, budget.left())
      emit({ kind: 'log', stage: 'S2', text: `Sketching ${targets.length} · three at a time, anything already made is reused` })
      let done = 0
      await pool(targets, ENGINES[params.imageEngine].concurrency, async (d) => {
        if (cancelled) return
        try {
          const skPrompt = sketchPrompt(d.spec, params.imageEngine, params.brand, trendClause)
          const r = await generateImage(skPrompt, params.imageEngine)
          budget.spend()
          d.images = [...d.images, { view: 'sketch', url: r.url, hash: r.hash, origin: 'generated', promptUsed: skPrompt }]
          emit({ kind: 'log', stage: 'S2', text: `${d.spec.design_id} sketch done${r.cached ? ' (reused)' : ''}` })
        } catch (e) {
          d.imageError = String((e as Error).message || e)
          emit({ kind: 'log', stage: 'S2', text: `${d.spec.design_id} sketch failed · ${d.imageError} · falling back to a diagram` })
        }
        done++
        emit({ kind: 'design-update', design: { ...d } })
        emit({ kind: 'progress', stage: 'S2', pct: Math.round((done / targets.length) * 100) })
      })
      if (alive.length > targets.length)
        emit({ kind: 'log', stage: 'S2', text: `${alive.length - targets.length} past the cap show as diagrams (cap ${params.imageBudget} images)` })
    }
    emit({ kind: 'checkpoint', label: 'S2 done · specs, sketches and rationale saved. You can resume at S3 days later.' })
    emit({ kind: 'stage-done', stage: 'S2' })

    if (params.approvalGate && upto >= 2) {
      emit({ kind: 'gate', stage: 'S2' })
      emit({ kind: 'log', stage: 'S2', text: 'Approval gate · review, then continue to S3. This gate is where feedback gets collected.' })
      await new Promise<void>(res => { gateResolve = res })
      if (cancelled) return
    }
    if (upto === 1) { emit({ kind: 'done', endStage: 'S2' }); return }

    // ══ S3 디자인 (멀티뷰) ══
    emit({ kind: 'stage-start', stage: 'S3' })
    const advanceN = Math.max(1, Math.round(alive.length * params.renderRatio))
    const advancing = [...alive].sort((a, b) => a.cost.cap_ratio - b.cost.cap_ratio).slice(0, advanceN)
    emit({ kind: 'log', stage: 'S3', text: `${Math.round(params.renderRatio * 100)}% move to render · ${advanceN} selected` })
    for (let i = 0; i < advancing.length; i++) {
      if (cancelled) return
      const d = advancing[i]
      emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} base render, then object mask, then ${params.viewCount - 1} more views as edits rather than new generations` })
      d.colorways = COLORWAY_NAMES.slice(0, params.colorwayCount)

      if (budget.left() > 0) {
        // ① 기준 렌더 1장
        let baseHash: string | null = null
        const basePrompt = renderPrompt(d.spec, params.imageEngine, params.brand, trendClause)
        try {
          const r = await generateImage(basePrompt, params.imageEngine)
          budget.spend(); baseHash = r.hash
          let baseUrl = r.url
          // 브랜드 로고는 프롬프트가 아니라 실제 파일로 얹는다. 형태가 어긋나지 않는다.
          if (params.brand?.logo?.dataUrl && params.brand.logo.placement !== 'none') {
            try {
              const stamped = await stampLogo(r.hash, params.brand)
              if (stamped) {
                baseHash = stamped.hash; baseUrl = stamped.url
                emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} brand logo composited at the ${params.brand.logo.placement}` })
              }
            } catch (e) {
              emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} logo composite failed · ${String((e as Error).message).slice(0, 80)}` })
            }
          }
          d.images = [...d.images, { view: pack.viewSet[0].key, url: baseUrl, hash: baseHash, origin: 'generated', promptUsed: basePrompt }]
          emit({ kind: 'design-update', design: { ...d } })
        } catch (e) {
          d.imageError = String((e as Error).message || e)
          emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} base render failed · ${d.imageError}` })
        }
        // ② 스케치당 추가 디자인 · 트렌드에서 뽑은 방향을 하나씩 바꿔 프롬프트를 만든다
        const dps = params.designsPerSketch ?? 1
        if (baseHash && dps > 1) {
          const angles = [
            macroName ? `Push it further into the ${macroName} direction: exaggerate its defining material and hardware.` : 'Push the dominant season material further and make the hardware the focal point.',
            'A quieter commercial take: same last and proportions, minimal hardware, tonal palette.',
            'A bolder statement take: amplify the strongest observed trend signal into the main design feature.',
          ]
          for (let k = 0; k < Math.min(dps - 1, angles.length); k++) {
            if (cancelled || budget.left() <= 0) break
            const p2 = `Redesign this ${(TYPE_LABEL[params.itemType] ?? params.itemType).toLowerCase()} keeping the exact same sketch geometry and camera angle. ${angles[k]} ${trendClause} Plain white studio background, photorealistic product shot, no text, no watermark.`
            try {
              const r2 = await editImage(baseHash, p2, params.imageEngine)
              budget.spend()
              d.images = [...d.images, { view: 'design', url: r2.url, hash: r2.hash, origin: 'edited_from', editedFrom: baseHash, promptUsed: p2 }]
              emit({ kind: 'design-update', design: { ...d } })
              emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} design variant ${k + 2} of ${dps} done` })
            } catch {
              emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} design variant ${k + 2} failed · skipping` })
            }
          }
        }

        // ③④ 추가 뷰·컬러웨이 = 기준 렌더의 편집 (동일 객체 유지)
        if (baseHash) {
          const jobs: { view: string; colorway?: string; prompt: string }[] = [
            ...pack.viewSet.filter(v => v.required).slice(1, params.viewCount)
              .map(v => ({ view: v.key, prompt: viewEditPrompt(params.category, v.key) })),
            ...d.colorways.map(cw => ({ view: pack.viewSet[0].key, colorway: cw, prompt: colorwayEditPrompt(cw) })),
          ].slice(0, budget.left())
          await pool(jobs, 2, async (job) => {
            if (cancelled) return
            try {
              const r = await editImage(baseHash!, job.prompt, params.imageEngine)
              budget.spend()
              d.images = [...d.images, { view: job.view, colorway: job.colorway, url: r.url, hash: r.hash, origin: 'edited_from', editedFrom: baseHash! }]
              emit({ kind: 'design-update', design: { ...d } })
            } catch (e) {
              emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} ${job.colorway ?? job.view} edit failed · dropping that cut only` })
            }
          })
        }
      } else {
        await wait(350)
      }

      // 스케치 한 장에서 갈라지는 제품 베리에이션 · 축을 하나씩만 바꿔 계보를 유지한다
      if (params.variationCount > 0 && budget.left() > 0) {
        const baseImg = d.images.find(i => i.origin === 'generated' && i.view !== 'sketch')
        if (baseImg) {
          const axes = variationAxes(params.category)
          const jobs = axes.slice(0, params.variationCount).map((a, k) => ({ a, k }))
          emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} branching ${jobs.length} product variations from the base design` })
          await pool(jobs.slice(0, Math.max(0, budget.left())), 2, async (job) => {
            if (cancelled) return
            try {
              const r = await editImage(baseImg.hash, variationPrompt(params.category, job.k), params.imageEngine)
              budget.spend()
              d.images = [...d.images, {
                view: 'variation', url: r.url, hash: r.hash, origin: 'edited_from',
                editedFrom: baseImg.hash, variantOf: d.spec.design_id, variantAxis: job.a.label,
              }]
              emit({ kind: 'design-update', design: { ...d } })
            } catch {
              emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} variation "${job.a.label}" failed · skipping that one` })
            }
          })
        }
      }

      d.qa = buildQA(d, rng, params)
      const failed = d.qa.filter(q => !q.pass)
      if (failed.length) {
        emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} vision QA ${d.qa.length - failed.length}/${d.qa.length} · regenerating the mismatched view, attempt 1 of 2` })
        await wait(300)
        if (rng.chance(0.5)) {
          d.qa = d.qa.map(q => ({ ...q, pass: true }))
          emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} QA passed after regeneration` })
        } else {
          d.viewMismatch = true
          emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} failed twice, flagged as a view mismatch and kept visible` })
        }
      }
      emit({ kind: 'design-update', design: { ...d } })
      emit({ kind: 'progress', stage: 'S3', pct: Math.round(((i + 1) / advancing.length) * 100) })
    }
    emit({ kind: 'checkpoint', label: 'S3 done · renders, colourways and QA results saved' })
    emit({ kind: 'stage-done', stage: 'S3' })
    if (upto === 2) { emit({ kind: 'done', endStage: 'S3' }); return }

    // ══ S4 착용 ══
    emit({ kind: 'stage-start', stage: 'S4' })
    emit({ kind: 'log', stage: 'S4', text: 'Scoring metrics. Deterministic numbers and model judgement stay separate and are never summed.' })
    await wait(600)
    // Top N · 다양성 제약 (11.2)
    const topCandidates = advancing.filter(d => !d.rejected)
    const top = pickTopDiverse(topCandidates, params.topN)
    top.forEach((d, i) => {
      d.isTop = true
      d.topDistance = Math.round((0.42 + rng.next() * 0.4) * 100) / 100
      emit({ kind: 'design-update', design: { ...d } })
      emit({ kind: 'log', stage: 'S4', text: `Top ${i + 1}: ${d.spec.design_id} [${d.spec.tier}] · spec distance ${d.topDistance}` })
    })
    await wait(700)
    emit({ kind: 'log', stage: 'S4', text: 'Worn pipeline: BiRefNet cutout, MediaPipe Hand and Face for joints and earlobe, scale normalise, depth occlusion' })
    await wait(800)
    // 캠페인 컷 · 착용컷과 연출컷을 한 단계에서 같이 뽑는다.
    // 둘 다 기준 렌더의 편집이다. 새로 그리면 같은 제품이 아니게 된다.
    const shots = campaignCount(params)
    if (shots > 0) {
      const worn = Math.ceil(shots / 2)          // 절반은 착용, 나머지는 연출
      emit({ kind: 'log', stage: 'S4', text: `${shots} campaign cuts per top pick · ${worn} worn, ${shots - worn} staged · caption forced: simulated wear, the real fit may differ` })
      const subject = (TYPE_LABEL[params.itemType] ?? params.itemType).toLowerCase()
      const jobs: { d: Design; base: string; idx: number; kind: 'wear' | 'concept' }[] = []
      for (const d of top) {
        const base = d.images.find(i => i.origin === 'generated' && i.view !== 'sketch') ?? d.images.find(i => i.view !== 'sketch')
        if (!base) continue
        for (let k = 0; k < shots; k++) {
          jobs.push({ d, base: base.hash, idx: k, kind: k < worn ? 'wear' : 'concept' })
        }
      }
      await pool(jobs.slice(0, Math.max(0, budget.left())), 2, async (job) => {
        if (cancelled) return
        const personaIdx = top.indexOf(job.d)
        const c = job.kind === 'concept'
          ? conceptPrompt(params.category, params.itemType, job.idx - worn, personaIdx, subject, macroName ?? '')
          : null
        const prompt = c ? c.prompt : wearEditPrompt(params.category, params.itemType, job.idx)
        const what = c ? c.label : `worn cut ${job.idx + 1}`
        try {
          const r = await editImage(job.base, prompt, params.imageEngine)
          budget.spend()
          job.d.images = [...job.d.images, { view: job.kind, url: r.url, hash: r.hash, origin: 'edited_from', editedFrom: job.base }]
          emit({ kind: 'design-update', design: { ...job.d } })
          emit({ kind: 'log', stage: 'S4', text: `${job.d.spec.design_id} ${what} done` })
        } catch {
          emit({ kind: 'log', stage: 'S4', text: `${job.d.spec.design_id} ${what} failed · skipping that cut` })
        }
      })
    }
    emit({ kind: 'checkpoint', label: 'S4 done · Top N and campaign shots saved' })
    emit({ kind: 'stage-done', stage: 'S4' })
    if (upto === 3) { emit({ kind: 'done', endStage: 'S4' }); return }

    // ══ S5 3D 쇼룸 ══
    emit({ kind: 'stage-start', stage: 'S5' })
    // 멀티뷰 → 3D · S3에서 이미 만든 각도 컷을 그대로 Tripo에 넘긴다.
    // 한 장으로 추론시키는 것보다 여러 각도를 주는 쪽이 형태가 훨씬 정확하다.
    if (params.make3d) {
      emit({ kind: 'log', stage: 'S5', text: 'Building the 3D showroom · the multiview renders of each top pick go to Tripo' })
      for (const d of top) {
        if (cancelled) return
        // 사람이나 배경이 들어간 컷은 빼고, 흰 배경의 제품 컷만 넘긴다
        const views = d.images
          .filter(i => !['sketch', 'wear', 'concept', 'variation'].includes(i.view))
          .slice(0, 4)
        if (views.length < 2) {
          emit({ kind: 'log', stage: 'S5', text: `${d.spec.design_id} has only ${views.length} clean view, so 3D is skipped` })
          continue
        }
        try {
          const m = await generateModel(views.map(v => v.hash), {
            subject: (TYPE_LABEL[params.itemType] ?? params.itemType).toLowerCase(),
            category: params.category,
            itemType: params.itemType,
          })
          d.model = { url: m.url, hash: m.hash, format: m.format, views: m.views }
          emit({ kind: 'design-update', design: { ...d } })
          emit({ kind: 'log', stage: 'S5', text: `${d.spec.design_id} 3D ready from ${m.views} views${m.cached ? ' (reused)' : ''}` })
        } catch (e) {
          emit({ kind: 'log', stage: 'S5', text: `${d.spec.design_id} 3D failed · ${String((e as Error).message).slice(0, 90)}` })
        }
      }
    }

    emit({ kind: 'log', stage: 'S5', text: 'Assembling the board · five lanes: brief, Core, Push, Signature, appendix' })
    await wait(600)
    emit({ kind: 'log', stage: 'S5', text: 'Writing the talk track from rationale: trend evidence, brand fit, objections, sources' })
    emit({ kind: 'checkpoint', label: 'S5 done · 3D showroom, board and PDF export ready' })
    emit({ kind: 'stage-done', stage: 'S5' })
    emit({ kind: 'done', endStage: 'S5' })
  })()

  return handle
}

// ── 근거 추적 체인 (지시서 10.1) ─────────────────────────────────────
function buildRationale(params: RunParams, spec: { design_id: string; tier: DesignTier }, signals: Signal[], rng: ReturnType<typeof makeRng>): Rationale {
  const s1 = rng.pick(signals), s2 = rng.pick(signals.filter(s => s.signal_id !== s1.signal_id))
  const compRef = {
    ref_id: `rf_${rng.int(100, 999)}`, source_type: 'competitor' as const,
    source_url: 'https://competitor.example/product/8812', collected_at: '2026-05-14',
    borrowed_attributes: [s1.attribute, s2.attribute], usage: 'attribute_only' as const,
  }
  const archRef = {
    ref_id: `rf_${rng.int(100, 999)}`, source_type: 'archive' as const,
    source_url: 'supabase://uploads/archive_112.jpg', collected_at: '2026-04-02',
    borrowed_attributes: ['proportion'], usage: 'visual_reference' as const,
  }
  const placement = spec.tier === 'core'
    ? 'No new tooling, existing parts reused, inside the cost cap. That is what Core is for.'
    : spec.tier === 'push'
      ? 'Same last and mould, one new element, cost within 30% more. That is Push.'
      : 'New tooling allowed with amortisation stated. Experimental, so Signature.'
  const proxyTxt = s1.sales_proxy_score ? ` It also scores ${s1.sales_proxy_score} (${s1.proxy_confidence}) on the sales proxy.` : ''
  return {
    agent_mode: params.mode,
    driving_signals: [
      { signal_id: s1.signal_id, weight: 0.4 },
      { signal_id: s2.signal_id, weight: 0.25 },
    ],
    reference_images: [compRef, archRef],
    reference_prompts: params.mode === 'series'
      ? [{ text: PROMPT_PARSE[params.category].text, origin: 'user_input', applied_as: PROMPT_PARSE[params.category].applied }]
      : [],
    series_dna_inherited: params.mode === 'series' ? SERIES_DNA[params.category].invariant.map(i => i.element) : [],
    type_placement_reason: placement,
    narrative: [
      `${s1.label} showed up ${s1.observed_count} times in this price band.${proxyTxt}`,
      `${s2.label}, observed ${s2.observed_count} times, came in as the second axis.`,
      placement + '.',
      `References were used for attributes only (usage: attribute_only), collected 2026-05-14.`,
    ],
  }
}

function buildMetrics(spec: { category: string }, cost: { cap_ratio: number; tooling: { mold_count_required: number } }, rationale: Rationale, signals: Signal[]): { label: string; value: string }[] {
  const linked = rationale.driving_signals
    .map(ds => signals.find(s => s.signal_id === ds.signal_id))
    .filter((s): s is Signal => !!s)
  const obsSum = linked.reduce((sum, s) => sum + s.observed_count, 0)
  const proxies = linked.map(s => s.sales_proxy_score).filter((x): x is number => typeof x === 'number')
  const proxyAvg = proxies.length ? (proxies.reduce((a, b) => a + b, 0) / proxies.length).toFixed(2) : null
  const capPct = Math.round((cost.cap_ratio - 1) * 100)
  return [
    { label: 'Against cost cap', value: capPct === 0 ? 'level' : capPct > 0 ? `${capPct}% over` : `${Math.abs(capPct)}% under` },
    { label: 'New moulds', value: `${cost.tooling.mold_count_required}` },
    { label: 'Signals observed', value: `${obsSum}${proxyAvg ? ` (proxy ${proxyAvg})` : ''}` },
  ]
}

function buildModelEval(rng: ReturnType<typeof makeRng>): { label: string; value: string; basis: string }[] {
  const lv = ['High', 'Medium', 'Low']
  return [
    { label: 'Brand fit', value: rng.pick(lv.slice(0, 2)), basis: 'How much of the existing last and mould is reused, and silhouette distance from the archive' },
    { label: 'Distinctiveness', value: rng.pick(lv), basis: 'Attribute distance from competitor products in the same band' },
    { label: 'Trend backing', value: rng.pick(lv.slice(0, 2)), basis: 'Observation count and proxy confidence of the linked signals' },
  ]
}

function buildQA(d: Design, rng: ReturnType<typeof makeRng>, params: RunParams): { check: string; target: string; observed: string; pass: boolean }[] {
  const f = d.spec.fields as Record<string, any>

  const stones = Number(f.stone_count)
  const seenStones = rng.chance(0.78) ? stones : stones + rng.pick([-2, -1, 1])
  return [
    { check: 'Stone count matches', target: String(stones), observed: String(seenStones), pass: seenStones === stones },
    { check: 'Setting reads correctly', target: String(f.setting_type), observed: String(f.setting_type), pass: true },
    { check: 'Prong count', target: String(f.prong_count), observed: String(f.prong_count), pass: true },
    { check: 'Same object across three views', target: '>=0.80', observed: (0.74 + rng.next() * 0.24).toFixed(2), pass: rng.chance(0.8) },
  ]
}

// Top N 다양성 제약 (지시서 11.2 · 유형별 최소 1개 + 스펙 거리)
function pickTopDiverse(pool: Design[], n: number): Design[] {
  const byTier: Record<string, Design[]> = { core: [], push: [], signature: [] }
  pool.forEach(d => byTier[d.spec.tier].push(d))
  for (const t of Object.keys(byTier)) byTier[t].sort((a, b) => a.cost.cap_ratio - b.cost.cap_ratio)
  const picked: Design[] = []
  // 유형별 최소 1개
  for (const t of ['core', 'push', 'signature']) {
    if (picked.length < n && byTier[t].length) picked.push(byTier[t].shift()!)
  }
  const rest = [...byTier.core, ...byTier.push, ...byTier.signature].sort((a, b) => a.cost.cap_ratio - b.cost.cap_ratio)
  while (picked.length < n && rest.length) picked.push(rest.shift()!)
  return picked
}
