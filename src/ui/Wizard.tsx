// ── 새 Run 위저드 ─────────────────────────────────────────────────
// 한 화면에 결정 열 개를 늘어놓으면 어느 것도 주인공이 되지 못한다.
// 그래서 질문 세 개로 나눈다: 무엇을 · 어떻게 조사할지 · 어디까지.
//
// 선택지는 아이콘 + 제목 + 한 줄로 읽는다. 고른 것만 accent 테두리와
// 체크 배지를 달고, 나머지는 조용히 둔다.
import { getLang, t } from '../core/i18n'
import { useEffect, useMemo, useState } from 'react'
import { detectRuntime } from '../core/runtime'
import type { Runtime } from '../core/runtime'
import { CAT_LABEL, DEFAULT_PARAMS, firstTypeOf, groupOf, MODE_LABEL, MODE_SCOPE, TAXONOMY, TYPE_LABEL } from '../core/types'
import type { Mode, Category, RunParams, Stage } from '../core/types'
import { cumulative, estimate, SCOPE_COPY } from '../core/estimate'
import { Seg, Tag } from './bits'
import { ENGINES } from '../core/imageEngines'
import {
  GROUP_ICON, IcArrow, IcExternal, IcGem, IcMoodboard, IcSeries, IcTrend,
} from './icons'

// 카드 안에서는 한 줄만 읽게 한다. 자세한 설명은 고른 뒤에 보여준다.
const MODE_SHORT: Record<Mode, string> = {
  trend: 'Research competitors and market trends',
  series: 'Carry on a series you already have',
  moodboard: 'Work only from a file you upload',
}
const MODE_ICON: Record<Mode, () => JSX.Element> = {
  trend: IcTrend, series: IcSeries, moodboard: IcMoodboard,
}
const CAT_ICON: Record<Category, () => JSX.Element> = { jewelry: IcGem }

// 사용자 말로 쓴 범위 이름. S1~S5는 안쪽 사정이라 화면에 내보내지 않는다.
const SCOPE_NAME: Record<Stage, string> = {
  S1: 'Research only',
  S2: 'Through sketches',
  S3: 'Finished designs',
  S4: 'With campaign shots',
  S5: 'With a 3D showroom',
}

// 각 범위가 실제로 무엇을 내놓는지, 지난 Run에서 나온 결과물로 보여준다.
const BASE = import.meta.env.BASE_URL || '/'
const SCOPE_ART: Record<Stage, string | null> = {
  S1: null,
  S2: `${BASE}samples/7a28342791c4e3faaa6ab809.webp`,
  S3: `${BASE}samples/780ee2d38cb8913d406ef5ca.webp`,
  S4: `${BASE}samples/dc69e9e92eda584357e17437.webp`,
  S5: `${BASE}samples/21ec3965bb8961e7292d8fb6.webp`,
}

/** 리포트 미리보기 · S1은 이미지가 아니라 문서라서 문서처럼 그린다 */
function ReportThumb() {
  return (
    <svg className="sc-art" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="6" y="4" width="52" height="56" rx="3" className="rt-page" />
      <rect x="12" y="11" width="26" height="4" rx="2" className="rt-hd" />
      <rect x="12" y="20" width="40" height="2.4" rx="1.2" className="rt-ln" />
      <rect x="12" y="26" width="34" height="2.4" rx="1.2" className="rt-ln" />
      <rect x="12" y="32" width="38" height="2.4" rx="1.2" className="rt-ln" />
      <rect x="12" y="44" width="6" height="10" rx="1" className="rt-br" />
      <rect x="22" y="40" width="6" height="14" rx="1" className="rt-br" />
      <rect x="32" y="47" width="6" height="7" rx="1" className="rt-br" />
      <rect x="42" y="42" width="6" height="12" rx="1" className="rt-br" />
    </svg>
  )
}

/** 고른 카드에만 붙는 체크 배지 */
const Badge = () => (
  <span className="o-badge" aria-hidden="true">
    <svg viewBox="0 0 16 16"><path d="M3.6 8.3 6.5 11.2 12.4 5" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
)

const STEPS = [
  { n: 1, tab: 'What to create', ask: 'What are we making?' },
  { n: 2, tab: 'Research', ask: 'What should the research look at?' },
  { n: 3, tab: 'Results', ask: 'How far should we take it?' },
] as const

export default function Wizard({ onStart }: { onStart: (p: RunParams) => void }) {
  const [p, setP] = useState<RunParams>(DEFAULT_PARAMS)
  const [step, setStep] = useState(1)
  const set = <K extends keyof RunParams>(k: K, v: RunParams[K]) => setP(prev => ({ ...prev, [k]: v }))
  const [rt, setRt] = useState<Runtime | null>(null)
  useEffect(() => { detectRuntime().then(setRt) }, [])
  const api = rt?.kind === 'live' ? { keyPresent: rt.keyPresent, cachedImages: rt.cachedImages } : null
  const isStatic = rt?.kind === 'static'
  const est = useMemo(() => estimate(p), [p])
  const cum = useMemo(() => cumulative(p), [p])
  const scope = MODE_SCOPE[p.mode]
  const [draft, setDraft] = useState('')
  const [more, setMore] = useState(false)
  const [breakdown, setBreakdown] = useState(false)
  const setTrend = (patch: Partial<RunParams['trend']>) => setP(v => ({ ...v, trend: { ...v.trend, ...patch } }))
  const setSeries = (patch: Partial<RunParams['series']>) => setP(v => ({ ...v, series: { ...v.series, ...patch } }))
  const setMood = (patch: Partial<RunParams['moodboard']>) => setP(v => ({ ...v, moodboard: { ...v.moodboard, ...patch } }))
  const addCompetitor = (name?: string) => {
    const n = (name ?? draft).trim()
    if (!n) return
    setP(v => v.trend.competitors.includes(n) ? v
      : ({ ...v, trend: { ...v.trend, competitors: [...v.trend.competitors, n] } }))
    if (!name) setDraft('')
  }

  // 모드별 착수 조건 · 자료 없이 돌리면 결과를 설명할 수 없다
  const blocked = isStatic ? 'Live runs need the local server. Open the saved sample from History to see a finished run.'
    : p.mode === 'trend' ? (p.trend.competitors.length === 0 ? 'Add at least one competitor' : null)
    : p.mode === 'series' ? (p.series.archiveFiles.length === 0 ? 'Upload your series designs'
      : !p.series.valueStatement.trim() ? 'Describe what the series stands for' : null)
    : (p.moodboard.files.length === 0 ? 'Upload a PDF' : null)
  // 2단계에서 막히는 조건은 2단계에서 알려야 한다
  const stepBlocked = step === 2 && !isStatic ? blocked : null

  const curGroup = groupOf(p.category, p.itemType)
  const pickCategory = (c: Category) => setP(v => ({
    ...v, category: c, itemType: TAXONOMY[c][0].types[0].id,
  }))
  const [rc, rp] = p.tierRatio
  const rsum = p.tierRatio.reduce((a, b) => a + b, 0)
  const perTier = (r: number) => Math.round(p.sketchCount * r / rsum)
  const designCount = Math.max(1, Math.round(p.sketchCount * p.renderRatio))
  const CatIcon = CAT_ICON[p.category]

  return (
    <div className="wizard">
      <div className="wizard-inner">
        <div className="wcol">
          {isStatic && (
            <div className="staticnote">
              <div className="sn-body">
                <b>{t('This is a preview of the full demo.')}</b>
                <p>{t('Research and image generation run on a local Node server that is not part of this static build, so nothing is called from here. Everything a full run produced is saved: open History in the left rail to walk through the sample run, its board, the season dossier and the PDFs.')}</p>
                <a href="https://github.com/jhkim1543/vringon-jewelry-agent#running-it-for-real" target="_blank" rel="noreferrer">
                  {t('Learn how it actually works')} <IcArrow />
                </a>
              </div>
              <span className="sn-art" aria-hidden="true" />
            </div>
          )}

          {/* 단계 표시 */}
          <nav className="steps" aria-label={t('Steps')}>
            {STEPS.map(s => (
              <button key={s.n} className={`stp ${step === s.n ? 'on' : ''} ${step > s.n ? 'done' : ''}`}
                onClick={() => setStep(s.n)}>
                <span className="stp-n">{s.n}</span>
                <span className="stp-t">{t(s.tab)}</span>
              </button>
            ))}
          </nav>

          <h1 className="ask">{t(STEPS[step - 1].ask)}</h1>

          {/* ── 1단계 · 무엇을 ──────────────────────────────────── */}
          {step === 1 && (<>
            <section className="sect">
              <h2>{t('Reference')}</h2>
              <div className="opts three">
                {(Object.keys(MODE_LABEL) as Mode[]).map(m => {
                  const Icon = MODE_ICON[m]
                  return (
                    <button key={m} className={`opt ${p.mode === m ? 'on' : ''}`} onClick={() => set('mode', m)}>
                      <span className="o-ic"><Icon /></span>
                      <span className="o-t">{t(MODE_LABEL[m])}</span>
                      <span className="o-d">{t(MODE_SHORT[m])}</span>
                      {p.mode === m && <Badge />}
                    </button>
                  )
                })}
              </div>
              <p className="note">{t('Pick where the design should start from. It decides what gets researched in the next step.')}</p>
            </section>

            <section className="sect">
              <h2>{t('Jewelry family')}</h2>

              <div className="stack">
                <div className="famrow">
                  {TAXONOMY.jewelry.map(g => {
                    const Icon = GROUP_ICON[g.id] ?? CatIcon
                    const on = curGroup?.id === g.id
                    return (
                      <button key={g.id} className={`fam ${on ? 'on' : ''}`}
                        onClick={() => set('itemType', firstTypeOf(p.category, g.id))}>
                        <span className="fam-ic"><Icon /></span>
                        <span className="fam-txt">
                          <span className="fam-t">{g.label}</span>
                          <span className="fam-n">{g.note}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="stack">
                <span className="lbl">{t('Type')}</span>
                <div className="chiprow">
                  {(curGroup?.types ?? []).map(ty => (
                    <button key={ty.id} className={`pick ${p.itemType === ty.id ? 'on' : ''}`}
                      onClick={() => set('itemType', ty.id)}>{ty.label}</button>
                  ))}
                </div>
              </div>

              <p className="note">
                {t('N molds in the library. Core designs must reuse an existing mold.').replace('N', '22')}
              </p>
            </section>
          </>)}

          {/* ── 2단계 · 어떻게 조사할지 ──────────────────────────── */}
          {step === 2 && (<>
            {p.mode === 'trend' && (<>
              <section className="sect">
                <h2>{t('Competitor brands')}</h2>
                <p className="note top">{t('Their best sellers and the trends around them get searched on the web.')}</p>
                <div className="chiplist">
                  {p.trend.competitors.map(c => (
                    <span className="chip-in" key={c}>
                      {c}
                      <button onClick={() => setP(v => ({ ...v, trend: { ...v.trend, competitors: v.trend.competitors.filter(x => x !== c) } }))} aria-label={`Remove ${c}`}>{t('Remove')}</button>
                    </span>
                  ))}
                </div>
                <div className="inrow">
                  <input className="input" style={{ maxWidth: 240 }} placeholder={t('Brand name')}
                    value={draft} onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCompetitor() }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => addCompetitor()}>{t('Add')}</button>
                </div>
                <div className="chiplist quick">
                  <span className="hint">{t('Quick add')}</span>
                  {['Tiffany', 'Cartier', 'Pandora', 'Swarovski', 'Monica Vinader', 'Swarovski']
                    .filter((b, i, a) => a.indexOf(b) === i && !p.trend.competitors.includes(b)).map(b => (
                    <button key={b} className="pick" onClick={() => addCompetitor(b)}>{b}</button>
                  ))}
                </div>
              </section>

              <section className="sect">
                <h2>{t('Where it sits in the market')}</h2>
                <div className="stack">
                  <span className="lbl">{t('Tier')}</span>
                  <Seg options={['mass', 'contemporary', 'premium', 'luxury'] as const} value={p.trend.priceBand}
                    onChange={v => setTrend({ priceBand: v })} />
                </div>
                <div className="stack">
                  <span className="lbl">{t('Price')}</span>
                  <div className="inrow">
                    <input className="input" style={{ maxWidth: 110 }} type="number" value={p.trend.priceMinKrw}
                      onChange={e => setTrend({ priceMinKrw: Number(e.target.value) })} />
                    <span className="hint">~</span>
                    <input className="input" style={{ maxWidth: 110 }} type="number" value={p.trend.priceMaxKrw}
                      onChange={e => setTrend({ priceMaxKrw: Number(e.target.value) })} />
                    <span className="hint">{t('KRW. Search widens 30% beyond this.')}</span>
                  </div>
                </div>
                <p className="note">{t(scope.note)}</p>
              </section>
            </>)}

            {p.mode === 'series' && (<>
              <section className="sect">
                <h2>{t('Your series')}</h2>
                <div className="stack">
                  <span className="lbl">{t('Name')}</span>
                  <input className="input" style={{ maxWidth: 260 }} placeholder="e.g. Arc line"
                    value={p.series.seriesName} onChange={e => setSeries({ seriesName: e.target.value })} />
                </div>
                <label className="dropzone">
                  <input type="file" multiple accept="image/*" hidden
                    onChange={e => setSeries({ archiveFiles: [...p.series.archiveFiles, ...Array.from(e.target.files ?? []).map(f => f.name)] })} />
                  {t('Upload past designs from this series')}
                  <span className="dz-sub">{t('8 or more, so the constants can be told apart')}</span>
                </label>
                {p.series.archiveFiles.length > 0 && (
                  <div className="chiplist quick">
                    {p.series.archiveFiles.slice(0, 6).map((f, i) => <span className="chip-in" key={i}>{f}</span>)}
                    {p.series.archiveFiles.length > 6 && <span className="hint">+{p.series.archiveFiles.length - 6} more</span>}
                  </div>
                )}
                <div className="chiplist quick">
                  <Tag kind={p.series.archiveFiles.length >= 8 ? 'ok' : 'warn'}>
                    {p.series.archiveFiles.length} files · {p.series.archiveFiles.length >= 8 ? 'enough to separate constants' : 'need 8 or more'}
                  </Tag>
                </div>
              </section>
              <section className="sect">
                <h2>{t('What it stands for')}</h2>
                <textarea className="input" rows={3} style={{ width: '100%', resize: 'vertical' }}
                  placeholder={t('What this series has kept, and what you want to change this season')}
                  value={p.series.valueStatement} onChange={e => setSeries({ valueStatement: e.target.value })} />
                <div className="stack">
                  <span className="lbl">{t('Trends')}</span>
                  <Seg options={['On', 'Off'] as const} value={p.series.trendSearch ? 'On' : 'Off'}
                    onChange={v => setSeries({ trendSearch: v === 'On' })} />
                </div>
                <p className="note">{t('The only outside research in this mode')}</p>
              </section>
            </>)}

            {p.mode === 'moodboard' && (
              <section className="sect">
                <h2>{t('Your file')}</h2>
                <label className="dropzone">
                  <input type="file" multiple accept="application/pdf" hidden
                    onChange={e => setMood({ files: [...p.moodboard.files, ...Array.from(e.target.files ?? []).map(f => f.name)] })} />
                  {t('Upload your trend report or moodboard PDF')}
                  <span className="dz-sub">{t('Nothing outside these files is used')}</span>
                </label>
                {p.moodboard.files.length > 0 && (
                  <div className="chiplist quick">
                    {p.moodboard.files.map((f, i) => (
                      <span className="chip-in" key={i}>{f}
                        <button onClick={() => setMood({ files: p.moodboard.files.filter((_, j) => j !== i) })} aria-label={t('Remove')}>{t('Remove')}</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="stack">
                  <span className="lbl">{t('Notes')}</span>
                  <textarea className="input" rows={2} style={{ width: '100%', resize: 'vertical' }}
                    placeholder={t('Anything specific to look for')}
                    value={p.moodboard.notes} onChange={e => setMood({ notes: e.target.value })} />
                </div>
                <p className="note">{t('Uploaded files are treated as data, never as instructions')}</p>
              </section>
            )}
          </>)}

          {/* ── 3단계 · 어디까지 ────────────────────────────────── */}
          {step === 3 && (<>
            <section className="sect">
              <h2>{t('Stop after')}</h2>
              <div className="scopegrid">
                {cum.map(s => {
                  const st = s.stage as Stage
                  const art = SCOPE_ART[st]
                  const on = p.endStage === st
                  return (
                    <button key={st} className={`scopecard ${on ? 'on' : ''}`} onClick={() => set('endStage', st)}>
                      {/* 넷 합쳐 57KB다. lazy로 미루면 이득 없이 빈 칸만 잠깐 보인다. */}
                      <span className="sc-thumb">{art ? <img src={art} alt="" /> : <ReportThumb />}</span>
                      <span className="sc-txt">
                        <span className="sc-n">{t(SCOPE_NAME[st])}</span>
                        <span className="sc-g">{t(SCOPE_COPY[st].gets)}</span>
                      </span>
                      <span className="sc-m">{s.minutes}m · ${s.usd.toFixed(2)}</span>
                      {on && <Badge />}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="sect">
              <h2>{t('How many')}</h2>
              <div className="stack">
                <span className="lbl">{t('Sketches')}</span>
                <div className="inrow">
                  <Seg options={[6, 12, 18, 24] as const} value={p.sketchCount} onChange={v => set('sketchCount', v)} />
                  <span className="hint">{t('Core')} {perTier(rc)} · {t('Push')} {perTier(rp)} · {t('Signature')} {p.sketchCount - perTier(rc) - perTier(rp)}</span>
                </div>
              </div>
              <div className="stack">
                <span className="lbl">{t('Designs per sketch')}</span>
                <div className="inrow">
                  <Seg options={[1, 2, 3, 4] as const} value={p.designsPerSketch ?? 2} onChange={v => set('designsPerSketch', v)} />
                  <span className="hint">{designCount * (p.designsPerSketch ?? 2)} {t('designs in total, each from a trend-based prompt')}</span>
                </div>
              </div>
              <div className="stack">
                <span className="lbl">{t('Top picks')}</span>
                <div className="inrow">
                  <Seg options={[1, 2, 3, 4, 5] as const} value={p.topN as any} onChange={v => set('topN', Number(v))} />
                  <span className="hint">{t('At least one from each tier')}</span>
                </div>
              </div>
              {/* 조사 결과를 어느 말로 쓸지. 화면 언어와 따로 고른다 —
                  한국어 화면으로 보면서 영문 리포트를 뽑는 경우가 실제로 있다. */}
              <div className="stack"><span className="lbl">{t('Report language')}</span>
                <div className="inrow">
                  <Seg options={['ko', 'ja', 'en'] as const}
                    value={p.researchLang ?? getLang()}
                    onChange={v => set('researchLang', v)}
                    format={v => v === 'ko' ? '한국어' : v === 'ja' ? '日本語' : 'English'} />
                  <span className="hint">{t('Research, signals and both PDFs come out in this language.')}</span>
                </div>
              </div>
              <label className="checkline">
                <input type="checkbox" checked={p.approvalGate} onChange={e => set('approvalGate', e.target.checked)} />
                {t('Show me the sketches before rendering')}
              </label>
            </section>

            <button className="moretoggle" onClick={() => setMore(v => !v)}>
              {more ? t('Hide advanced settings') : t('Advanced settings')}
              <span className="mt-sum">{`${p.tierRatio.join(':')} · ${Math.round(p.renderRatio * 100)}% · ${p.viewCount} views · ${p.campaignShots} cuts · ${ENGINES[p.imageEngine].label}`}</span>
            </button>

            {more && (<div className="morebox">
              <div className="stack"><span className="lbl">{t('Mix')}</span>
                <div className="inrow">
                  <Seg options={['1:1:1', '2:1:1', '1:2:1', '2:2:1'] as const}
                    value={p.tierRatio.join(':') as any}
                    onChange={v => set('tierRatio', String(v).split(':').map(Number) as [number, number, number])} />
                  <span className="hint">{t('Core : Push : Signature')}</span>
                </div>
              </div>
              <div className="stack"><span className="lbl">{t('To render')}</span>
                <div className="inrow">
                  <Seg options={[0.25, 0.5, 0.75] as const} value={p.renderRatio} onChange={v => set('renderRatio', v)} format={v => `${Number(v) * 100}%`} />
                  <span className="hint">{designCount} {t('move on')}</span>
                </div>
              </div>
              <div className="stack"><span className="lbl">{t('Views')}</span>
                <div className="inrow">
                  <Seg options={[1, 3, 4] as const} value={p.viewCount} onChange={v => set('viewCount', v)} />
                  <span className="lbl sub">{t('Colorways')}</span>
                  <Seg options={[0, 1, 2, 3] as const} value={p.colorwayCount} onChange={v => set('colorwayCount', v)} />
                </div>
              </div>
              <div className="stack"><span className="lbl">{t('Variations')}</span>
                <div className="inrow">
                  <Seg options={[0, 2, 3, 4, 6, 8] as const} value={p.variationCount} onChange={v => set('variationCount', v)} />
                  <span className="hint">{t('Branches off one sketch, one axis changed each')}</span>
                </div>
              </div>
              <div className="stack"><span className="lbl">{t('Campaign cuts')}</span>
                <div className="inrow">
                  <Seg options={[0, 2, 4, 6] as const} value={p.campaignShots} onChange={v => set('campaignShots', v)} />
                  <span className="hint">{t('Per selected design. Half worn on a model, half staged.')}</span>
                </div>
              </div>
              <div className="stack"><span className="lbl">{t('3D showroom')}</span>
                <div className="inrow">
                  <Seg options={['Off', 'On'] as const} value={p.make3d ? 'On' : 'Off'} onChange={v => set('make3d', v === 'On')} />
                  <span className="hint">{t('Only the final picks go to Tripo. The result is a GLB you can turn on the board.')}</span>
                </div>
              </div>
              <div className="stack"><span className="lbl">{t('Model')}</span>
                <div className="opts two tight">
                  {(['fast', 'detail'] as const).map(id => (
                    <button key={id} className={`opt ${p.imageEngine === id ? 'on' : ''}`}
                      onClick={() => set('imageEngine', id)}>
                      <span className="o-t">{ENGINES[id].label}</span>
                      <span className="o-d">{ENGINES[id].blurb}</span>
                      <span className="o-m">${ENGINES[id].usdPerImage.toFixed(3)} · {ENGINES[id].secPerImage}s each</span>
                      {p.imageEngine === id && <Badge />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="stack"><span className="lbl">{t('Image cap')}</span>
                <div className="inrow">
                  <Seg options={[0, 6, 12, 24, 48] as const} value={p.imageBudget}
                    onChange={v => set('imageBudget', v)}
                    format={v => v === 0 ? 'None' : `${v}`} />
                  <span className="hint">
                    {api && !api.keyPresent
                      ? t('No image server. Diagrams only.')
                      : p.imageBudget === 0
                        ? t('Spec diagrams only')
                        : `${t('Anything past the cap falls back to a diagram')}${api?.cachedImages ? ` · ${api.cachedImages} ${t('reusable')}` : ''}`}
                  </span>
                </div>
              </div>
            </div>)}
          </>)}

          {/* 강한 CTA는 화면에 하나뿐이다 */}
          <div className="wizbar">
            <button className="btn btn-ghost" onClick={() => step === 1 ? setP(DEFAULT_PARAMS) : setStep(step - 1)}>
              {step === 1 ? t('Reset') : t('Back')}
            </button>
            <div className="wb-msg">{stepBlocked && t(stepBlocked)}</div>
            {step < 3
              ? <button className="btn btn-primary" disabled={!!stepBlocked} onClick={() => setStep(step + 1)}>
                  {t('Continue')} <IcArrow />
                </button>
              : <button className="btn btn-primary" disabled={!!blocked} onClick={() => onStart(p)}>
                  {t('Start the run')} <IcArrow />
                </button>}
          </div>
          {step === 3 && blocked && <div className="blockmsg">{t(blocked)}</div>}
        </div>

        {/* 오른쪽은 요약이다. 결정하는 자리가 아니다. */}
        <aside className="summary">
          <div className="sumcard">
            <h3>{t('Project summary')}</h3>
            <div className="sm-brief">
              <b>{t(TYPE_LABEL[p.itemType])}</b>
              <span>{t(MODE_LABEL[p.mode])} · {t(SCOPE_NAME[p.endStage])}</span>
            </div>
            <div className="sm-stats">
              <div><span className="v">{p.endStage === 'S1' ? '—' : designCount}</span><span className="k">{t('Designs')}</span></div>
              <div><span className="v">{est.totalMinutes}<i>m</i></span><span className="k">{t('Estimated time')}</span></div>
              <div><span className="v">${est.totalUsd.toFixed(2)}</span><span className="k">{t('Estimated cost')}</span></div>
            </div>
            <button className="btn btn-ghost btn-sm sm-more" onClick={() => setBreakdown(v => !v)}>
              {breakdown ? t('Hide details') : t('View details')} <IcExternal />
            </button>
            {breakdown && (
              <table className="sm-table">
                <tbody>
                  {est.perStage.map(s => {
                    const order = ['S1', 'S2', 'S3', 'S4', 'S5']
                    const active = order.indexOf(s.stage) <= order.indexOf(p.endStage)
                    return (
                      <tr key={s.stage} className={active ? '' : 'dim'}>
                        <td>{t(s.label)}</td>
                        {/* 상한에 걸리면 "만들 수 있는 수 / 원한 수"로 보여야 오해가 없다 */}
                        <td>{s.images > 0 ? (s.real < s.images ? `${s.real} of ${s.images}` : `${s.images} imgs`) : ''}</td>
                        <td>{Math.max(1, Math.round(s.minutes))}m · ${s.usd.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
