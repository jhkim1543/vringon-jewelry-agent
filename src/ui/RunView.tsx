// ── Run 실행 화면 · 핵심만 노출, 상세는 접힘 (진행 · 부분 결과 · 게이트) ──
import { t } from '../core/i18n'
import { useEffect, useRef, useState } from 'react'
import type { RunState } from '../core/types'
import { MODE_LABEL, CAT_LABEL, TIER_LABEL, TYPE_LABEL } from '../core/types'
import RunReport from './RunReport'
import { DesignCard } from './Card'
import { ModelViewer } from './ModelViewer'
import { Collapse, Tag } from './bits'
import { shotUrl } from '../core/research'
import type { TrendReport } from '../core/research'
import { openTrendReportPdf } from '../core/reportPdf'
import { openDossierPdf } from '../core/dossierPdf'
import type { SeasonDossier } from '../core/research'
import { GRADE_LABEL, SOURCE_LABEL, metricText } from '../core/research'

const STAGE_META: { key: 'S1' | 'S2' | 'S3' | 'S4' | 'S5'; t: string; d: string }[] = [
  { key: 'S1', t: 'Research', d: 'Signals and directions' },
  { key: 'S2', t: 'Sketch', d: 'Specs, rules, rationale' },
  { key: 'S3', t: 'Design', d: 'Renders and views' },
  { key: 'S4', t: 'Worn', d: 'Metrics and top picks' },
  { key: 'S5', t: 'Package', d: 'Board and notes' },
]

export default function RunView({ st, progress, gated, onResume, onGateVerdict, onOpenBoard, onResolveDna }: {
  st: RunState
  progress: Record<string, number>
  gated: boolean
  onResume: () => void
  onGateVerdict: (id: string, v: 'approve' | 'reject', tags: string[]) => void
  onOpenBoard: () => void
  onResolveDna: (choice: string) => void
}) {
  const [showLog, setShowLog] = useState(false)
  // 디자인 상세 모달 · 캠페인 컷과 3D 를 연다
  const [detail, setDetail] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (showLog) logRef.current?.scrollTo({ top: 1e9 }) }, [st.logs.length, showLog])

  const s3done = st.stageStatus.S3 === 'done'
  const s4done = st.stageStatus.S4 === 'done'
  const approvedCount = st.designs.filter(d => d.verdict === 'approve').length
  const rejectedCount = st.designs.filter(d => d.verdict === 'reject').length
  const lastCheckpoint = st.checkpoints[st.checkpoints.length - 1]

  // 접힘 패널 요약 문구 · 실수집이면 근거 강도 기준으로 요약
  const inBand = st.competitors.filter(c => c.in_band)
  const isLiveResearch = st.competitors.some(c => (c.source_urls?.length ?? 0) > 0)
  const strongCnt = st.competitors.filter(c => c.evidence_strength === 'strong').length
  const compSummary = st.competitors.length
    ? isLiveResearch
      ? `${st.competitors.length} products · ${inBand.length} in band · ${strongCnt} strong`
      : `${st.competitors.length} products (sample)`
    : ''
  const rising = st.signals.filter(s => s.direction === 'rising').length
  const topSig = [...st.signals].sort((a, b) => b.observed_count - a.observed_count)[0]
  const sigSummary = st.signals.length ? `${st.signals.length} signals · ${rising} rising` : ''

  // 아래 세 블록은 리포트 섹션 안으로 들어간다 (예전에는 화면 맨 밑에 따로 있었다)
  const competitorDetail = st.competitors.length > 0 && (
          <Collapse title={t('Collected products')} summary={compSummary}>
            <div style={{ padding: '8px 14px 0' }}>
              {isLiveResearch ? (
                <div className="notice info" style={{ fontSize: 12 }}>
                  Collected by searching these brands on the web. Only facts found in sources are listed. No sales score until there are repeat observations.
                </div>
              ) : (
                <div className="notice warn" style={{ fontSize: 12 }}>
                  Fixed sample (collection fell back). Do not treat as real numbers.
                </div>
              )}
            </div>
            <div className="compgrid">
              {st.competitors.map(c => (
                <div className={`compcard ${c.in_band ? '' : 'out'}`} key={c.product_id}>
                  <div className="cc-shot">
                    {c.image_urls?.length
                      ? <img src={shotUrl(c.image_urls[0])} alt={c.name}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                      : <span className="cc-noshot">No photo</span>}
                  </div>
                  <div className="cc-main">
                    <div className="cc-head">
                      <b>{c.brand}</b> {c.name}
                      {!c.in_band && <Tag kind="warn">Out of band</Tag>}
                    </div>
                    <div className="cc-meta">
                      {c.price_krw > 0 ? `₩${(c.price_krw / 10000).toFixed(1)}0,000` : 'Price unknown'}
                      {c.rank_note && <> · <span className="cc-rank">{c.rank_note}</span></>}
                      {c.evidence_strength && <> · {c.evidence_strength}</>}
                    </div>
                    {c.proxy_signals[0] && <div className="cc-ev">{c.proxy_signals[0]}</div>}
                    {c.design_traits?.length ? (
                      <div className="cc-traits">
                        {c.design_traits.slice(0, 3).map((t, i) => <Tag key={i}>{t}</Tag>)}
                      </div>
                    ) : null}
                    {(c.praise_points?.length || c.complaint_points?.length) ? (
                      <div className="cc-review">
                        {c.user_sentiment && c.user_sentiment !== 'unknown' && (
                          <Tag kind={c.user_sentiment === 'positive' ? 'ok' : c.user_sentiment === 'negative' ? 'danger' : 'warn'}>
                            {c.user_sentiment === 'positive' ? 'liked' : c.user_sentiment === 'negative' ? 'disliked' : 'mixed'}
                          </Tag>
                        )}
                        {c.praise_points?.[0] && <div className="cc-good">+ {c.praise_points[0]}</div>}
                        {c.complaint_points?.[0] && <div className="cc-bad">− {c.complaint_points[0]}</div>}
                      </div>
                    ) : null}
                    <div className="cc-links">
                      {c.product_url && <a href={c.product_url} target="_blank" rel="noreferrer">{t('Product')}</a>}
                      {(c.source_urls ?? []).slice(0, 2).map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer">Source {i + 1}</a>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Collapse>
        )
  // 아래 세 블록은 리포트 섹션 안으로 들어간다 (예전에는 화면 맨 밑에 따로 있었다)
  const dossierDetail = (st.dossier || st.dossierPending) && (
          <Collapse
            title={t('Forecast evidence')}
            summary={st.dossier
              ? `${(st.dossier as SeasonDossier).macrotrends?.length ?? 0} macrotrends · ${(st.dossier as SeasonDossier).sources?.length ?? 0} sources`
              : 'Building'}
            defaultOpen={!!st.dossier}>
            {st.dossierPending && !st.dossier ? (
              <div style={{ padding: '14px 16px' }} className="hint">
                Mapping the macrotrends first, then filling each one with palettes, materials, details and key items.
              </div>
            ) : st.dossier ? (() => {
              const d = st.dossier as SeasonDossier
              const pct = metricText
              return (
                <div className="dossier">
                  <div className="ds-head">
                    <div>
                      <h4>{d.season} · {d.season_title}</h4>
                      {d.powershift && <div className="ds-power">Powershift: {d.powershift}</div>}
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => openDossierPdf(st)}>{t('Dossier PDF')}</button>
                  </div>
                  {(d.macrotrends ?? []).map((m, i) => (
                    <div className="ds-macro" key={m.name + i}>
                      <div className="ds-m-h">
                        <span className="ds-num">{i + 1}</span>
                        <b>{m.name}</b>
                        <Tag kind="accent">{GRADE_LABEL[m.grade] ?? m.grade}</Tag>
                      </div>
                      <div className="ds-state">{m.statement}</div>
                      <div className="chiplist">
                        {(m.sub_trends ?? []).map(t => <span className="chip-in" key={t}>{t}</span>)}
                      </div>
                      <div className="ds-metrics">
                        {(m.drivers ?? []).map((x, k) => (
                          <span key={x.label + k} className="ds-met">
                            <b>{pct(x)}</b> {x.label}
                            <span className="hint"> · {SOURCE_LABEL[x.source_kind] ?? x.source_kind}</span>
                          </span>
                        ))}
                      </div>
                      {(m.palette ?? []).length > 0 && (
                        <div className="ds-pal">
                          {m.palette.map(c => (
                            <span className="ds-sw" key={c.hex + c.name} title={`${c.name} ${c.pantone_tcx}`}>
                              <i style={{ background: c.hex }} />{c.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {(m.materials ?? []).length > 0 && (
                        <div className="ds-metrics">
                          {m.materials.map((x, k) => (
                            <span key={x.label + k} className="ds-met sm">
                              <b>{pct(x)}</b> {x.label}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="ds-items">
                        {(m.key_items ?? []).map((k, j) => (
                          <div className="ds-item" key={k.name + j}>
                            <div className="ds-i-h">
                              <b>{k.name}</b>
                              <span className="ds-i-p">{k.metric ? pct(k.metric) : '—'}</span>
                              <span className="hint">{k.segment}</span>
                            </div>
                            <div className="hint">{k.silhouette_spec}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(d.yearly_context ?? []).length > 0 && (
                    <div className="ds-years">
                      <div className="ds-sub">{t('How the last few seasons moved')}</div>
                      {d.yearly_context.map((y, i) => (
                        <div className="ds-year" key={y.season + i}>
                          <b>{y.season}</b>
                          <span>{y.headline}
                            {y.source_url && <a className="ds-link" href={y.source_url} target="_blank" rel="noreferrer">{t('source')}</a>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })() : null}
          </Collapse>
        )
  // 아래 세 블록은 리포트 섹션 안으로 들어간다 (예전에는 화면 맨 밑에 따로 있었다)
  const reportDetail = (st.trendReport || st.reportPending) && (
          <Collapse
            title={t('Report text')}
            summary={st.trendReport
              ? `${(st.trendReport as TrendReport).design_implications?.length ?? 0} design implications`
              : 'Writing'}
            defaultOpen={!!st.trendReport}>
            {st.reportPending && !st.trendReport ? (
              <div style={{ padding: '14px 16px' }} className="hint">
                Breaking it into sub-questions and pulling them together. It lands here when done.
              </div>
            ) : st.trendReport ? (() => {
              const rep = st.trendReport as TrendReport
              return (
                <div className="treport">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <h4 style={{ flex: 1, minWidth: 0 }}>{rep.title}</h4>
                    {/* 리포트만 따로 뽑아 갈 수 있어야 한다 */}
                    <button className="btn btn-ghost btn-sm" onClick={() => openTrendReportPdf(st)}>{t('Report PDF')}</button>
                  </div>
                  <div className="tr-exec">{rep.executive_view}</div>
                  {rep.design_implications?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 700, marginBottom: 4 }}>
                        What to change in the design
                      </div>
                      {rep.design_implications.map((d, i) => (
                        <div className="tr-imp" key={i}>
                          <span className="tr-area">{d.area}</span>
                          <span>
                            {d.guidance}
                            <div className="tr-basis">From: {d.basis}</div>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="tr-body">{rep.body_markdown}</div>
                  {rep.open_questions?.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 700, marginBottom: 4 }}>
                        Still unverified
                      </div>
                      {rep.open_questions.map((q, i) => <div key={i}>· {q}</div>)}
                    </div>
                  )}
                </div>
              )
            })() : null}
          </Collapse>
        )

  // 분석이 끝나면 왼쪽은 진행표시가 아니라 목차가 된다.
  // 오른쪽 리포트의 섹션 id 로 스크롤한다.
  const TOC: { id: string; label: string; on: boolean }[] = [
    { id: 'sec-report', label: 'Trend report', on: !!st.trendReport },
    { id: 'sec-macros', label: 'Key macro trends', on: !!(st.dossier as { macrotrends?: unknown[] } | null)?.macrotrends?.length },
    { id: 'sec-designs', label: 'Top trending designs', on: st.designs.length > 0 },
    { id: 'sec-comp', label: 'Competitive landscape', on: st.competitors.length > 0 },
    { id: 'sec-season', label: 'Season report', on: !!st.dossier },
    { id: 'sec-impl', label: 'Design implications', on: !!st.dossier || st.signals.length > 0 },
  ].filter(x => x.on)
  // scrollIntoView 의 smooth 는 탭이 백그라운드면 멈춘다. 컨테이너를 직접 굴린다.
  const jump = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const box = el.closest('.run-center') as HTMLElement | null
    if (!box) { el.scrollIntoView(); return }
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12
    box.scrollTo({ top, behavior: 'smooth' })
    // smooth 가 무시되는 환경 대비 · 한 프레임 뒤에 위치를 못 잡았으면 즉시 이동
    setTimeout(() => { if (Math.abs(box.scrollTop - top) > 400) box.scrollTop = top }, 350)
  }

  return (
    <div className="run">
      {/* 좌: 단계 네비 */}
      <div className="run-left">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{MODE_LABEL[st.params.mode]}</div>
          <div className="hint">{TYPE_LABEL[st.params.itemType]} · {st.params.sketchCount} sketches · through {st.params.endStage}</div>
        </div>
        {st.finished && TOC.length > 0 ? (
          <nav className="toc">
            <div className="toc-h">{t('Contents')}</div>
            {TOC.map(x => (
              <button key={x.id} className="toc-i" onClick={() => jump(x.id)}>{t(x.label)}</button>
            ))}
          </nav>
        ) : (
        <div className="stageline">
          {STAGE_META.map(s => {
            const status = st.stageStatus[s.key]
            return (
              <div key={s.key} className={`stage-item ${status}`}>
                <div className="dot" />
                <div style={{ flex: 1 }}>
                  <div className="t">{t(s.t)}</div>
                  <div className="d">{t(s.d)}</div>
                  {status === 'running' && progress[s.key] != null && (
                    <div className="progressbar"><div style={{ width: `${progress[s.key]}%` }} /></div>
                  )}
                  {status === 'gated' && <Tag kind="warn">Waiting</Tag>}
                </div>
              </div>
            )
          })}
        </div>
        )}
        {lastCheckpoint && (
          <div className="hint" style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            💾 {lastCheckpoint}
          </div>
        )}
        {st.finished && (
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={onOpenBoard}>
            Open board
          </button>
        )}
      </div>

      {/* 중앙: 핵심 결과 */}
      <div className="run-center">
        {/* 리포트가 맨 위 · 무엇이 나왔는지부터 보이고, 근거는 아래 접힘 패널에 그대로 남는다 */}
        {(st.dossier || st.trendReport || st.designs.length > 0) && (
          <RunReport st={st} onOpenBoard={onOpenBoard}
            competitorDetail={competitorDetail} dossierDetail={dossierDetail} reportDetail={reportDetail} />
        )}
        {gated && (
          <div className="gatebar">
            <span style={{ fontWeight: 700 }}>{t('Review gate')}</span>
            <span className="hint">{t('Approve or reject on the cards. Reasons feed the next run.')}</span>
            <span style={{ marginLeft: 'auto' }} className="hint">{approvedCount} approved · {rejectedCount} rejected</span>
            <button className="btn btn-primary btn-sm" onClick={onResume}>{t('Continue')}</button>
          </div>
        )}

        {st.dnaConflict && !st.dnaConflict.resolved && (
          <div className="notice warn" style={{ marginBottom: 14, flexDirection: 'column' }}>
            <div>
              <b>Your description and what we observed disagree.</b> {st.dnaConflict.brandClaim} vs {st.dnaConflict.observed}. Pick which one leads.
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => onResolveDna('description')}>Follow the description</button>
              <button className="btn btn-ghost btn-sm" onClick={() => onResolveDna('archive')}>Follow the archive</button>
              <button className="btn btn-ghost btn-sm" onClick={() => onResolveDna('shift')}>Shift toward the description</button>
            </div>
          </div>
        )}
        {st.dnaConflict?.resolved && (
          <div className="notice info" style={{ marginBottom: 14 }}>
            Using <b>{st.dnaConflict.resolved}</b> as the reference. The choice is recorded in the rationale.
          </div>
        )}

        {/* S1 상세 · 접힘. 요약 한 줄이 곧 논리 구조의 각 단계 */}






        {st.seriesDna && (
          <Collapse title="Series DNA"
            summary={`${st.seriesDna.invariant.length} fixed (locked) · ${st.seriesDna.variable.length} variable · ${st.seriesDna.ambiguous.length} unclear`}
            defaultOpen={!st.dnaConflict?.resolved}>
            <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
              {st.seriesDna.invariant.map(e => (
                <div key={e.element}>
                  <Tag kind="accent">Locked</Tag> <b>{e.label}</b>
                  <span className="hint"> seen in {e.observed_in}/{e.of} · {e.confidence} · must_inherit</span>
                </div>
              ))}
              {st.seriesDna.variable.map(e => (
                <div key={e.element}><Tag>Variable</Tag> {e.label} <span className="hint">{e.variation_range?.join(' / ')}</span></div>
              ))}
              {st.seriesDna.ambiguous.map(e => (
                <div key={e.element}><Tag kind="warn">Unclear</Tag> {e.label} <span className="hint">seen as [{e.observed?.join(', ')}] · {e.note}</span></div>
              ))}
            </div>
          </Collapse>
        )}

        {st.reportBias && (
          <Collapse title="Source bias" summary={`${st.reportBias.publisher} · ${st.reportBias.perspective}`}>
            <div style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--text-2)' }}>
              {st.reportBias.notes.map((n, i) => <div key={i}>· {n}</div>)}
            </div>
          </Collapse>
        )}

        {st.signals.length > 0 && (
          <Collapse title={t('Signals')} summary={sigSummary}>
            <table className="mini">
              <thead><tr><th>Signal</th><th>Axis</th><th>Seen</th><th>{t('Trend')}</th><th>{st.params.mode === 'moodboard' ? 'Page' : 'Proxy'}</th><th>Source</th></tr></thead>
              <tbody>
                {st.signals.map(s => (
                  <tr key={s.signal_id}>
                    <td><b>{s.label}</b> <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{s.signal_id}</span>{s.oem_group && <Tag kind="warn">OEM group</Tag>}</td>
                    <td>{s.axis}</td>
                    <td>{s.observed_count}x</td>
                    <td>{s.direction === 'rising' ? 'Rising' : s.direction === 'stable' ? 'Holding' : 'Fading'}</td>
                    <td>{s.page_ref ?? (s.sales_proxy_score != null ? `${s.sales_proxy_score} (${s.proxy_confidence})` : 'not scored')}</td>
                    <td>{s.sources.slice(0, 2).map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-hi)', marginRight: 4 }}>[{i + 1}]</a>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Collapse>
        )}

        {/* 디렉션 · S1의 결론이므로 항상 노출 */}
        {st.directions.length > 0 && (
          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-h">Three directions</div>
            <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {st.directions.map(d => (
                <div key={d.id} style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 9, padding: '10px 12px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{d.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>{d.summary}</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>{d.signal_ids.map(s => <Tag key={s} kind="accent">{s}</Tag>)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {st.designs.length > 0 && (
          <section className="skflow" id="sec-flow">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '4px 0 10px' }}>
              <h3 style={{ fontSize: 15 }}>{t('From sketch to design')}</h3>
              <span className="hint">{st.designs.length} {t('sketches')} · {st.designs.filter(d => !d.rejected).length} {t('passed')}</span>
            </div>
            {st.designs.map(d => {
              const sketch = d.images.find(i => i.view === 'sketch')
              // 기준 렌더 + 트렌드 프롬프트 변주가 이 스케치에서 나온 디자인들이다
              const outs = d.images.filter(i =>
                (i.origin === 'generated' && i.view !== 'sketch') || i.view === 'design')
              // 이 스케치를 만든 근거 · 가중치 큰 신호부터
              const evidence = (d.rationale?.driving_signals ?? [])
                .slice()
                .sort((a, b) => b.weight - a.weight)
                .map(x => st.signals.find(g => g.signal_id === x.signal_id)?.label)
                .filter((x): x is string => !!x)
                .slice(0, 3)
              return (
                <article className={`skrow ${d.rejected ? 'rejected' : ''}`} key={d.spec.design_id}>
                  <div className="sk-src">
                    <span className="sk-shot">{sketch ? <img src={sketch.url} alt="" loading="lazy" /> : <span className="sk-none">{t('Diagram')}</span>}</span>
                    <b>{d.spec.design_id}</b>
                    <span className="sk-tier">{t(TIER_LABEL[d.spec.tier] ?? d.spec.tier)}</span>
                    {evidence.length > 0 && (
                      <span className="sk-ev">
                        <i>{t('Based on')}</i>
                        {evidence.map(e => <em key={e}>{e}</em>)}
                      </span>
                    )}
                    {d.rationale?.narrative?.[0] && <span className="sk-why">{d.rationale.narrative[0]}</span>}
                  </div>
                  <div className="sk-outs">
                    {outs.length === 0 && <span className="hint">{d.rejected ? t('Rule reject') : t('Rendering')}</span>}
                    {outs.map((im, i) => (
                      <button className="sk-out" key={im.hash + i} onClick={() => setDetail(d.spec.design_id)}
                        title={t('Open campaign shots and 3D')}>
                        <img src={im.url} alt="" loading="lazy" />
                        <span className="sk-prompt">{im.promptUsed
                          ? im.promptUsed.slice(0, 110) + (im.promptUsed.length > 110 ? '…' : '')
                          : t('Prompt not stored for this older run')}</span>
                      </button>
                    ))}
                  </div>
                </article>
              )
            })}
          </section>
        )}

        {/* 디자인 상세 · 캠페인 컷과 3D 는 여기 저장돼 있다 */}
        {detail && (() => {
          const d = st.designs.find(x => x.spec.design_id === detail)
          if (!d) return null
          const camp = d.images.filter(i => i.view === 'wear' || i.view === 'concept')
          return (
            <div className="dd-modal" onClick={() => setDetail(null)}>
              <div className="dd-box" onClick={e => e.stopPropagation()}>
                <div className="dd-head">
                  <b>{d.spec.design_id}</b>
                  <span className="hint">{t(TIER_LABEL[d.spec.tier] ?? d.spec.tier)}</span>
                  <button className="dv-x" onClick={() => setDetail(null)} aria-label={t('Close')}>✕</button>
                </div>
                <div className="dd-body">
                  <div className="dd-left">
                    <DesignCard d={d} signals={st.signals}
                      stagePassed={{ s3: true, s4: true }}
                      onVerdict={gated || st.finished ? onGateVerdict : undefined} />
                  </div>
                  <div className="dd-right">
                    {d.model && (
                      <>
                        <div className="dd-sub">{t('3D showroom')}</div>
                        <ModelViewer url={d.model.url} height={230}
                          poster={(d.images.find(i => i.origin === 'generated' && i.view !== 'sketch') ?? d.images[0])?.url} />
                      </>
                    )}
                    <div className="dd-sub">{t('Campaign shots')} {camp.length === 0 && <span className="hint">{t('None for this design')}</span>}</div>
                    <div className="dd-camp">
                      {camp.map((im, i) => <img key={im.hash + i} src={im.url} alt="" loading="lazy" />)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {st.designs.length === 0 && st.signals.length === 0 && (
          <div className="empty" style={{ height: 300 }}>
            <div>{t('Starting the pipeline')}<br /><span className="hint">{t('Partial results appear here as they land')}</span></div>
          </div>
        )}
      </div>

      {/* 우: 로그 · 기본 접힘 */}
      {showLog ? (
        <div className="run-right">
          <div className="panel-h" style={{ borderBottom: '1px solid var(--line)' }}>
            Progress log
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowLog(false)}>{t('Close')}</button>
          </div>
          <div className="log" ref={logRef}>
            {st.logs.map((l, i) => (
              <div className="ln" key={i}>
                <span className="st">{l.stage}</span>
                <span className={`tx ${l.text.startsWith('⚠') ? 'warn' : ''}`}>{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="log-rail">
          <button onClick={() => setShowLog(true)}>Log {st.logs.length}</button>
        </div>
      )}
    </div>
  )
}
