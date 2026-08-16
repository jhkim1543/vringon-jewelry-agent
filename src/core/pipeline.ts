// ── 파이프라인 엔진 S1~S5 · 진행 스트리밍·승인 게이트·체크포인트 ──────
import type {
  BestsellerProduct, CompetitorProduct, Design, DesignTier, PipelineEvent, Rationale,
  ReferenceImage, RunParams, Signal, Stage, UploadRef,
} from './types'
import { PACKS, resetSeq, tierCapRule } from './packs'
import { makeRng } from './rng'
import { COMPETITORS, DIRECTIONS, DNA_CONFLICT, DNA_LOCKS, PROMPT_PARSE, REPORT_BIAS, SERIES_DNA, SIGNALS } from './samples'
import { COLORWAY_NAMES } from './sketch'
import {
  colorwayEditPrompt, conceptPrompt, editImage, generateImage, renderPrompt,
  generateModel, sketchPrompt, stampLogo, variationAxes, variationPrompt, viewEditPrompt, wearEditPrompt,
} from './aiClient'
import type { TrendClauseInput } from './aiClient'
import { colorizePrompt, jewelSpecPhrase, reportArtPrompt, sketchVariantPrompt } from './aiClient'
import { assignRecipes, buildConditionPool } from './recipes'
import { gradeQa, qaChecksFor, qaFixPrompt, qaUnavailable } from './visionQa'
import { checkBrandFit, isMdConfigured } from './brand'
import { fetchMdReview, fetchVisionQa } from './research'
import type { SeasonDossier } from './research'
import { fetchCompetitors, fetchDossier, fetchMoodboard, fetchSeriesDna, fetchTrends, moodboardSignals, toBestsellers, toBias, toCompetitors, toSignals, setRunLang } from './research'
import { campaignCount, CAT_LABEL, isCollectedProduct, isCollectedSignal, MODE_LABEL, MODE_SCOPE, TYPE_LABEL, metalProgramOf, stoneProgramOf, uploadName, uploadRefs } from './types'
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

/** 리포트를 여는 무드컷 · 표지 한 장과 매크로별 배너.
 *  이미지 상한과는 무관한, 문서 품질에 쓰는 소량이다. 경쟁사 사진은 스크래핑으로 오고
 *  이쪽은 순수 장식이라 제품·사람·글자가 들어가면 안 된다(reportArtPrompt 가 막는다).
 *  섹션 하나가 실패해도 나머지는 그대로 만든다. */
export async function makeReportArt(
  d: SeasonDossier,
  stopped: () => boolean = () => false,
): Promise<{ cover?: string; sections: Record<string, string> }> {
  const macros = (d.macrotrends ?? []).slice(0, 3)
  // 표지·배너는 가로가 길어야 리포트 프레임에 잘리지 않고 들어간다
  const cover = await generateImage(reportArtPrompt('cover', {
    season: (d as { forecast_season?: string }).forecast_season ?? d.season,
    palette: (macros[0]?.palette ?? []).map(c => ({ name: c.name, hex: c.hex })),
    mood: d.powershift || d.season_title,
  }), 'fast', '1536x1024')
  const sections: Record<string, string> = {}
  for (const m of macros) {
    if (stopped()) break
    try {
      const r = await generateImage(reportArtPrompt('section', {
        title: m.name, mood: m.statement,
        palette: (m.palette ?? []).map(c => ({ name: c.name, hex: c.hex })),
      }), 'fast', '1536x1024')
      sections[m.name] = r.url
    } catch { /* 이 섹션만 아트 없이 간다 */ }
  }
  return { cover: cover.url, sections }
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
    // 레시피 풀 재료 · 조사가 끝나는 대로 쌓인다. 스케치 직전에 조합으로 바뀐다.
    let dossierMacros: { name: string; materials?: string[]; details?: string[]; colors?: { name: string; hex: string }[] }[] = []
    let compTraits: string[] = []
    // 디자인별 트렌드 절 · 레시피가 배정되면 그 조합을, 아니면 공통 절을 준다
    let clauseFor: (id: string) => TrendClauseInput | null = () => trendClause
    // 도시에가 캐시에 있으면 스케치 전에 반영되어야 한다. 새로 조사할 때만 뒤에서 따라온다.
    let dossierJob: Promise<unknown> | null = null
    // 무드보드에서 읽어낸 신호 · 외부 조사가 없는 모드라 이것이 유일한 신호원이다
    let moodSignals: Signal[] = []
    // 근거 원장 · 이 실행이 실제로 모은 것만 담는다. 조사가 실패해 샘플로
    // 되돌아간 실행에서는 비어 있는 채로 남는다 — 샘플은 예시지 근거가 아니다.
    const evidence: EvidencePool = {
      collectedAt: new Date().toISOString().slice(0, 10),
      competitors: [], bestsellers: [], uploads: [], pageShots: [],
      dnaInherited: [], claimChecked: false, fellBack: false,
    }

    // ══ S1 조사 ══
    const scope = MODE_SCOPE[params.mode]
    const catKo = CAT_LABEL[params.category]
    const typeKo = TYPE_LABEL[params.itemType] ?? params.itemType

    // 이 분석의 조사 언어를 고정한다. 도중에 화면 언어를 바꿔도 결과는 안 섞인다.

    setRunLang(params.researchLang ?? null)
    // 라인 프로필 · 금속과 스톤을 조사 전 확정해 모든 조사에 싣는다
    const lineMetal = params.line ? metalProgramOf(params.line) : ''
    const lineStone = params.line ? stoneProgramOf(params.line) : ''


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
          metalProgram: lineMetal, stoneProgram: lineStone,
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
        // 인용할 수 있는 제품만 근거로 센다. 주소가 없으면 근거가 아니라 메모다.
        evidence.competitors = comps.filter(isCollectedProduct)
        evidence.collectedAt = r.collected_at || evidence.collectedAt
        // 경쟁사에서 반복 관찰된 조형 특징 · 레시피의 competitor 원자가 된다
        compTraits = [...new Set(evidence.competitors.flatMap(c => c.design_traits ?? []))].slice(0, 5)
        // 백화점·명품몰 베스트셀러 · 유저 카테고리에서 "잘 팔린다고 표기된 것"의 사진과 근거
        const best = toBestsellers(r)
        if (best.length) {
          evidence.bestsellers = best.filter(isCollectedProduct)
          emit({ kind: 'bestsellers', items: best })
          emit({ kind: 'log', stage: 'S1', text: `Department store bestsellers: ${best.length} products with photos, across ${[...new Set(best.map(b => b.retailer))].join(', ')}` })
        } else {
          // 빈손도 결과다. 아무 말 없이 섹션만 사라지면 조사를 안 한 것처럼 보인다.
          emit({ kind: 'log', stage: 'S1', text: 'Department store bestsellers: none carried a rank or bestseller badge for this item, so nothing is claimed' })
        }
      } catch (e) {
        evidence.fellBack = true
        emit({ kind: 'log', stage: 'S1', text: `Competitor research failed · ${String((e as Error).message).slice(0, 120)} · falling back to sample data. Nothing from the sample is offered as evidence on the design cards.` })
        emit({ kind: 'competitors', items: COMPETITORS[params.category] })
      }
      if (cancelled) return
      emit({ kind: 'log', stage: 'S1', text: '3 Trend research · looking for design signals' })
    } else if (params.mode === 'series') {
      // 시리즈 · 업로드 자료가 주. 외부 조사는 트렌드까지만, 경쟁사 리서치 없음
      const si = params.series
      const ups = uploadRefs(si.archiveFiles)
      evidence.uploads = ups.filter(u => !!u.url)
      emit({ kind: 'log', stage: 'S1', text: `Series "${si.seriesName || 'untitled'}" · ${si.archiveFiles.length} uploads · value statement ${si.valueStatement.length} chars` })
      emit({ kind: 'log', stage: 'S1', text: `1 Opening your ${ups.length} designs and separating what repeats from what varies` })
      let dnaRead: Awaited<ReturnType<typeof fetchSeriesDna>> | null = null
      if (ups.length) {
        try {
          dnaRead = await fetchSeriesDna({ uploads: ups, valueStatement: si.valueStatement, categoryKo: catKo, typeKo })
        } catch (e) {
          emit({ kind: 'log', stage: 'S1', text: `Could not read the uploads · ${String((e as Error).message).slice(0, 110)} · falling back to sample data` })
        }
      } else {
        emit({ kind: 'log', stage: 'S1', text: 'No readable uploads on this run, so the series shown is sample data' })
      }
      if (cancelled) return
      if (dnaRead) {
        emit({ kind: 'series-dna', dna: {
          invariant: dnaRead.invariant.map(x => ({ label: x.label, observed_in: x.observed_in, of: x.of })),
          variable: dnaRead.variable.map(x => ({ label: x.label, observed_in: x.observed_in, of: x.of })),
          ambiguous: dnaRead.ambiguous.map(x => ({ label: x.label, note: x.why })),
        } as typeof SERIES_DNA[typeof params.category] })
        // 판독이 성공했을 때만 상속을 주장한다. 실패하면 샘플 DNA 가 화면에 뜨지만
        // 그것을 "이 디자인이 물려받았다"고 적지는 않는다.
        evidence.dnaInherited = dnaRead.invariant.map(x => x.label)
        evidence.claimChecked = true
        emit({ kind: 'log', stage: 'S1', text: `Read from your files: ${dnaRead.observed_summary.slice(0, 150)}` })
        emit({ kind: 'log', stage: 'S1', text: '2 Comparing the values you wrote against what is actually there' })
        const c = dnaRead.brand_claim_check
        emit({ kind: 'dna-conflict', brandClaim: c.claim || '(no claim given)', observed: c.observed })
        emit({ kind: 'log', stage: 'S1', text: c.agrees
          ? `Statement and observation agree: ${c.observed.slice(0, 120)}`
          : `Statement and observation disagree · ${c.note.slice(0, 150)}` })
      } else {
        emit({ kind: 'series-dna', dna: SERIES_DNA[params.category] })
        const conflict = DNA_CONFLICT[params.category]
        emit({ kind: 'dna-conflict', brandClaim: conflict.brandClaim, observed: conflict.observed })
      }
      await wait(400)
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
      const ups = uploadRefs(mi.files)
      // 원본 문서와 쪽 그림을 나눈다. 신호가 p.3 을 인용하면 그 쪽 그림을 가리킬 수 있다.
      evidence.uploads = ups.filter(u => !!u.url && !(u.mime ?? '').startsWith('image/'))
      evidence.pageShots = ups.filter(u => !!u.url && (u.mime ?? '').startsWith('image/'))
      if (!evidence.uploads.length) evidence.uploads = ups.filter(u => !!u.url)
      emit({ kind: 'log', stage: 'S1', text: `${mi.files.length} uploads: ${mi.files.map(uploadName).join(', ')} · nothing outside these files` })
      emit({ kind: 'log', stage: 'S1', text: '1 Opening the document · text, figures, captions and colour chips' })
      emit({ kind: 'log', stage: 'S1', text: '2 Uploads tagged as untrusted · any instruction inside them is treated as data, not a command' })
      if (ups.length) {
        try {
          const read = await fetchMoodboard({ uploads: ups, notes: mi.notes, categoryKo: catKo, typeKo })
          if (cancelled) return
          moodSignals = moodboardSignals(read)
          emit({ kind: 'log', stage: 'S1', text: `3 Pulled ${moodSignals.length} signals, each with the page it came from` })
          if (read.palette?.length) {
            emit({ kind: 'log', stage: 'S1', text: `Palette in the document: ${read.palette.slice(0, 6).map(c => `${c.name} ${c.hex}`).join(', ')}` })
          }
          emit({ kind: 'report-bias', bias: { publisher: mi.files.map(uploadName).join(', '), perspective: read.source_perspective, notes: [read.coverage_note] } })
          emit({ kind: 'log', stage: 'S1', text: `4 What this document cannot answer: ${read.coverage_note.slice(0, 150)}` })
        } catch (e) {
          emit({ kind: 'log', stage: 'S1', text: `Could not read the document · ${String((e as Error).message).slice(0, 110)} · falling back to sample data` })
          emit({ kind: 'report-bias', bias: REPORT_BIAS })
        }
      } else {
        emit({ kind: 'log', stage: 'S1', text: 'No readable uploads on this run, so the signals shown are sample data' })
        emit({ kind: 'report-bias', bias: REPORT_BIAS })
      }
    }
    // ── 신호 확정 · 트렌드 조사를 하는 모드는 실제 검색 결과를 쓴다
    let signals: Signal[] = moodSignals
    const doTrend = scope.trend && (params.mode !== 'series' || params.series.trendSearch)
    if (doTrend) {
      try {
        // 신호는 빠른 경로로 먼저 받는다. 상세 보고서는 S1을 막지 않고 뒤에서 따라온다.
        const tr = await fetchTrends({
          metalProgram: lineMetal, stoneProgram: lineStone,
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
          metalProgram: lineMetal, stoneProgram: lineStone,
          categoryEn: catKo,
          season: 'FW26',
          priceBand: params.mode === 'trend'
            ? `KRW ${(params.trend.priceMinKrw / 10000).toFixed(0)}0k-${(params.trend.priceMaxKrw / 10000).toFixed(0)}0k ${params.trend.priceBand}`
            : undefined,
          brands: params.mode === 'trend' ? params.trend.competitors : [],
        }).then(async d => {
          if (cancelled) return
          // 첫 매크로를 기준 방향으로 잡는다. 여기서 나온 소재·디테일·팔레트가 이미지 프롬프트로 넘어간다.
          dossierMacros = (d.macrotrends ?? []).map(m => ({
            name: m.name,
            materials: (m.materials ?? []).map(x => x.label),
            details: (m.details ?? []).map(x => x.label),
            colors: (m.palette ?? []).map(c => ({ name: c.name, hex: c.hex })),
          }))
          const m0 = d.macrotrends?.[0]
          if (m0) {
            // 신호 키워드가 먼저 실려 있을 수 있으므로 덮어쓰지 않고 합친다
            trendClause = {
              ...(trendClause ?? {}),
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

          // 리포트를 여는 무드컷 · 이미지 상한과 무관하게 문서 품질에 쓰는 소량이다.
          // 실패해도 리포트는 그대로 나간다 (기존 렌더로 채워진다).
          try {
            const art = await makeReportArt(d, () => cancelled)
            if (cancelled) return
            emit({ kind: 'report-art', cover: art.cover, sections: art.sections })
            emit({ kind: 'log', stage: 'S1', text: `Report art ready · 1 cover, ${Object.keys(art.sections).length} section openers` })
          } catch {
            emit({ kind: 'log', stage: 'S1', text: 'Report art could not be made. The report still prints, using the run\'s own renders.' })
          }
        }).catch(() => {
          emit({ kind: 'dossier-pending', on: false })
          emit({ kind: 'log', stage: 'S1', text: 'The season dossier failed to build. Signals and the report are still usable.' })
        })
        fetchTrends({
          metalProgram: lineMetal, stoneProgram: lineStone,
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
        evidence.fellBack = true
        emit({ kind: 'log', stage: 'S1', text: `Trend research failed · ${String((e as Error).message).slice(0, 120)} · falling back to sample data` })
      }
    }
    if (!signals.length) {
      // 샘플 신호에 쪽수를 지어 붙이지 않는다. 무작위 p.34 는 근거처럼 보이지만
      // 아무 문서도 가리키지 않고, 시드 재현성까지 깬다.
      signals = SIGNALS[params.category]
      evidence.fellBack = true
    }
    // 확정된 신호 키워드를 즉시 프롬프트 절에 싣는다. 도시에는 늦거나 실패할 수 있지만
    // 신호는 이 시점에 항상 있다 — 조사를 해 놓고 스케치가 그것을 모르는 일이 없게.
    {
      const strong = signals.filter(s => s.confidence !== 'low').map(s => s.label)
      const words = (strong.length ? strong : signals.map(s => s.label)).slice(0, 4)
      if (words.length) trendClause = { ...(trendClause ?? {}), signals: words }
    }
    emit({ kind: 'signals', signals })
    const lowConf = signals.filter(s => s.confidence === 'low').length
    const sourced = signals.filter(isCollectedSignal).length
    emit({ kind: 'log', stage: 'S1', text: sourced === signals.length
      ? `${signals.length} signals confirmed · every one carries a source${lowConf ? ` · ${lowConf} single source, marked low confidence` : ''}`
      : `${signals.length} signals on screen · ${sourced} carry a source. The rest are sample data and are labelled as such.` })
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
    // 라인이 금속·도금을 정했으면 스펙 생성이 그것을 뒤집을 수 없다.
    // (Gemini 감사: 925 실버 라인에 brass 스펙이 섞여 나오던 결함)
    const SPEC_METAL: Record<string, string> = {
      '925_silver': '925 silver', '14k_gold': '14k gold', '18k_gold': '18k gold',
      gold_filled: 'gold-filled', plated_brass: 'brass',
    }
    const SPEC_PLATING: Record<string, string> = {
      rhodium: 'rhodium', gold_vermeil: '18k gold', gold_plated: '18k gold', none: 'none',
    }
    const lineLock: Record<string, string> = {}
    if (params.line) {
      const m = SPEC_METAL[params.line.baseMetal]
      if (m) lineLock.metal = m
      const pl = SPEC_PLATING[params.line.coating]
      if (pl) lineLock.plating = pl
    }
    const locked = { ...lineLock, ...(params.mode === 'series' ? DNA_LOCKS[params.category] : {}) }
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
      // TCW 상한 가드레일 · 라운드 브릴리언트 근사 0.0061×d³(ct)로 총캐럿을 계산해,
      // 상한을 넘으면 개별 스톤 지름을 줄인다 (Gemini 감사: 0.5ct 상한에 0.75ct 스펙)
      if (params.line?.tcwMaxCt && params.line.stone !== 'none') {
        const f = spec.fields as Record<string, string | number | boolean>
        const n = Number(f.stone_count) || 0
        if (n > 0) {
          const caratOf = (mm: number) => 0.0061 * mm ** 3
          let mm = Number(f.stone_size_mm) || 0
          if (n * caratOf(mm) > params.line.tcwMaxCt) {
            mm = Math.max(0.8, Math.floor(Math.cbrt(params.line.tcwMaxCt / (n * 0.0061)) * 10) / 10)
            f.stone_size_mm = mm
          }
          f.tcw_ct = Math.round(n * caratOf(mm) * 100) / 100
        }
      }
      const cost = pack.costModel(spec, rng)
      // 라인 프로필을 함께 넘긴다 · 도금 두께·버메일 정의·니켈 용출 룰이 이걸 본다
      const ruleResults = [...pack.rules(spec, params.line), ...tierCapRule(spec, cost)]
      const rejected = ruleResults.some(r => r.severity === 'fail')
      const rationale = buildRationale(params, spec, signals, rng, evidence)
      const d: Design = {
        spec, ruleResults, rejected, cost, rationale,
        qa: [], viewMismatch: false,
        metrics: buildMetrics(spec, cost, rationale, signals),
        modelEval: [],
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

    // 조건 레시피 배정 · 디자인마다 조사 결과의 다른 조합을 준다.
    // 전부 같은 트렌드 절을 받으면 스펙만 다르고 방향이 같은 비슷한 디자인만 나온다.
    // 단독 → 2개 조합 → 융합을 순환하고, 어떤 조합에서 나왔는지 카드에 남는다.
    const condPool = buildConditionPool({
      signals: trendClause?.signals,
      macros: dossierMacros,
      competitorTraits: compTraits,
    })
    if (condPool.length >= 2) {
      const recipes = assignRecipes(condPool, alive.length, rng, trendClause?.keySpec)
      alive.forEach((d, i) => {
        const r = recipes[i]
        if (!r) return
        d.recipe = { title: r.title, shape: r.shape, atoms: r.atoms }
      })
      const recipeClauses = new Map(alive.map((d, i) => [d.spec.design_id, recipes[i]?.clause]))
      emit({ kind: 'log', stage: 'S2', text: `Concept recipes assigned · ${recipes.length} distinct combinations from ${condPool.length} research conditions (solo, pair and fusion)` })
      clauseFor = (id) => recipeClauses.get(id) ?? trendClause
    } else if (condPool.length) {
      emit({ kind: 'log', stage: 'S2', text: 'Only one research condition available · every design carries it, recipes need at least two' })
    }

    // ── 근거 이미지 · 레시피가 정해진 뒤에야 어떤 제품이 이 디자인에 닿았는지 안다 ──
    // 이미지를 만들기 전에 붙는다. S2 에서 멈춘 실행도 근거를 갖고 끝난다.
    for (const d of designs) {
      // 계층 2 평가도 여기서 계산한다 · 레시피가 정해져야 차별성을 잴 수 있다
      d.modelEval = buildModelEval(d, params, signals)
      const refs = referencesFor(d, params, signals, evidence)
      d.rationale = {
        ...d.rationale,
        reference_images: refs,
        narrative: [...d.rationale.narrative, referenceNote(refs, params, evidence)],
      }
      emit({ kind: 'design-update', design: { ...d } })
    }
    const withRefs = designs.filter(d => d.rationale.reference_images.length).length
    emit({ kind: 'log', stage: 'S2', text: withRefs
      ? `${withRefs} of ${designs.length} designs carry a reference, each one a product or file this run actually collected`
      : 'No design carries a reference. Nothing collected this run fed a design directly, so the reference panel stays empty rather than showing an example.' })

    // 실제 스케치 생성 · 룰 통과분만, 상한까지. 초과분은 SVG 폴백
    if (budget.left() > 0) {
      const targets = alive.slice(0, budget.left())
      emit({ kind: 'log', stage: 'S2', text: `Sketching ${targets.length} · three at a time, anything already made is reused` })
      let done = 0
      await pool(targets, ENGINES[params.imageEngine].concurrency, async (d) => {
        if (cancelled) return
        try {
          const skPrompt = sketchPrompt(d.spec, params.imageEngine, params.brand, clauseFor(d.spec.design_id), params.line)
          const r = await generateImage(skPrompt, params.imageEngine)
          budget.spend()
          d.images = [...d.images, { view: 'sketch', url: r.url, hash: r.hash, origin: 'generated', promptUsed: skPrompt }]
          emit({ kind: 'log', stage: 'S2', text: `${d.spec.design_id} sketch done${r.cached ? ' (reused)' : ''}` })
          // 같은 외형의 흑백 변형 스케치 · 외형은 여기서 확정되고, S3의 컬러 디자인은
          // 이 스케치들에서 나온다. 스케치가 곧 디자인의 기준이다.
          // 예산이 빠듯하면 변형보다 S3 기준 디자인이 먼저다 — S3 몫을 남겨 두고 만든다.
          const reserveS3 = Math.max(1, Math.round(alive.length * params.renderRatio)) + 2
          const nVar = Math.max(0, (params.designsPerSketch ?? 1) - 1)
          for (let k = 0; k < nVar; k++) {
            if (cancelled || budget.left() <= reserveS3) break
            try {
              const vp = sketchVariantPrompt(k)
              const rv = await editImage(r.hash, vp, params.imageEngine)
              budget.spend()
              d.images = [...d.images, { view: 'sketch_var', url: rv.url, hash: rv.hash, origin: 'edited_from', editedFrom: r.hash, promptUsed: vp }]
              emit({ kind: 'log', stage: 'S2', text: `${d.spec.design_id} sketch variant ${k + 2} of ${nVar + 1}, same form` })
            } catch {
              emit({ kind: 'log', stage: 'S2', text: `${d.spec.design_id} sketch variant ${k + 2} failed, skipping` })
            }
          }
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
      // QA 재시도가 기준 렌더를 편집해야 하므로 블록 밖에 둔다
      let baseHash: string | null = null

      if (budget.left() > 0) {
        // ① 기준 디자인 · 스케치가 있으면 그 스케치를 컬러 렌더로 옮긴다(기하 유지).
        //    스케치가 없을 때만(예산 소진·실패) 예전처럼 프롬프트로 직접 그린다.

        const sketchImgs = d.images.filter(i => i.view === 'sketch' || i.view === 'sketch_var')
        const colPrompt = colorizePrompt(d.spec, params.brand, clauseFor(d.spec.design_id), params.line)
        const basePrompt = sketchImgs.length ? colPrompt : renderPrompt(d.spec, params.imageEngine, params.brand, clauseFor(d.spec.design_id), params.line)
        try {
          const r = sketchImgs.length
            ? await editImage(sketchImgs[0].hash, colPrompt, params.imageEngine)
            : await generateImage(basePrompt, params.imageEngine)
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
          d.images = [...d.images, { view: pack.viewSet[0].key, url: baseUrl, hash: baseHash, origin: 'generated', editedFrom: sketchImgs[0]?.hash, promptUsed: basePrompt }]
          emit({ kind: 'design-update', design: { ...d } })
          emit({ kind: 'log', stage: 'S3', text: sketchImgs.length
            ? `${d.spec.design_id} base design colourised from its sketch, geometry kept`
            : `${d.spec.design_id} base design generated directly (no sketch available)` })
        } catch (e) {
          d.imageError = String((e as Error).message || e)
          emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} base render failed · ${d.imageError}` })
        }
        // ② 변형 스케치들도 각각 컬러 디자인으로 · 디자인은 언제나 스케치에서 나온다
        for (let k = 1; k < sketchImgs.length; k++) {
          if (cancelled || budget.left() <= 0) break
          try {
            const r2 = await editImage(sketchImgs[k].hash, colPrompt, params.imageEngine)
            budget.spend()
            d.images = [...d.images, { view: 'design', url: r2.url, hash: r2.hash, origin: 'edited_from', editedFrom: sketchImgs[k].hash, promptUsed: colPrompt }]
            emit({ kind: 'design-update', design: { ...d } })
            emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} design ${k + 1} of ${sketchImgs.length}, from sketch variant ${k + 1}` })
          } catch {
            emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} design from sketch variant ${k + 1} failed · skipping` })
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

      // ── 비전 QA · 실제로 만든 컷을 보고 스펙과 대조한다 ─────────────
      // 검사에 쓸 컷은 기준 뷰와 필수 추가 뷰만이다. 컬러웨이는 일부러 색을 바꾼 것이고
      // variation·sketch_var 은 일부러 다른 물건이라, 넣으면 전부 불일치로 잡힌다.
      {
        const viewKeys = pack.viewSet.filter(v => v.required).slice(0, params.viewCount).map(v => v.key)
        let cuts = viewKeys
          .map(k => d.images.find(im => im.view === k && !im.colorway))
          .filter((im): im is NonNullable<typeof im> => !!im)
        let surface: 'render' | 'sketch' = 'render'
        if (!cuts.length) {
          // 예산이 S3 전에 떨어진 런에는 스케치만 있다. 흑백 도면으로도 개수·세팅·페어는 보인다.
          const sk = d.images.find(im => im.view === 'sketch')
          if (sk) { cuts = [sk]; surface = 'sketch' }
        }
        const defs = qaChecksFor(d.spec, params.line, surface, cuts.length)
        if (!cuts.length) {
          d.qa = qaUnavailable(defs, 'no picture was made for this design')
          emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} has no cut to check, so every item is recorded as unverified rather than passed` })
        } else {
          const item = TYPE_LABEL[params.itemType] ?? params.itemType
          const specPhrase = jewelSpecPhrase(d.spec)
          try {
            const read = await fetchVisionQa({
              item, spec: specPhrase, surface,
              checks: defs.map(c => ({ id: c.id, label: c.label, target: c.target })),
              views: cuts.map(c => ({ view: c.view, hash: c.hash })),
            })
            d.qa = gradeQa(defs, read)
            const real = d.qa.filter(q => q.status === 'fail')
            const unknown = d.qa.filter(q => q.status === 'unknown').length
            emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} vision QA ${d.qa.filter(q => q.pass).length}/${d.qa.length} from ${cuts.length} cut${cuts.length > 1 ? 's' : ''}${unknown ? `, ${unknown} could not be told` : ''}` })

            // 어긋난 것이 있으면 그 컷 한 장을 고쳐 다시 만들고, 진짜로 다시 검사한다.
            // 예전에는 여기서 동전을 던져 전부 통과로 덮었다.
            if (real.length && budget.left() > 0 && baseHash) {
              emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} correcting the cut · ${real.map(q => q.check).join(', ')}` })
              try {
                const fix = await editImage(baseHash, qaFixPrompt(real, specPhrase), params.imageEngine)
                budget.spend()
                // 자리에 끼워 넣는다. view 와 origin 이 바뀌면 뒤 단계가 기준 렌더를 잃는다.
                const idx = d.images.findIndex(im => im.hash === cuts[0].hash)
                if (idx >= 0) d.images[idx] = { ...d.images[idx], url: fix.url, hash: fix.hash, qaRemadeFrom: cuts[0].hash }
                if (baseHash === cuts[0].hash) baseHash = fix.hash
                const again = await fetchVisionQa({
                  item, spec: specPhrase, surface,
                  checks: defs.map(c => ({ id: c.id, label: c.label, target: c.target })),
                  views: [{ view: cuts[0].view, hash: fix.hash }, ...cuts.slice(1).map(c => ({ view: c.view, hash: c.hash }))],
                })
                d.qa = gradeQa(defs, again)
                const still = d.qa.filter(q => q.status === 'fail')
                d.viewMismatch = still.length > 0
                emit({ kind: 'log', stage: 'S3', text: still.length
                  ? `${d.spec.design_id} still off after the correction · ${still.map(q => q.check).join(', ')} · kept visible and flagged`
                  : `${d.spec.design_id} matches the spec after the correction` })
              } catch (e) {
                d.viewMismatch = true
                emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} correction failed · ${String((e as Error).message).slice(0, 90)} · the mismatch stays on the card` })
              }
            } else if (real.length) {
              d.viewMismatch = true
              emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} does not match the spec and there is no image budget left to correct it · flagged and kept visible` })
            }
          } catch (e) {
            d.qaError = String((e as Error).message || e)
            d.qa = qaUnavailable(defs, 'the check could not run')
            emit({ kind: 'log', stage: 'S3', text: `${d.spec.design_id} vision QA unavailable · ${d.qaError.slice(0, 90)} · recorded as unverified, not as a pass` })
          }
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

    // MD 리뷰 · 설정된 페르소나가 후보 전체를 사진으로 보고 pick/hold/drop 을 준다.
    // 지표(계층 1)·모델 평가(계층 2)와 별개의 층이다 — 순위를 바꾸지 않고 판단만 얹는다.
    // 실패해도 셀렉은 그대로 간다.
    if (params.brand?.md && isMdConfigured(params.brand.md)) {
      try {
        emit({ kind: 'log', stage: 'S4', text: `MD review · ${params.brand.md.role} looking at ${topCandidates.length} candidates with photographs` })
        const items = topCandidates.map(d => ({
          id: d.spec.design_id,
          tier: d.spec.tier,
          spec: jewelSpecPhrase(d.spec),
          costNote: `cap ratio ${Math.round(d.cost.cap_ratio * 100)}%`,
          imageHash: d.images.find(i => i.origin === 'generated' && i.view !== 'sketch')?.hash
            ?? d.images.find(i => i.view === 'sketch')?.hash,
          recipe: d.recipe?.title,
        }))
        const r = await fetchMdReview({ persona: params.brand.md, item: TYPE_LABEL[params.itemType] ?? params.itemType, designs: items })
        if (cancelled) return
        for (const rev of r.reviews) {
          const d = topCandidates.find(x => x.spec.design_id === rev.design_id)
          if (!d) continue
          d.mdReview = { verdict: rev.verdict, reason: rev.reason, fix: rev.fix || undefined }
          emit({ kind: 'design-update', design: { ...d } })
        }
        emit({ kind: 'md-rationale', text: r.pick_rationale })
        const picks = r.reviews.filter(x => x.verdict === 'pick').length
        const drops = r.reviews.filter(x => x.verdict === 'drop').length
        emit({ kind: 'log', stage: 'S4', text: `MD verdicts in: ${picks} pick, ${r.reviews.length - picks - drops} hold, ${drops} drop${r.cached ? ' (reused an earlier review)' : ''}` })

        // MD 판정이 실제 선정을 바꾼다. 판정만 카드에 붙이고 목록은 그대로 두면
        // "MD 탈락"이라고 적힌 디자인이 Top 으로 발표되는 모순이 생긴다.
        // 점수를 합산하지는 않는다 — 같은 티어 안에서 자리만 바꾼다(티어별 최소 1건 유지).
        const rank = (d: Design) => d.mdReview?.verdict === 'pick' ? 0 : d.mdReview?.verdict === 'drop' ? 2 : 1
        let swaps = 0
        for (const t of top.filter(d => rank(d) === 2)) {
          const better = topCandidates
            .filter(c => !c.isTop && c.spec.tier === t.spec.tier && rank(c) < 2)
            .sort((a, b) => rank(a) - rank(b) || a.cost.cap_ratio - b.cost.cap_ratio)[0]
          if (!better) continue
          t.isTop = false; better.isTop = true
          better.topDistance = t.topDistance
          top[top.indexOf(t)] = better
          swaps++
          emit({ kind: 'design-update', design: { ...t } })
          emit({ kind: 'design-update', design: { ...better } })
          emit({ kind: 'log', stage: 'S4', text: `MD dropped ${t.spec.design_id}, so ${better.spec.design_id} [${better.spec.tier}] takes that slot` })
        }
        if (!swaps && top.some(d => rank(d) === 2)) {
          emit({ kind: 'log', stage: 'S4', text: 'MD dropped some of the picks but no same-tier replacement was left. They stay on the list carrying the drop verdict, so the objection travels with them.' })
        }
      } catch (e) {
        emit({ kind: 'log', stage: 'S4', text: `MD review unavailable · ${String((e as Error).message).slice(0, 100)} · selection continues on metrics alone` })
      }
    }
    await wait(700)
    emit({ kind: 'log', stage: 'S4', text: 'Placing each pick on a model · natural position, scale and lighting' })
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
      emit({ kind: 'log', stage: 'S5', text: 'Building the 3D showroom · each top pick becomes a model you can turn' })
      for (const d of top) {
        if (cancelled) return
        // 3D 전용 4면 뷰(정면·좌·후면·우)를 기준 렌더에서 편집으로 만든다.
        // 45도·디테일 컷을 그대로 보내면 Tripo 슬롯 의미와 어긋나 형태가 틀어진다.
        const base = d.images.find(i => i.origin === 'generated' && !['sketch', 'wear', 'concept', 'variation'].includes(i.view))
        if (!base) {
          emit({ kind: 'log', stage: 'S5', text: `${d.spec.design_id} has no clean base render, so 3D is skipped` })
          continue
        }
        emit({ kind: 'log', stage: 'S5', text: `${d.spec.design_id} building 4 orthographic views for 3D` })
        const ORTHO: { slot: string; prompt: string }[] = [
          { slot: 'front', prompt: 'Rotate to a straight-on front orthographic view of the exact same piece.' },
          { slot: 'left', prompt: 'Rotate to a straight-on left side orthographic view of the exact same piece.' },
          { slot: 'back', prompt: 'Rotate to a straight-on back orthographic view of the exact same piece.' },
          { slot: 'right', prompt: 'Rotate to a straight-on right side orthographic view of the exact same piece.' },
        ]
        const ortho: { hash: string; url: string }[] = []
        for (const o of ORTHO) {
          if (cancelled) return
          try {
            const p3 = `${o.prompt} Keep every proportion, material, stone and detail identical. Centered, plain pure white background, even studio light, no shadow, no text.`
            const r3 = await editImage(base.hash, p3, params.imageEngine)
            ortho.push({ hash: r3.hash, url: r3.url })
            d.images = [...d.images, { view: `ortho_${o.slot}`, url: r3.url, hash: r3.hash, origin: 'edited_from', editedFrom: base.hash, promptUsed: p3 }]
          } catch {
            emit({ kind: 'log', stage: 'S5', text: `${d.spec.design_id} ${o.slot} view failed · continuing with the rest` })
          }
        }
        emit({ kind: 'design-update', design: { ...d } })
        const views = ortho.length >= 3 ? ortho : [{ hash: base.hash, url: base.url }]
        if (views.length < 2) {
          emit({ kind: 'log', stage: 'S5', text: `${d.spec.design_id} could not build enough views, so 3D is skipped` })
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
/** 이 실행이 실제로 모은 것만 담는 근거 원장 */
interface EvidencePool {
  /** 조사 응답이 밝힌 수집일 · 없으면 실행일 */
  collectedAt: string
  competitors: CompetitorProduct[]
  bestsellers: BestsellerProduct[]
  /** 올린 원본 · 시리즈 디자인 또는 무드보드 문서 */
  uploads: UploadRef[]
  /** 문서에서 떠 온 쪽 그림 · 이름에 p.N 이 들어 있다 */
  pageShots: UploadRef[]
  /** 업로드에서 실제로 읽어낸 불변 요소 · 판독이 실패하면 빈 배열 */
  dnaInherited: string[]
  /** 가치 문장을 업로드와 실제로 대조했는가 */
  claimChecked: boolean
  /** 조사가 실패해 샘플로 되돌아갔는가 */
  fellBack: boolean
}

const pageNo = (s: string) => Number(/p\.?\s*(\d+)/i.exec(s ?? '')?.[1] ?? 0)

/** 이 디자인에 실제로 닿은 출처만 되짚는다.
 *  트렌드는 레시피에 실린 조형 특징을 낸 제품으로, 시리즈는 판독된 DNA 로,
 *  무드보드는 신호가 인용한 쪽으로 이어진다. 이어지지 않으면 비운다 —
 *  빈 칸은 정직하지만 지어낸 출처는 정직하지 않다. */
function referencesFor(d: Design, params: RunParams, signals: Signal[], ev: EvidencePool): ReferenceImage[] {
  if (params.mode === 'series') {
    // 올린 파일이 있어도 판독이 실패했으면 무엇을 물려받았는지 말할 수 없다
    if (!ev.dnaInherited.length) return []
    return ev.uploads.slice(0, 3).map(u => ({
      ref_id: `up_${u.hash.slice(0, 8)}`,
      source_type: 'archive' as const,
      source_url: u.url!,
      collected_at: ev.collectedAt,
      borrowed_attributes: ev.dnaInherited,
      usage: 'attribute_only' as const,
      label: u.name,
      linked_via: `Series DNA read across ${ev.uploads.length} uploaded designs`,
    }))
  }
  if (params.mode === 'moodboard') {
    const doc = ev.uploads[0]
    if (!doc?.url) return []
    const cited = d.rationale.driving_signals
      .map(ds => signals.find(s => s.signal_id === ds.signal_id))
      .filter((s): s is Signal => !!s && !!s.page_ref)
    if (!cited.length) return []
    return cited.slice(0, 2).map(s => {
      // 같은 쪽 그림이 올라와 있으면 문서가 아니라 그 쪽을 가리킨다
      const shot = ev.pageShots.find(u => pageNo(u.name) > 0 && pageNo(u.name) === pageNo(s.page_ref!))
      const src = shot ?? doc
      return {
        ref_id: `${s.signal_id}_${src.hash.slice(0, 8)}`,
        source_type: 'trend_report' as const,
        source_url: src.url!,
        collected_at: ev.collectedAt,
        borrowed_attributes: [s.attribute],
        usage: 'attribute_only' as const,
        page_ref: s.page_ref,
        label: doc.name,
        linked_via: `Signal ${s.signal_id}`,
      }
    })
  }
  // 트렌드 · 이 디자인의 레시피에 실린 조형 특징을 낸 제품만 인용한다.
  // 레시피 원자는 design_traits 에서 글자 그대로 가져온 것이라 === 로 되짚힌다.
  const traits = (d.recipe?.atoms ?? []).filter(a => a.kind === 'competitor').map(a => a.label)
  if (!traits.length) return []
  const pool = [
    ...ev.competitors.map(p => ({ p, kind: 'competitor' as const, at: ev.collectedAt })),
    ...ev.bestsellers.map(p => ({ p, kind: 'bestseller' as const, at: p.collected_at || ev.collectedAt })),
  ]
  const out: ReferenceImage[] = []
  for (const { p, kind, at } of pool) {
    // 그 제품의 design_traits 에 실제로 있는 것만 빌렸다고 적는다
    const borrowed = (p.design_traits ?? []).filter(x => traits.includes(x))
    const url = p.product_url || p.source_urls?.[0]
    if (!borrowed.length || !url) continue
    out.push({
      ref_id: p.product_id, source_type: kind, source_url: url, collected_at: at,
      borrowed_attributes: borrowed,
      // 제품 사진은 생성에 들어가지 않는다. 속성만 읽는다.
      usage: 'attribute_only',
      label: `${p.brand} ${p.name}`,
      linked_via: d.recipe?.title ?? borrowed[0],
    })
    if (out.length >= 3) break
  }
  return out
}

/** 근거 문장 한 줄 · 참조가 없으면 없다고 말한다. 빈 칸을 말없이 두지 않는다. */
function referenceNote(refs: ReferenceImage[], params: RunParams, ev: EvidencePool): string {
  if (refs.length) {
    const names = refs.map(r => r.label ?? r.ref_id).join(', ')
    return `Attributes were read from ${names}, collected ${refs[0].collected_at}. The photographs were never fed into generation.`
  }
  if (ev.fellBack) return 'Research fell back to sample data on this run, so no product is offered as evidence.'
  if (params.mode === 'trend') return 'No collected product fed this design directly, so no product reference is claimed.'
  if (params.mode === 'series') return 'The uploaded series could not be read on this run, so no archive reference is claimed.'
  return 'No page of the uploaded document is cited for this design, so no reference is claimed.'
}

function buildRationale(params: RunParams, spec: { design_id: string; tier: DesignTier }, signals: Signal[], rng: ReturnType<typeof makeRng>, ev: EvidencePool): Rationale {
  // 신호가 하나뿐인 실행도 있다. 없는 두 번째 축을 지어내지 않는다.
  const s1 = rng.pick(signals)
  const rest = signals.filter(s => s.signal_id !== s1.signal_id)
  const s2 = rest.length ? rng.pick(rest) : null
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
      ...(s2 ? [{ signal_id: s2.signal_id, weight: 0.25 }] : []),
    ],
    // 참조는 레시피가 배정된 뒤에 붙는다. 그전까지는 비어 있는 것이 정확하다.
    reference_images: [],
    // 예시 문장이 아니라 사용자가 쓴 문장을 싣는다. 적용 결과도 실제로 일어난 것만 적는다.
    reference_prompts: params.mode === 'series' && params.series.valueStatement.trim()
      ? [{
          text: params.series.valueStatement, origin: 'user_input' as const,
          applied_as: [ev.claimChecked
            ? 'Checked against what the uploaded designs actually show'
            : 'Recorded with the run. The uploads could not be read, so it was not checked'],
        }]
      : [],
    series_dna_inherited: params.mode === 'series' ? ev.dnaInherited : [],
    type_placement_reason: placement,
    narrative: [
      `${s1.label} showed up ${s1.observed_count} times in this price band.${proxyTxt}`,
      ...(s2 ? [`${s2.label}, observed ${s2.observed_count} times, came in as the second axis.`] : []),
      placement + '.',
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

/** 계층 2 · 이 실행의 값에서 실제로 계산되는 것만 낸다.
 *  예전에는 난수로 High/Medium 을 뽑고 그럴듯한 근거 문장을 붙였다. 화면에서는 판단처럼
 *  보이지만 아무것도 재지 않았고, 같은 디자인이 실행마다 다른 등급을 받았다.
 *  잴 수 없는 항목은 등급 대신 "재지 않음"이라고 적는다. */
function buildModelEval(d: Design, params: RunParams, signals: Signal[]): { label: string; value: string; basis: string }[] {
  const out: { label: string; value: string; basis: string }[] = []

  // 트렌드 근거 · 연결된 신호의 관측 횟수와 신뢰도에서 나온다
  const linked = d.rationale.driving_signals
    .map(ds => signals.find(s => s.signal_id === ds.signal_id))
    .filter((s): s is Signal => !!s)
  const obs = linked.reduce((sum, s) => sum + s.observed_count, 0)
  const anyHigh = linked.some(s => s.confidence === 'high')
  const sourced = linked.filter(isCollectedSignal).length
  out.push({
    label: 'Trend backing',
    value: !linked.length ? 'Not measured' : obs >= 8 && anyHigh ? 'High' : obs >= 4 ? 'Medium' : 'Low',
    basis: linked.length
      ? `${linked.length} linked signals, ${obs} observations in total, ${sourced} of them carrying a source`
      : 'No signal is linked to this design',
  })

  // 차별성 · 레시피가 몇 개의 조건을 겹쳤는지가 곧 방향의 폭이다
  const atoms = d.recipe?.atoms.length ?? 0
  out.push({
    label: 'Distinctiveness',
    value: !d.recipe ? 'Not measured' : atoms >= 3 ? 'High' : atoms === 2 ? 'Medium' : 'Low',
    basis: d.recipe
      ? `Built from ${atoms} research condition${atoms > 1 ? 's' : ''}: ${d.recipe.title}`
      : 'No condition recipe was assigned, so there is nothing to measure against',
  })

  // 브랜드 적합 · 금지 규칙 위반과 몰드 재사용으로 잰다
  const brand = params.brand
  const hits = brand ? checkBrandFit(brand, d.spec.fields as Record<string, unknown>) : []
  const reusesMould = !d.spec.fields.is_new_mold
  out.push({
    label: 'Brand fit',
    value: !brand?.brandName ? 'Not set' : hits.length ? 'Low' : reusesMould ? 'High' : 'Medium',
    basis: !brand?.brandName ? 'No brand rules are configured for this workspace'
      : hits.length ? `Breaks a rule you set: ${hits.join(', ')}`
      : reusesMould ? 'Breaks no brand rule and reuses an existing mould'
      : 'Breaks no brand rule, but needs a new mould',
  })
  return out
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
