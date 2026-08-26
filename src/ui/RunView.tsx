// ── 분석 탭 · 실행 진행 + 결과 (에이전트 공통) ───────────────────────
// 스펙 순서대로 쌓인다: 조사 요약 허브 → 크롤/런웨이/키워드 덱 → 편집샵/확산/세트
// → 트렌드 리포트 → 레퍼런스 → 프롬프트-디자인 쌍(수정·재생성).
// 실행이 끝나기 전에도 도착한 산출물부터 보인다.
import { t, tf } from '../core/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DesignPair, PromptDirection, RunState, Stage } from '../core/types'
import {
  BASIS_LABEL, GENDER_LABEL, ITEM_LABEL, MODE_LABEL, STAGE_LABELS, VARIANT_LABEL,
  estimateMinutes, estimateStages, regionsLabel,
  agesOf,
} from '../core/types'
import { detectRuntime } from '../core/runtime'
import { shotUrl } from '../core/agents'
import { DeckViewer } from './DeckViewer'
import { downloadDeck, printDeck } from '../core/deck'
import { downloadAllPptx } from '../core/deckPptx'
import {
  adoptionDeckHtml, competitorDeckHtml, keywordDeckHtml, runwayDeckHtml, shopsDeckHtml, trendDeckHtml,
} from '../core/agentDeck'
import { Collapse, Tag } from './bits'

/** 원격/구운 사진 · 없으면 자리 표시 */
function Shot({ remote, page, shot, h = 140, alt = '' }: { remote?: string; page?: string; shot?: string; h?: number; alt?: string }) {
  const src = shot || shotUrl(remote, page)
  if (!src) return <div className="ph" style={{ height: h }}>{t('No photo')}</div>
  return <img src={src} alt={alt} style={{ width: '100%', height: h, objectFit: 'cover', borderRadius: 8 }}
    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
}

/** 실데이터 막대그래프 · 이미지 생성이 아니라 수집 숫자를 그대로 그린다 */
function Bars({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map(r => r.n))
  return (
    <div className="bars">
      {rows.map(r => (
        <div className="bar-row" key={r.label}>
          <span className="bar-l" title={r.label}>{r.label}</span>
          <span className="bar-track"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
          <b>{r.n}</b>
        </div>
      ))}
    </div>
  )
}

export default function RunView({ st, progress, onOpenBoard, onPairUpdate, onScoreAll }: {
  st: RunState
  progress: Record<string, number>
  onOpenBoard: () => void
  /** 프롬프트 수정·재생성 결과를 상태에 반영한다 */
  onPairUpdate: (pair: DesignPair) => void
  /** 전체 사전 평가 (텍스트 기준) */
  onScoreAll: () => Promise<void>
}) {
  const [showLog, setShowLog] = useState(false)
  const [pptBusy, setPptBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const stages: Stage[] = ['S1', 'S2', 'S3', 'S4', 'S5']
  const labels = STAGE_LABELS[st.params.mode]

  // ── 시간을 범위로 보여 준다 · 예상은 estimateStages 한 곳에서만 계산한다 ──
  // 깊은 조사(gpt-5-pro)는 서버 스위치라 여기서는 상태만 읽는다.
  const [deepOn, setDeepOn] = useState(false)
  useEffect(() => { detectRuntime().then(rt => setDeepOn(rt.kind === 'live' && rt.deepResearch)) }, [])
  const stageEst = useMemo(() => estimateStages(st.params, deepOn), [st.params, deepOn])
  const totalEst = useMemo(() => estimateMinutes(st.params, deepOn), [st.params, deepOn])
  // 경과 · 첫 로그 시각부터. 30초마다 갱신하면 충분하다.
  const startedAt = st.logs[0]?.t
  const [nowTick, setNowTick] = useState(Date.now())
  useEffect(() => {
    if (st.finished) return
    const iv = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(iv)
  }, [st.finished])
  const lastLogT = st.logs[st.logs.length - 1]?.t
  const elapsedMin = startedAt
    ? Math.max(0, Math.round(((st.finished ? (lastLogT ?? nowTick) : nowTick) - startedAt) / 60_000))
    : 0
  // 각 단계의 실측 시작 시각 · 그 단계 첫 로그
  const stageStartT = useMemo(() => {
    const out: Partial<Record<Stage, number>> = {}
    for (const l of st.logs) if (out[l.stage] == null) out[l.stage] = l.t
    return out
  }, [st.logs])
  /** 단계 시간 표기 · 완료면 실측, 진행·대기면 예상 범위 */
  const stageTime = (sg: Stage): string => {
    const status = st.stageStatus[sg]
    const est = stageEst[sg]
    if (status === 'done') {
      const t0 = stageStartT[sg]
      // 다음 단계의 시작(또는 마지막 로그)까지를 실측으로 본다
      const after = stages.slice(stages.indexOf(sg) + 1).map(x => stageStartT[x]).find(x => x != null)
      if (t0 != null) {
        const mins = Math.max(1, Math.round(((after ?? lastLogT ?? t0) - t0) / 60_000))
        return tf('{n} min', { n: mins })
      }
      return ''
    }
    return `${Math.round(est.min)}~${Math.round(est.max)}${t('min')}`
  }

  // 덱은 데이터가 바뀔 때만 다시 만든다
  const compDeck = useMemo(() => st.crawl?.length ? competitorDeckHtml(st) : null, [st.crawl])
  const shopDeck = useMemo(() => st.shops?.length ? shopsDeckHtml(st) : null, [st.shops])
  const rwDeck = useMemo(() => st.runway ? runwayDeckHtml(st) : null, [st.runway])
  const adDeck = useMemo(() => st.adoption?.length ? adoptionDeckHtml(st) : null, [st.adoption])
  const trDeck = useMemo(() => st.trendReport ? trendDeckHtml(st) : null, [st.trendReport])
  const kwDeck = useMemo(() => st.insight ? keywordDeckHtml(st) : null, [st.insight])

  const p = st.params
  const pairsDone = st.pairs.filter(x => x.versions.length > 0).length
  const pairsFail = st.pairs.filter(x => x.error).length

  // ── 조사 요약 허브 데이터 · 전부 실측 숫자 ─────────────────────────
  const hubRows = useMemo(() => {
    if (p.mode === 'competitor') return [
      ...(st.crawl ?? []).map(c => ({ label: c.brand, n: c.items.length })),
      ...(st.shops ?? []).map(s => ({ label: `@ ${s.name}`, n: s.items.length })),
    ]
    if (p.mode === 'fashion') {
      const bySeason = new Map<string, number>()
      for (const l of st.runway?.looks ?? []) bySeason.set(l.season, (bySeason.get(l.season) ?? 0) + 1)
      return [
        ...[...bySeason.entries()].map(([label, n]) => ({ label, n })),
        ...Object.entries((st.adoption ?? []).reduce<Record<string, number>>((a, s) => { a[s.basis] = (a[s.basis] ?? 0) + 1; return a }, {}))
          .map(([b, n]) => ({ label: t(BASIS_LABEL[b as keyof typeof BASIS_LABEL]), n })),
      ]
    }
    return (st.sets ?? []).map(s => ({ label: s.name, n: Object.keys(s.art ?? {}).length + (s.lineup ? 1 : 0) }))
  }, [st, p.mode])

  const deckBlock = (deck: { title: string; html: string } | null, id: string) => deck && (
    <section className="rep-sect" id={id}>
      <div className="rep-head"><h2>{deck.title}</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => printDeck(deck.title, deck.html)}>{t('Print / PDF')}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => downloadDeck(`${id}.html`, deck.title, deck.html)}>{t('Download')}</button>
      </div>
      <DeckViewer title={deck.title} html={deck.html}
        onPrint={() => printDeck(deck.title, deck.html)}
        onSave={() => downloadDeck(`${id}.html`, deck.title, deck.html)} />
    </section>
  )

  return (
    <div className="run run-single">
      <div className="run-center">
        {/* ── 진행 헤더 ─────────────────────────────────────────── */}
        <div className="stagebar">
          {/* 원 아이콘 없이 흐름으로 · 단계 이름과 (실측/예상) 시간이 › 로 이어진다 */}
          {stages.map((s, i) => {
            const status = st.stageStatus[s]
            return (
              <span key={s} className={`flow-step ${status}`}>
                <span className="fs-name">{t(labels[s])}</span>
                <b className="fs-time">{stageTime(s)}</b>
                {status === 'running' && progress[s] != null && <em>{progress[s]}%</em>}
                {i < stages.length - 1 && <i className="fs-sep" aria-hidden="true">›</i>}
              </span>
            )
          })}
          <span style={{ marginLeft: 'auto' }} className="hint">
            {st.searches > 0 && `${st.searches} ${t('web searches')} · `}
            {pairsDone}/{st.pairs.length || '–'} {t('designs')}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={pptBusy}
            onClick={async () => { setPptBusy(true); try { await downloadAllPptx(st) } finally { setPptBusy(false) } }}>
            {pptBusy ? t('Making PPT…') : t('Download PPT')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowLog(v => !v)}>
            {showLog ? t('Hide log') : t('Log')}
          </button>
          {st.finished && <button className="btn btn-primary btn-sm" onClick={onOpenBoard}>{t('Open the board')}</button>}
        </div>
        {/* ── 시간 밴드 · 경과와 예상 "범위"를 함께 보여 준다 ─────────
            느린 대신 자세한 실행(깊은 조사)일수록 이 줄이 중요하다 —
            지금 어디쯤인지, 원래 얼마나 걸리는 일인지 숨기지 않는다. */}
        {startedAt != null && (
          <div className="timeband">
            {st.finished ? (
              <span className="tb-main">{tf('Finished in {n} min', { n: elapsedMin })}
                <em>{tf('(expected {a}~{b} min)', { a: totalEst.min, b: totalEst.max })}</em></span>
            ) : (
              <span className="tb-main">{tf('{n} min elapsed', { n: elapsedMin })}
                <em>{tf('expected {a}~{b} min in total', { a: totalEst.min, b: totalEst.max })}</em>
                {deepOn && <i className="tb-deep">{t('deep research on')}</i>}</span>
            )}
            <span className="tb-track" aria-hidden="true">
              {/* 경과를 점으로 · 예상 범위는 글에만 남긴다(띠 박스는 지시로 제거) ·
                  max 의 1.25배를 눈금 끝으로 잡아 범위를 지나친 경과도 그대로 보이게 한다 */}
              <b className="tb-now" style={{ left: `${Math.min(100, (elapsedMin / (totalEst.max * 1.25)) * 100)}%` }} />
            </span>
            {!st.finished && elapsedMin > totalEst.max && (
              <span className="tb-over">{t('Past the expected range. Deep research and busy sources can take longer, and the run is still moving.')}</span>
            )}
          </div>
        )}
        {st.failedNote && <div className="notice warn">{t('The run stopped')} · {st.failedNote}</div>}
        {showLog && (
          <div className="log inline" ref={logRef}>
            {st.logs.map((l, i) => (
              <div className="ln" key={i}><span className="st">{l.stage}</span><span className="tx">{l.text}</span></div>
            ))}
          </div>
        )}

        {/* ── 1 · 조사 요약 허브 ─────────────────────────────────── */}
        <section className="rep-sect" id="sec-hub">
          <div className="rep-head"><h2>{t('Research summary')}</h2></div>
          <div className="hub">
            <div className="hub-facts">
              <div><b>{t(MODE_LABEL[p.mode])}</b><span>{t('Agent')}</span></div>
              <div><b>{regionsLabel(p)}</b><span>{t('Regions')}</span></div>
              <div><b>{agesOf(p.target).join(', ')} · {t(GENDER_LABEL[p.target.gender])}</b><span>{t('Target')}</span></div>
              <div><b>{p.mode === 'collection' ? p.items.map(i => t(ITEM_LABEL[i])).join(', ') : t(ITEM_LABEL[p.itemType])}</b><span>{p.mode === 'collection' ? t('Items') : t('Item')}</span></div>
              <div><b>{pairsDone}{pairsFail ? ` (+${pairsFail} ${t('failed')})` : ''}</b><span>{t('Designs generated')}</span></div>
              {p.mode === 'competitor' && <div><b>{(st.crawl ?? []).reduce((n, c) => n + c.items.length, 0)} / {(st.shops ?? []).reduce((n, s) => n + s.items.length, 0)}</b><span>{t('Competitor / shop items')}</span></div>}
              {p.mode === 'fashion' && <div><b>{st.runway?.looks.length ?? 0} / {st.adoption?.length ?? 0}</b><span>{t('Looks / adoption signals')}</span></div>}
              {p.mode === 'collection' && <div><b>{st.sets?.length ?? 0}</b><span>{t('Sets')}</span></div>}
            </div>
            {hubRows.length > 0 && <Bars rows={hubRows} />}
            <p className="hint">{t('These numbers are counted from what was actually collected. None of this is generated art.')}</p>
          </div>
        </section>

        {/* ── 2·3·4 · 덱들 (모드별) ──────────────────────────────── */}
        {p.mode === 'competitor' && deckBlock(compDeck, 'deck-competitor')}
        {p.mode === 'competitor' && deckBlock(shopDeck, 'deck-shops')}
        {p.mode === 'fashion' && deckBlock(rwDeck, 'deck-runway')}
        {p.mode === 'fashion' && deckBlock(adDeck, 'deck-adoption')}
        {p.mode === 'collection' && deckBlock(kwDeck, 'deck-keyword')}
        {p.mode !== 'collection' && deckBlock(trDeck, 'deck-trend')}

        {/* ── 컬렉션 · 세트 콘셉트 ───────────────────────────────── */}
        {p.mode === 'collection' && (st.sets?.length ?? 0) > 0 && (
          <section className="rep-sect" id="sec-sets">
            <div className="rep-head"><h2>{t('Set concepts')}</h2></div>
            <div className="setgrid">
              {st.sets!.map(s => (
                <article className="setcard" key={s.name}>
                  <header><b>{s.name}</b><Tag>{s.kind}</Tag></header>
                  <p className="sc-concept">{s.concept}</p>
                  {s.lineup && <img className="sc-lineup" src={s.lineup.url} alt="" />}
                  <div className="sc-artrow">
                    {(['form', 'motion', 'material', 'atmosphere'] as const).map(k =>
                      s.art?.[k] ? <img key={k} src={s.art[k]!.url} alt={k} title={k} /> : null)}
                  </div>
                  <div className="sc-meta">
                    <span>{s.metal}</span><span>{s.surface}</span><span>{s.stones}</span>
                  </div>
                  <Collapse title={t('Design DNA')} summary={tf('{n} shared rules', { n: s.design_dna.length })}>
                    <ul className="sc-dna">{s.design_dna.map((d, i) => <li key={i}>{d}</li>)}</ul>
                    <p className="hint">{t('Avoid')}: {s.avoid.join(', ')}</p>
                  </Collapse>
                  <p className="sc-story">{s.story}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ── 5 · 레퍼런스 (에이전트 1·2) ─────────────────────────── */}
        {p.mode !== 'collection' && st.references.length > 0 && (
          <section className="rep-sect" id="sec-refs">
            <div className="rep-head"><h2>{t('Selected references')}</h2>
              <p>{t('Ten slots, each picked by a different trend combination rather than one blended score.')}</p>
            </div>
            <div className="refgrid">
              {st.references.map(r => (
                <article className="refcard" key={r.slot}>
                  <span className="rf-slot">#{r.slot}</span>
                  <Shot remote={r.imageUrl} page={r.sourceUrl} shot={r.shot} h={150} alt={r.title} />
                  <b>{r.title}</b>
                  <span className="rf-sub">{r.subtitle}{r.price ? ` · ${r.price.toLocaleString()} ${r.currency ?? ''}` : ''}</span>
                  <div className="rf-combo">{r.trendCombo.map(c => <Tag key={c}>{c}</Tag>)}</div>
                  <p className="rf-why">{r.reason}</p>
                  {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="rf-src">{t('Source')}</a>}
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ── 6 · 프롬프트-디자인 쌍 ─────────────────────────────── */}
        {st.pairs.length > 0 && (
          <section className="rep-sect" id="sec-pairs">
            <div className="rep-head"><h2>{t('Prompt and design pairs')}</h2>
              <button className="btn btn-ghost btn-sm" onClick={onScoreAll}>{t('Score all (text pre-check)')}</button>
            </div>
            <p className="hint">{t('Edit a prompt and regenerate. Only that design gets a new version, everything else stays.')}</p>
            <div className="pairlist">
              {[...st.pairs].sort((a, b) => a.id.localeCompare(b.id)).map(pair => (
                <PairRow key={pair.id} st={st} pair={pair} onPairUpdate={onPairUpdate} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

/** 접힘 요약은 펼쳤을 때 실제로 보이는 축만 센다 · Complement 는 패션 모드에만 채워진다 */
function axisSummary(d: PromptDirection): string {
  return ['Preserve', 'Transform', 'Replace', 'Combine',
    ...(d.complement ? ['Complement'] : []), 'Avoid'].join(' · ')
}

// ── 쌍 한 줄 · 프롬프트 편집과 개별 재생성 ───────────────────────────
function PairRow({ st, pair, onPairUpdate }: {
  st: RunState; pair: DesignPair; onPairUpdate: (p: DesignPair) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(pair.prompt)
  const [busy, setBusy] = useState(false)
  const [same, setSame] = useState(false)                     // 프롬프트가 그대로라 그림도 그대로
  const [verIdx, setVerIdx] = useState<number | null>(null)   // null = 최신
  const cur = verIdx == null ? pair.versions[pair.versions.length - 1] : pair.versions[verIdx]
  const ref = st.references.find(r => r.slot === pair.refSlot)

  const regen = async () => {
    setBusy(true)
    setSame(false)
    try {
      const { regeneratePair } = await import('../core/pipeline')
      const before = pair.versions.length
      const next = await regeneratePair(st.params, pair, draft)
      // 프롬프트를 안 고치면 캐시가 같은 그림을 준다 · 버전이 안 늘었으면 그렇게 말해 준다
      if (next.versions.length === before) setSame(true)
      onPairUpdate(next)
      setEditing(false); setVerIdx(null)
    } catch (e) {
      onPairUpdate({ ...pair, error: String((e as Error).message).slice(0, 140) })
    } finally { setBusy(false) }
  }

  return (
    <article className={`pairrow ${pair.error ? 'err' : ''}`}>
      <div className="pr-ref">
        {st.params.mode === 'collection'
          ? (st.sets?.find(s => s.name === pair.setName)?.lineup
            ? <img src={st.sets!.find(s => s.name === pair.setName)!.lineup!.url} alt="" />
            : <div className="ph" style={{ height: 110 }}>{pair.setName}</div>)
          : <Shot remote={ref?.imageUrl} page={ref?.sourceUrl} shot={ref?.shot} h={110} alt={ref?.title ?? ''} />}
        <span className="pr-reftag">
          {st.params.mode === 'collection' ? pair.setName : `${t('Ref')} #${pair.refSlot}`}
        </span>
      </div>
      <div className="pr-mid">
        <div className="pr-head">
          <b>{pair.id}</b> · {pair.title}
          <Tag>{st.params.mode === 'collection' ? t(ITEM_LABEL[pair.item ?? '']) : t(VARIANT_LABEL[pair.variant])}</Tag>
          {pair.score != null && <Tag kind={pair.score >= 70 ? 'ok' : 'warn'}>{pair.score}</Tag>}
        </div>
        {pair.direction && (
          <Collapse title={t('Design direction')} summary={axisSummary(pair.direction)}>
            <dl className="pr-dir">
              <dt>Preserve</dt><dd>{pair.direction.preserve}</dd>
              <dt>Transform</dt><dd>{pair.direction.transform}</dd>
              <dt>Replace</dt><dd>{pair.direction.replace}</dd>
              <dt>Combine</dt><dd>{pair.direction.combine}</dd>
              {pair.direction.complement && <><dt>Complement</dt><dd>{pair.direction.complement}</dd></>}
              <dt>Avoid</dt><dd>{pair.direction.avoid}</dd>
            </dl>
          </Collapse>
        )}
        {editing ? (
          <textarea className="input pr-edit" rows={7} value={draft} onChange={e => setDraft(e.target.value)} />
        ) : (
          <pre className="pr-prompt">{pair.prompt || t('No prompt. This one failed before the prompt stage.')}</pre>
        )}
        {pair.feature && <p className="hint">{pair.feature}</p>}
        {pair.scoreNote && <p className="hint">{pair.scoreNote}</p>}
        {pair.error && <p className="hint" style={{ color: 'var(--warn)' }}>{pair.error}</p>}
        {same && <p className="hint">{t('The prompt did not change, so the same image came back. No new version was added.')}</p>}
        <div className="pr-actions">
          {editing ? (<>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={regen}>
              {busy ? t('Generating…') : t('Regenerate this design')}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy}
              onClick={() => { setEditing(false); setDraft(pair.prompt) }}>{t('Cancel')}</button>
          </>) : (<>
            <button className="btn btn-ghost btn-sm" onClick={() => { setDraft(pair.prompt); setEditing(true) }}>
              {t('Edit prompt')}</button>
            {pair.versions.length > 1 && (
              <span className="pr-vers">
                {pair.versions.map((v, i) => (
                  <button key={v.hash} className={`vchip ${((verIdx == null && i === pair.versions.length - 1) || verIdx === i) ? 'on' : ''}`}
                    onClick={() => setVerIdx(i === pair.versions.length - 1 ? null : i)}>v{i + 1}</button>
                ))}
              </span>
            )}
          </>)}
        </div>
      </div>
      <div className="pr-out">
        {cur
          ? <img src={cur.url} alt={pair.id} />
          : <div className="ph" style={{ height: 180 }}>{busy || !st.finished ? t('Generating…') : t('No image')}</div>}
      </div>
    </article>
  )
}
