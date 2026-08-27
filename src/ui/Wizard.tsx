// ── 실행 설정 · 에이전트 선택(다크 히어로) → 번호 스테퍼 폼 ──────────
// 왼쪽은 01·02·03… 단계 카드(아코디언), 오른쪽은 "실행 전 검토" 패널.
// 우측 패널은 가격이 아니라 **수량과 예상 시간**을 보여 준다 — 실측 실행에서
// 잡은 단계별 시간으로 계산한다(estimateMinutes).
// 검색 지역은 다중 선택이다. 지역 수만큼 편집샵·확산 조사가 늘어난다.
import { t, tf } from '../core/i18n'
import { useEffect, useMemo, useState } from 'react'
import { detectRuntime } from '../core/runtime'
import type { Runtime } from '../core/runtime'
import {
  ANALYSIS_LANGS, DEFAULT_PARAMS, GENDER_LABEL, ITEMS, ITEM_LABEL, MODE_LABEL,
  REGIONS, estimateMinutes, estimateStages, plannedPairCount, regionLabel, regionsOf,
  agesOf,
} from '../core/types'
import type { DesignCount, Mode, RunParams, SetCount } from '../core/types'
import { ENGINES } from '../core/imageEngines'
import { loadLastParams } from '../core/store'
import { IcArrow } from './icons'
import { Seg } from './bits'
import { assetUrl } from '../core/api'

const AGENT_DESC: Record<Mode, string> = {
  competitor: 'Crawls your competitors and the select shops of the search regions, builds a trend report along your direction, then designs from trend-ranked references.',
  fashion: 'Reads the season\'s runway and its retail adoption, translates fashion looks into jewelry language, then designs from fashion references.',
  collection: 'Researches a keyword or story, abstracts it into design language, and builds jewelry sets that share one Design DNA across the items you pick.',
}
/** 모드별 산출물 · 화면이 약속하는 것과 실제로 나오는 것을 맞춘다 */
const DELIVERABLES: Record<Mode, string[]> = {
  competitor: [
    'Competitor and select-shop product crawl',
    'Trend report with sources',
    'Next-season forecast',
    'Ranked references, then designs with prompts',
  ],
  fashion: [
    'Runway looks and their retail adoption',
    'Trend report with sources',
    'Next-season forecast',
    'Fashion references, then designs with prompts',
  ],
  collection: [
    'Keyword research: culture, symbols, forms, cliches to avoid',
    'Sets that share one Design DNA',
    'Concept art and a lineup image per set',
    'No competitor crawl in this agent',
  ],
}

const AGENT_ART: Record<Mode, string> = {
  competitor: 'agent-competitor.webp', fashion: 'agent-fashion.webp', collection: 'agent-collection.webp',
}

// 나이대는 다중 선택 · 5년 단위로 잘게, 위쪽은 넓게 묶는다
const AGE_BANDS = ['18-21', '22-25', '26-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-64', '65+'] as const

// ── 단계 정의 · 에이전트마다 첫 단계가 다르다 ────────────────────────
type StepId = 'competitors' | 'keyword' | 'scope' | 'design' | 'review'
function stepsFor(mode: Mode): { id: StepId; title: string }[] {
  const head: { id: StepId; title: string }[] =
    mode === 'competitor' ? [{ id: 'competitors', title: 'Competitors' }]
      : mode === 'collection' ? [{ id: 'keyword', title: 'Keyword' }]
        : []
  return [...head,
    { id: 'scope', title: 'Research scope' },
    { id: 'design', title: 'Design setup' },
    { id: 'review', title: 'Review' },
  ]
}

export default function Wizard({ onStart }: { onStart: (p: RunParams) => void }) {
  const [p, setP] = useState<RunParams>(DEFAULT_PARAMS)
  const [agentPicked, setAgentPicked] = useState(false)
  const last = useMemo(() => loadLastParams(), [])
  const set = <K extends keyof RunParams>(k: K, v: RunParams[K]) => setP(prev => ({ ...prev, [k]: v }))
  const [rt, setRt] = useState<Runtime | null>(null)
  useEffect(() => { detectRuntime().then(setRt) }, [])
  const isStatic = rt?.kind === 'static'
  const [draft, setDraft] = useState('')          // 경쟁사 입력
  const [regionDraft, setRegionDraft] = useState('')
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState<StepId | null>(null)

  // 브랜드 이미지는 조사 서버가 서빙한다 · VRINGON 안에서 돌 때 같은 출처에는 없다
  const steps = stepsFor(p.mode)
  const regions = regionsOf(p)

  const addCompetitor = () => {
    const n = draft.trim()
    if (!n || p.competitors.includes(n)) return
    set('competitors', [...p.competitors, n]); setDraft('')
  }
  const toggleRegion = (label: string) =>
    set('countries', regions.includes(label) ? regions.filter(x => x !== label) : [...regions, label])
  const addRegion = () => {
    const n = regionDraft.trim()
    if (!n || regions.includes(n)) return
    set('countries', [...regions, n]); setRegionDraft('')
  }

  // ── 완료 판정 · 스테퍼와 체크 표시가 이걸 따른다 ───────────────────
  const doneOf: Record<StepId, boolean> = {
    competitors: p.competitors.length > 0,
    keyword: p.direction.trim().length > 0,
    scope: regions.length > 0 && (p.mode !== 'collection' || p.direction.trim().length > 0),
    design: p.mode === 'collection' ? p.items.length > 0 : !!p.itemType,
    review: false,
  }
  doneOf.review = steps.filter(s => s.id !== 'review').every(s => doneOf[s.id])
  const pct = Math.round(steps.slice(0, -1).filter(s => doneOf[s.id]).length / (steps.length - 1) * 100)

  const pairCount = plannedPairCount(p)
  const conceptArt = p.mode === 'collection' && p.items.length > 0 ? p.setCount * 5 : 0
  const deepOn = rt?.kind === 'live' && rt.deepResearch
  const est = estimateMinutes(p, deepOn)
  // 조사(수집+리포트)와 생성(레퍼런스·프롬프트·이미지)을 나눠 보여 준다 ·
  // 깊은 조사를 켰을 때 어디가 길어지는지 눈에 보여야 한다
  const stEst = estimateStages(p, deepOn)
  const research = { min: Math.round(stEst.S1.min + stEst.S2.min), max: Math.round(stEst.S1.max + stEst.S2.max) }
  const build = { min: Math.round(stEst.S3.min + stEst.S4.min + stEst.S5.min), max: Math.round(stEst.S3.max + stEst.S4.max + stEst.S5.max) }

  const blocked = isStatic ? t('Live runs need the local server. Open a saved sample from History.')
    : p.mode === 'competitor' && p.competitors.length === 0 ? t('Add at least one competitor')
    : p.mode === 'collection' && !p.direction.trim() ? t('Write the collection keyword or story')
    : p.mode === 'collection' && p.items.length === 0 ? t('Pick at least one item')
    : !regions.length ? t('Set the search region')
    : null

  // 처음 열 단계 · 아직 안 끝난 첫 단계
  useEffect(() => {
    if (!agentPicked) return
    if (open) return
    const first = steps.find(s => s.id !== 'review' && !doneOf[s.id])
    setOpen(first?.id ?? 'review')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentPicked])

  // ── 0단계 · 에이전트 선택 (다크 히어로) ────────────────────────────
  if (!agentPicked) {
    const nums = ['01', '02', '03']
    return (
      <div className="agpick">
        <div className="agpick-inner">
          <h1 className="agpick-ask">{t('Which agent should do this?')}</h1>
          <p className="agpick-sub">{t('Each one starts from a different place. That choice decides what gets researched and what the result can be explained by.')}</p>
          <div className="aghero">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m, i) => (
              <button key={m} className="agh-card" onClick={() => { set('mode', m); setAgentPicked(true); setOpen(null) }}>
                <span className="agh-photo"><img src={assetUrl(`/brand/${AGENT_ART[m]}`)} alt="" loading="lazy" /></span>
                <span className="agh-num">{nums[i]}</span>
                <span className="agh-t">{t(MODE_LABEL[m])}</span>
                <span className="agh-d">{t(AGENT_DESC[m])}</span>
                <span className="agh-go">{t('Start with this agent')} <IcArrow /></span>
              </button>
            ))}
          </div>
          {last && (
            <button className="lastrun" onClick={() => { setP({ ...last, countries: regionsOf(last) }); setAgentPicked(true); setOpen(null) }}>
              <span className="lr-t">{t('Pick up your last setup')}</span>
              <span className="lr-d">{t(MODE_LABEL[last.mode])} · {regionsOf(last).map(regionLabel).join(', ')} · {last.mode === 'collection' ? last.items.map(i => t(ITEM_LABEL[i])).join(', ') : t(ITEM_LABEL[last.itemType])}</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── 단계 헤더의 닫힘 요약 · 고른 값이 칩으로 보인다 ─────────────────
  const summaryOf = (id: StepId): string[] => {
    switch (id) {
      case 'competitors': return p.competitors
      case 'keyword': return p.direction ? [p.direction.slice(0, 26)] : []
      case 'scope': return [...regions.map(regionLabel), ANALYSIS_LANGS.find(l => l.id === p.analysisLang)?.label ?? '']
      case 'design': return p.mode === 'collection'
        ? [...p.items.map(i => t(ITEM_LABEL[i])), `${p.setCount} ${t('sets')}`]
        : [t(ITEM_LABEL[p.itemType]), `${p.designCount}`]
      case 'review': return []
    }
  }

  // 컴포넌트가 아니라 **일반 함수**다. 렌더마다 새 컴포넌트 타입을 만들면
  // React 가 서브트리를 통째로 다시 마운트해, 입력 한 글자마다 포커스가 끊긴다.
  const stepCard = (id: StepId, num: number, title: string, children: React.ReactNode) => (
    <section className={`stepcard ${open === id ? 'open' : ''} ${doneOf[id] ? 'done' : ''}`}>
      <button className="sc-head" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
        <span className="sc-num">{doneOf[id] && open !== id
          ? <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8.6 6.4 12 13 4.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          : String(num).padStart(2, '0')}</span>
        <span className="sc-t">{t(title)}</span>
        {open !== id && <span className="sc-sum">{summaryOf(id).slice(0, 4).map((s, i) => <em key={i}>{s}</em>)}</span>}
        <span className={`sc-cv ${open === id ? 'open' : ''}`} aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
      {open === id && <div className="sc-body">{children}</div>}
    </section>
  )

  return (
    <div className="wizard2">
      <div className="w2-cols">
        <div className="w2-main">
          <div className="w2-headrow">
            <div>
              <h1 className="w2-title">{tf('{agent} analysis', { agent: t(MODE_LABEL[p.mode]) })}</h1>
              <p className="w2-sub">{t('Fill in what the agent needs for a new analysis')}</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setAgentPicked(false) }}>{t('Change agent')}</button>
          </div>

          {/* 스테퍼 · 완료 단계는 체크, 진행률은 % */}
          <div className="w2-steps" role="list">
            {steps.map((s, i) => (
              <span key={s.id} role="listitem"
                className={`w2-step ${doneOf[s.id] ? 'done' : ''} ${open === s.id ? 'cur' : ''}`}
                onClick={() => setOpen(s.id)}>
                <i>{doneOf[s.id]
                  ? <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 8.6 6.4 12 13 4.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  : String(i + 1).padStart(2, '0')}</i>
                <b>{t(s.title)}</b>
                {i < steps.length - 1 && <span className="w2-line" aria-hidden="true" />}
              </span>
            ))}
            <span className="w2-pct">{tf('{pct}% complete', { pct })}</span>
          </div>

          {/* ── 01 · 경쟁사 (경쟁사 에이전트) ─────────────────────── */}
          {p.mode === 'competitor' && stepCard('competitors', 1, 'Competitors', <>
              <p className="note top">{t('Their representative, best-selling and newly released items get crawled with prices and photos. Every brand you add gets its own crawl.')}</p>
              <div className="chiplist">
                {p.competitors.map(c => (
                  <span className="chip-in" key={c}>{c}
                    <button onClick={() => set('competitors', p.competitors.filter(x => x !== c))}>{t('Remove')}</button>
                  </span>
                ))}
                {!p.competitors.length && <span className="hint">{t('e.g. Pandora, Mejuri, Tiffany')}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input className="input" style={{ maxWidth: 280 }} value={draft}
                  placeholder={t('Brand name')} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCompetitor() }} />
                <button className="btn btn-ghost btn-sm" onClick={addCompetitor}>{t('Add')}</button>
              </div>
            </>)}

          {/* ── 01 · 키워드 (컬렉션) ──────────────────────────────── */}
          {p.mode === 'collection' && stepCard('keyword', 1, 'Keyword', <>
              <span className="lbl">{t('Collection keyword or story')}</span>
              <textarea className="input" rows={3} maxLength={500} style={{ width: '100%', resize: 'vertical' }}
                value={p.direction} onChange={e => set('direction', e.target.value)}
                placeholder={t('e.g. A modern reading of the year-end sun of 2026')} />
              <div className="charcount">{p.direction.length} / 500</div>
              <p className="note">{t('The keyword is researched for its cultural meaning in the search region, then abstracted into design language.')}</p>
            </>)}

          {/* ── 조사 범위 · 지역(다중)과 언어, 방향 ────────────────── */}
          {stepCard('scope', p.mode === 'fashion' ? 1 : 2, 'Research scope', <>
            <div className="stack">
              <span className="lbl">{t('Search regions (multi-select)')}</span>
              <div className="chiprow">
                {REGIONS.map(r => (
                  <button key={r.id} className={`pick sm ${regions.includes(r.label) ? 'on' : ''}`}
                    onClick={() => toggleRegion(r.label)}>{t(r.label)}</button>
                ))}
                {/* 자유 입력 지역 · 표준 권역이 아닌 것은 지울 수 있는 칩으로 */}
                {regions.filter(x => !REGIONS.some(r => r.label === x)).map(x => (
                  <span className="chip-in sm" key={x}>{x}
                    <button onClick={() => set('countries', regions.filter(y => y !== x))}>{t('Remove')}</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input className="input" style={{ maxWidth: 200 }} value={regionDraft}
                  placeholder={t('Other region or city')} onChange={e => setRegionDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addRegion() }} />
                <button className="btn btn-ghost btn-sm" onClick={addRegion}>{t('Add')}</button>
              </div>
              <span className="hint">{t('Pick several regions and each gets its own shop and adoption research. More regions, more findings, more time.')}</span>
            </div>
            <div className="stack">
              <span className="lbl">{t('Analysis language')}</span>
              <div className="chiprow">
                {ANALYSIS_LANGS.map(l => (
                  <button key={l.id} className={`pick sm ${p.analysisLang === l.id ? 'on' : ''}`}
                    onClick={() => set('analysisLang', l.id)}>{l.label}</button>
                ))}
              </div>
              <span className="hint">{t('Reports, design directions and generation prompts all come out in this language.')}</span>
            </div>
            {p.mode !== 'collection' && (
              <div className="stack">
                <span className="lbl">{t('Research direction')}</span>
                <textarea className="input" rows={3} maxLength={500} style={{ width: '100%', resize: 'vertical' }}
                  value={p.direction} onChange={e => set('direction', e.target.value)}
                  placeholder={t('e.g. Lean toward sculptural silver and away from minimalism. Focus on what sells in department stores.')} />
                <div className="charcount">{p.direction.length} / 500</div>
                <p className="note">{t('This steers the research questions. Facts that contradict it are still reported, because this sets the scope rather than the conclusion.')}</p>
              </div>
            )}
          </>)}

          {/* ── 디자인 설정 ───────────────────────────────────────── */}
          {stepCard('design', p.mode === 'fashion' ? 2 : 3, 'Design setup', <>
            {p.mode === 'collection' ? (<>
              <div className="stack">
                <span className="lbl">{t('Items (multi-select)')}</span>
                <div className="chiprow">
                  {ITEMS.map(it => {
                    const on = p.items.includes(it.id)
                    return (
                      <button key={it.id} className={`pick ${on ? 'on' : ''}`}
                        onClick={() => set('items', on ? p.items.filter(x => x !== it.id) : [...p.items, it.id])}>
                        {t(it.label)}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="stack">
                <span className="lbl">{t('Set samples')}</span>
                <div className="inrow">
                  <Seg options={[1, 3, 5] as const} value={p.setCount}
                    onChange={v => set('setCount', v as SetCount)} />
                  <span className="hint">{p.setCount * p.items.length} {t('designs in total (sets × items)')}</span>
                </div>
              </div>
            </>) : (<>
              <div className="stack">
                <span className="lbl">{t('Item')}</span>
                <div className="chiprow">
                  {ITEMS.filter(i => i.id !== 'pendant').map(it => (
                    <button key={it.id} className={`pick ${p.itemType === it.id ? 'on' : ''}`}
                      onClick={() => set('itemType', it.id)}>{t(it.label)}</button>
                  ))}
                </div>
              </div>
              <div className="stack">
                <span className="lbl">{t('How many designs')}</span>
                <div className="inrow">
                  <Seg options={[10, 20, 30, 40] as const} value={p.designCount}
                    onChange={v => set('designCount', v as DesignCount)} />
                  <span className="hint">{t('Ten core designs, then commercial variants, then form experiments, then material experiments')}</span>
                </div>
              </div>
            </>)}
            <div className="stack">
              <span className="lbl">{t('Target customer')}</span>
              <div className="chiprow">
                {AGE_BANDS.map(a => {
                  const on = agesOf(p.target).includes(a)
                  return (
                    <button key={a} className={`pick sm ${on ? 'on' : ''}`}
                      onClick={() => {
                        // 여러 나이대를 함께 고를 수 있다 · 마지막 하나는 끄지 않는다(타겟이 비면 프롬프트가 흔들린다)
                        const cur = agesOf(p.target)
                        const next = on ? cur.filter(x => x !== a) : [...cur, a]
                        if (!next.length) return
                        set('target', { ...p.target, ages: AGE_BANDS.filter(b => next.includes(b)) })
                      }}>{a}</button>
                  )
                })}
              </div>
              <div className="chiprow">
                {(Object.keys(GENDER_LABEL) as (keyof typeof GENDER_LABEL)[]).map(g => (
                  <button key={g} className={`pick sm ${p.target.gender === g ? 'on' : ''}`}
                    onClick={() => set('target', { ...p.target, gender: g })}>{t(GENDER_LABEL[g])}</button>
                ))}
              </div>
              <p className="note">{t('The target rides into every prompt: reference picking, design direction and the designs themselves.')}</p>
            </div>

            <button className={`moretoggle ${more ? 'open' : ''}`} onClick={() => setMore(v => !v)} aria-expanded={more}>
              <span className="mt-cv" aria-hidden="true">
                <svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span className="mt-t">{t('Advanced settings')}</span>
              <span className="mt-sum">{p.mode === 'collection'
                ? t('Expression level, positioning, metals and stones to prefer or avoid, image model')
                : t('Image model')}</span>
            </button>
            {more && (
              <div className="morebox">
                {p.mode === 'collection' && (<>
                  <div className="stack"><span className="lbl">{t('Expression')}</span>
                    <Seg options={['abstract', 'balanced', 'literal'] as const}
                      value={p.collectionAdv?.expression ?? 'balanced'}
                      onChange={v => set('collectionAdv', { ...p.collectionAdv, expression: v })}
                      format={v => t(v === 'abstract' ? 'Abstract' : v === 'balanced' ? 'Balanced' : 'Symbol visible')} />
                  </div>
                  <div className="stack"><span className="lbl">{t('Positioning')}</span>
                    <Seg options={['daily', 'premium', 'luxury', 'artpiece'] as const}
                      value={p.collectionAdv?.positioning ?? 'premium'}
                      onChange={v => set('collectionAdv', { ...p.collectionAdv, positioning: v })}
                      format={v => t(v === 'daily' ? 'Daily' : v === 'premium' ? 'Premium' : v === 'luxury' ? 'Luxury' : 'Art piece')} />
                  </div>
                  <div className="stack"><span className="lbl">{t('Metals')}</span>
                    <div className="inrow">
                      <input className="input" style={{ maxWidth: 200 }} placeholder={t('Prefer')}
                        value={p.collectionAdv?.metalsPrefer ?? ''}
                        onChange={e => set('collectionAdv', { ...p.collectionAdv, metalsPrefer: e.target.value })} />
                      <input className="input" style={{ maxWidth: 200 }} placeholder={t('Avoid')}
                        value={p.collectionAdv?.metalsAvoid ?? ''}
                        onChange={e => set('collectionAdv', { ...p.collectionAdv, metalsAvoid: e.target.value })} />
                    </div>
                  </div>
                  <div className="stack"><span className="lbl">{t('Stones')}</span>
                    <div className="inrow">
                      <input className="input" style={{ maxWidth: 200 }} placeholder={t('Prefer')}
                        value={p.collectionAdv?.stonesPrefer ?? ''}
                        onChange={e => set('collectionAdv', { ...p.collectionAdv, stonesPrefer: e.target.value })} />
                      <input className="input" style={{ maxWidth: 200 }} placeholder={t('Avoid')}
                        value={p.collectionAdv?.stonesAvoid ?? ''}
                        onChange={e => set('collectionAdv', { ...p.collectionAdv, stonesAvoid: e.target.value })} />
                    </div>
                  </div>
                </>)}
                <div className="stack"><span className="lbl">{t('Image model')}</span>
                  <div className="opts two tight">
                    {(['fast', 'detail'] as const).map(id => (
                      <button key={id} className={`opt ${p.imageEngine === id ? 'on' : ''}`}
                        onClick={() => set('imageEngine', id)}>
                        <span className="o-t">{t(ENGINES[id].label)}</span>
                        <span className="o-m">${ENGINES[id].usdPerImage.toFixed(3)}/img</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>)}

          {/* ── 검토 ──────────────────────────────────────────────── */}
          {stepCard('review', steps.length, 'Review', <>
            <div className="sm-table-wrap">
              <table className="sm-table"><tbody>
                <tr><td>{t('Agent')}</td><td /><td>{t(MODE_LABEL[p.mode])}</td></tr>
                {p.mode === 'competitor' && <tr><td>{t('Competitors')}</td><td /><td>{p.competitors.join(', ') || '–'}</td></tr>}
                <tr><td>{t('Regions')}</td><td /><td>{regions.map(regionLabel).join(', ') || '–'}</td></tr>
                <tr><td>{t('Language')}</td><td /><td>{ANALYSIS_LANGS.find(l => l.id === p.analysisLang)?.label}</td></tr>
                <tr><td>{p.mode === 'collection' ? t('Items') : t('Item')}</td><td /><td>
                  {p.mode === 'collection' ? p.items.map(i => t(ITEM_LABEL[i])).join(', ') : t(ITEM_LABEL[p.itemType])}</td></tr>
                <tr><td>{t('Target')}</td><td /><td>{agesOf(p.target).join(', ')} · {t(GENDER_LABEL[p.target.gender])}</td></tr>
                {p.direction && <tr><td>{p.mode === 'collection' ? t('Keyword') : t('Direction')}</td><td /><td>{p.direction.slice(0, 80)}</td></tr>}
              </tbody></table>
            </div>
            <div className="wizbar">
              {/* 고른 에이전트는 그대로 둔다 · 되돌리기가 화면까지 바꿔 버리면 되돌린 게 아니다 */}
              <button className="btn btn-ghost" onClick={() => setP({ ...DEFAULT_PARAMS, mode: p.mode })}>{t('Reset')}</button>
              <div className="wb-msg">{blocked ?? ''}</div>
            </div>
          </>)}
        </div>

        {/* ── 우측 · 실행 전 검토 (수량·시간 중심, 가격 없음) ───────── */}
        <aside className="runpanel">
          <h3>{t('Before you run')}</h3>
          <div className="rp-stats">
            <div className="rp-stat">
              <i>{pairCount}</i>
              <span>{t('designs')}</span>
              {conceptArt > 0 && <em>{tf('+ {n} concept images', { n: conceptArt })}</em>}
            </div>
            <div className="rp-stat">
              <i>{est.min}~{est.max}</i>
              <span>{t('minutes expected')}</span>
              <em>{deepOn ? t('deep research on') : t('research runs live')}</em>
            </div>
          </div>
          <p className="rp-split">
            {tf('research {a}~{b} min', { a: research.min, b: research.max })}
            <span> · </span>
            {tf('generation {a}~{b} min', { a: build.min, b: build.max })}
          </p>
          {/* 이 에이전트가 무엇을 내놓는지 · 모드마다 산출물이 다르다.
              QA 에서 컬렉션 사용자들이 "크롤링이 비어 있다" 고 감점했는데, 컬렉션은 원래
              경쟁사 크롤을 하지 않는다 — 화면이 미리 말해 주지 않아 생긴 오해였다. */}
          <ul className="rp-gives">
            {DELIVERABLES[p.mode].map(k => <li key={k}>{t(k)}</li>)}
          </ul>
          <div className="rp-rows">
            <div><span>{t('Agent')}</span><b>{t(MODE_LABEL[p.mode])}</b></div>
            <div><span>{t('Regions')}</span><b>{regions.map(regionLabel).join(', ') || '–'}</b></div>
            <div><span>{t('Language')}</span><b>{ANALYSIS_LANGS.find(l => l.id === p.analysisLang)?.label}</b></div>
            <div><span>{p.mode === 'collection' ? t('Items') : t('Item')}</span>
              <b>{p.mode === 'collection' ? p.items.map(i => t(ITEM_LABEL[i])).join(', ') || '–' : t(ITEM_LABEL[p.itemType])}</b></div>
            <div><span>{t('Target')}</span><b>{agesOf(p.target).join(', ')} · {t(GENDER_LABEL[p.target.gender])}</b></div>
          </div>
          {blocked && <p className="rp-block">{blocked}</p>}
          <button className="btn btn-primary rp-go" disabled={!!blocked} onClick={() => onStart(p)}>
            {t('Start the run')} <IcArrow />
          </button>
          <p className="hint">{t('Time varies with how many regions and competitors the agent has to cover.')}</p>
        </aside>
      </div>
    </div>
  )
}
