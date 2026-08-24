// ── 새 Run 위저드 ─────────────────────────────────────────────────
// 한 화면에 결정 열 개를 늘어놓으면 어느 것도 주인공이 되지 못한다.
// 그래서 질문 세 개로 나눈다: 무엇을 · 어떻게 조사할지 · 어디까지.
//
// 선택지는 아이콘 + 제목 + 한 줄로 읽는다. 고른 것만 accent 테두리와
// 체크 배지를 달고, 나머지는 조용히 둔다.
import { getLang, t, tf } from '../core/i18n'
import { useEffect, useMemo, useState } from 'react'
import { detectRuntime } from '../core/runtime'
import type { Runtime } from '../core/runtime'
import { userUploads, COATING_EN, DEFAULT_PARAMS, groupOf, LINE_PRESETS, METAL_EN, MODE_LABEL, MODE_SCOPE, STONE_EN, TAXONOMY, TYPE_LABEL } from '../core/types'
import type { LineProfile, Mode, RunParams, Stage, UploadRef } from '../core/types'
import { uploadName } from '../core/types'
import { clampToScope, cumulative, estimate, scopeCaps, scopeGets } from '../core/estimate'
import { Seg, Tag } from './bits'
import { designSVG, svgDataUri } from '../core/sketch'
import type { DesignSpec } from '../core/types'
import { ENGINES } from '../core/imageEngines'
import { loadLastParams } from '../core/store'
import { IcArrow, IcExternal, IcMoodboard, IcSeries, IcTrend } from './icons'

// 카드 안에서는 한 줄만 읽게 한다. 자세한 설명은 고른 뒤에 보여준다.
const MODE_SHORT: Record<Mode, string> = {
  trend: 'Research competitors and market trends',
  series: 'Carry on a series you already have',
  moodboard: 'Work only from a file you upload',
}
const MODE_ICON: Record<Mode, () => JSX.Element> = {
  trend: IcTrend, series: IcSeries, moodboard: IcMoodboard,
}

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
// 남아 있는 데모 샘플(sample_jewel_vermeilhoop)의 실제 산출물을 가리킨다.
// 샘플을 갈아엎을 때 이 파일들이 함께 지워지면 위저드 미리보기가 통째로 깨진다 —
// prune-samples 를 돌린 뒤에는 여기 네 경로가 살아 있는지 반드시 확인할 것.
const SCOPE_ART: Record<Stage, string | null> = {
  S1: null,
  S2: `${BASE}samples/4192799fa45373cae67a5fe5.webp`,   // 잉크 스케치
  S3: `${BASE}samples/b2661fcf609525c6cf4abcf8.webp`,   // 완성 렌더
  S4: `${BASE}samples/5ab3d77e5e10121019a125db.webp`,   // 착용 컷
  S5: `${BASE}samples/f425fc11e7d1817334939e03.webp`,   // 3D용 정사영 뷰
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

/** 지금까지 고른 것으로 그리는 미리보기.
 *  실제 실행 결과가 아니라 "무엇을 만들려는지" 를 눈으로 확인하는 용도다.
 *  스펙은 아직 없으므로 라인 프로필에서 재료만 가져오고 나머지는 대표값을 쓴다. */
function previewSpec(itemType: string, line: LineProfile): DesignSpec {
  const hasStone = line.stone !== 'none'
  return {
    design_id: 'preview', tier: 'core', category: 'jewelry', itemType,
    fields: {
      metal: METAL_EN[line.baseMetal] ?? '925 sterling silver',
      plating: line.coating === 'none' ? 'none' : COATING_EN[line.coating],
      target_weight_g: 2.2,
      stone_count: hasStone ? 3 : 0,
      stone_size_mm: 1.6,
      setting_type: hasStone ? 'bezel' : 'none',
      prong_count: 4,
      min_wall_thickness_mm: 1.0,
      chain_type: 'none',
      finish: 'polished',
      is_pair: false,
      is_new_mold: false,
      existing_mold_id: 'MLD-preview',
    },
    fieldsLocked: [],
  } as unknown as DesignSpec
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

/** 전문가 설정의 선택 칩 · 한 번 더 누르면 해제된다. 모르는 값은 비워 두는 게 원칙이라
 *  "선택 안 함"이 언제나 유효한 상태여야 한다. */
function PickRow<T extends string | number>({ label, options, value, onPick, format }: {
  label: string; options: readonly T[]; value: T | undefined
  onPick: (v: T | undefined) => void; format?: (v: T) => string
}) {
  return (
    <div className="stack">
      <span className="lbl">{label}</span>
      <div className="chiprow">
        {options.map(o => (
          <button key={String(o)} className={`pick ${value === o ? 'on' : ''}`}
            onClick={() => onPick(value === o ? undefined : o)}>
            {format ? format(o) : t(String(o))}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Wizard({ onStart }: { onStart: (p: RunParams) => void }) {
  const [p, setP] = useState<RunParams>(DEFAULT_PARAMS)
  // 에이전트 선택은 위저드의 한 항목이 아니라 그 앞의 결정이다.
  // 아래 항목들과 연결되는 값이 아니고, "무엇을 쓸지" 를 고르는 다른 층이다.
  const [agentPicked, setAgentPicked] = useState(false)
  // 지난 실행 설정 · 같은 값을 매번 다시 채우게 하지 않는다. 자료(업로드)는 빼고 설정만 온다.
  const last = useMemo(() => loadLastParams(), [])
  const [step, setStep] = useState(1)
  // 범위(endStage)를 바꾸면 그 뒤 단계의 설정은 의미를 잃는다. 값만 남겨 두면
  // "조사만" 인데 3D 쇼룸이 켜져 있는 화면이 나온다 — 저장할 때 같이 정리한다.
  const set = <K extends keyof RunParams>(k: K, v: RunParams[K]) =>
    setP(prev => clampToScope({ ...prev, [k]: v }))
  const [rt, setRt] = useState<Runtime | null>(null)
  useEffect(() => { detectRuntime().then(setRt) }, [])
  const api = rt?.kind === 'live' ? { keyPresent: rt.keyPresent, cachedImages: rt.cachedImages } : null
  const isStatic = rt?.kind === 'static'
  const est = useMemo(() => estimate(p), [p])
  const cum = useMemo(() => cumulative(p), [p])
  const scope = MODE_SCOPE[p.mode]
  // 앱이 떠 둔 PDF 쪽 그림은 "올린 파일"이 아니다. 여덟 장 기준도 사용자가 올린 것으로 센다.
  const nSeriesFiles = userUploads(p.series.archiveFiles).length
  const [draft, setDraft] = useState('')
  const [more, setMore] = useState(false)
  const [breakdown, setBreakdown] = useState(false)
  const setTrend = (patch: Partial<RunParams['trend']>) => setP(v => ({ ...v, trend: { ...v.trend, ...patch } }))
  const setSeries = (patch: Partial<RunParams['series']>) => setP(v => ({ ...v, series: { ...v.series, ...patch } }))
  const setMood = (patch: Partial<RunParams['moodboard']>) => setP(v => ({ ...v, moodboard: { ...v.moodboard, ...patch } }))

  // 업로드 · 파일 내용을 서버에 두고 해시만 받아 온다. 이름만 들고 있으면 나중에 읽을 것이 없다.
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  /** PDF 는 페이지를 그림으로도 떠 둔다. 신호에 "p.14" 라고만 적혀 있으면
   *  그 페이지를 직접 열어 봐야 하는데, 옆에 그림이 있으면 그럴 필요가 없다. */
  const pdfPageShots = async (file: File): Promise<{ name: string; dataUrl: string }[]> => {
    try {
      const pdfjs = await import('pdfjs-dist')
      // 워커는 같은 번들에서 끌어온다 (CDN 을 쓰면 오프라인·CSP 에서 깨진다)
      const worker = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
      pdfjs.GlobalWorkerOptions.workerPort = worker
      const buf = await file.arrayBuffer()
      // JPEG2000·JBIG2 이미지를 품은 PDF 는 wasm 이 있어야 페이지를 그린다.
      // 경로를 주지 않으면 폴백을 찾다가 페이지 하나에서 한참 붙잡힌다.
      const assets = `${import.meta.env.BASE_URL || '/'}pdfjs/`
      const doc = await pdfjs.getDocument({
        data: buf, wasmUrl: assets, cMapUrl: `${assets}cmaps/`, cMapPacked: true,
      }).promise
      const out: { name: string; dataUrl: string }[] = []
      for (let n = 1; n <= Math.min(doc.numPages, 8); n++) {
        const page = await doc.getPage(n)
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min(900 / base.width, 1.6)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width; canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
        // 한 페이지가 붙잡히면 거기서 멈추고 그때까지 그린 것만 쓴다
        const task = page.render({ canvas, canvasContext: ctx, viewport })
        const done = await Promise.race([
          task.promise.then(() => true),
          new Promise<boolean>(res => setTimeout(() => res(false), 12_000)),
        ])
        if (!done) { try { task.cancel() } catch { /* 이미 끝났으면 무시 */ } break }
        out.push({ name: `${file.name.replace(/\.pdf$/i, '')} p.${n}.webp`, dataUrl: canvas.toDataURL('image/webp', 0.72) })
      }
      return out
    } catch { return [] }   // 페이지 그림은 덤이다. 실패해도 판독은 그대로 간다.
  }

  const sendUploads = async (list: File[]): Promise<UploadRef[]> => {
    if (!list.length) return []
    setUploading(true); setUploadError('')
    try {
      const files = await Promise.all(list.map(f => new Promise<{ name: string; dataUrl: string }>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res({ name: f.name, dataUrl: String(r.result) })
        r.onerror = () => rej(new Error(f.name))
        r.readAsDataURL(f)
      })))
      // 페이지 그림은 있으면 좋은 것이다. 렌더가 멈추더라도 업로드까지 붙잡지 못하게 시간을 끊는다.
      for (const f of list.filter(x => x.type === 'application/pdf')) {
        const shots = await Promise.race([
          pdfPageShots(f),
          new Promise<{ name: string; dataUrl: string }[]>(res => setTimeout(() => res([]), 45_000)),
        ])
        files.push(...shots)
      }
      const r = await fetch('/api/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error ?? `upload ${r.status}`)
      // 앞쪽 list.length 개가 사용자가 고른 파일이고, 뒤는 우리가 떠 둔 PDF 쪽 그림이다.
      // 표시하지 않으면 PDF 한 장이 "9개 업로드"로 세어진다.
      const refs = j.files as UploadRef[]
      return refs.map((f, i) => i < list.length ? f : { ...f, derived: true })
    } catch (e) {
      setUploadError(t('Could not read that file') + ' · ' + String((e as Error).message).slice(0, 80))
      return []
    } finally { setUploading(false) }
  }
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
    : p.mode === 'series' ? (nSeriesFiles === 0 ? 'Upload your series designs'
      : !p.series.valueStatement.trim() ? 'Describe what the series stands for' : null)
    : (p.moodboard.files.length === 0 ? 'Upload a PDF' : null)
  // 2단계에서 막히는 조건은 2단계에서 알려야 한다
  const stepBlocked = step === 2 && !isStatic ? blocked : null

  const curGroup = groupOf(p.category, p.itemType)
  const [rc, rp] = p.tierRatio
  const rsum = p.tierRatio.reduce((a, b) => a + b, 0)
  const perTier = (r: number) => Math.round(p.sketchCount * r / rsum)
  const designCount = Math.max(1, Math.round(p.sketchCount * p.renderRatio))
  // 라인 프로필 · 옛 저장본에는 없어 기본값으로 채운다
  const line: LineProfile = p.line ?? { preset: 'sterling_core', baseMetal: '925_silver', coating: 'rhodium', stone: 'none' }
  // 범위가 무엇을 가능하게 하는지 · 화면의 잠금과 파라미터 정리가 같은 값을 본다
  const caps = scopeCaps(p.endStage)
  /** 범위 밖 설정을 감싸 흐리게 하고 이유를 붙인다. 지워 버리면 무엇을 잃었는지 모른다. */
  const Locked = ({ on, why, children }: { on: boolean; why: string; children: JSX.Element }) => (
    on ? children : (
      <div className="lockedbox" title={t(why)}>
        {children}
        <span className="lk-why">{t(why)}</span>
      </div>
    )
  )

  const agentDesc: Record<Mode, string> = {
    trend: 'Starts from the market. Researches competitor products and season trends, then designs against what it found.',
    series: 'Starts from your archive. Reads what repeats across the designs you upload and carries it forward.',
    moodboard: 'Starts from your document. Reads the file you upload and works only from what is in it, page by page.',
  }

  // ── 0단계 · 어떤 에이전트를 쓸지. 아래 항목들과 이어지는 값이 아니라 그 앞의 결정이라 화면을 나눈다.
  if (!agentPicked) {
    return (
      <div className="wizard">
        <div className="agentpick">
          <h1 className="ask">{t('Which agent should do this?')}</h1>
          <p className="note top">{t('Each one starts from a different place. That choice decides what gets researched and what the result can be explained by.')}</p>
          <div className="agentgrid">
            {(Object.keys(MODE_LABEL) as Mode[]).map(m => {
              const Icon = MODE_ICON[m]
              return (
                <button key={m} className={`agentcard ${p.mode === m ? 'on' : ''}`}
                  onClick={() => { set('mode', m); setAgentPicked(true); setStep(1) }}>
                  <span className="ag-ic"><Icon /></span>
                  <span className="ag-t">{t(MODE_LABEL[m])}</span>
                  <span className="ag-d">{t(agentDesc[m])}</span>
                  <span className="ag-go">{t('Use this agent')} <IcArrow /></span>
                </button>
              )
            })}
          </div>
          {last && (
            <button className="lastrun" onClick={() => {
              setP(clampToScope({ ...last, series: { ...last.series, archiveFiles: [] }, moodboard: { ...last.moodboard, files: [] } }))
              setAgentPicked(true); setStep(1)
            }}>
              <span className="lr-t">{t('Pick up your last setup')}</span>
              <span className="lr-d">
                {t(MODE_LABEL[last.mode])} · {t(TYPE_LABEL[last.itemType] ?? last.itemType)}
                {last.line && <> · {t(LINE_PRESETS.find(x => x.id === last.line!.preset)?.label ?? last.line.preset)}</>}
                {' · '}{t(SCOPE_NAME[last.endStage])}
              </span>
              <span className="lr-n">{t('Files are not carried over — only the settings.')}</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="wizard">
      <div className="wizard-inner">
        <div className="wcol">
          {/* 어떤 에이전트를 세팅하는 중인지 항상 보인다. 요약 표 안에 있으면 눈에 안 들어온다. */}
          <div className="agentbar">
            <span className="ab-ic">{(() => { const I = MODE_ICON[p.mode]; return <I /> })()}</span>
            <span className="ab-t">{t(MODE_LABEL[p.mode])} {t('agent')}</span>
            <span className="ab-d">{t(MODE_SHORT[p.mode])}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setAgentPicked(false)}>{t('Change agent')}</button>
          </div>
          {isStatic && (
            <div className="staticnote">
              <div className="sn-body">
                <b>{t('Research and generation, in one coherent flow.')}</b>
                <p>{t('This hosted page is read-only. Everything a full run produced is saved. Open History in the left rail to walk through a finished analysis, its board, the forecast and the PDFs.')}</p>
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
            {/* 계열 5개 + 유형 4개 = 버튼 아홉 개였다. 하나의 드롭다운으로 접으면
                고를 것이 하나로 줄고, 계열이 유형의 부모라는 관계도 그대로 보인다. */}
            <section className="sect">
              <h2>{t('What are we making?')}</h2>
              <div className="stack">
                <span className="lbl">{t('Item')}</span>
                <div className="inrow">
                  <select className="input sel" value={p.itemType}
                    onChange={e => set('itemType', e.target.value)}>
                    {TAXONOMY.jewelry.map(g => (
                      <optgroup key={g.id} label={t(g.label)}>
                        {g.types.map(ty => (
                          <option key={ty.id} value={ty.id}>{t(ty.label)}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <span className="hint">
                    {t(curGroup?.label ?? '')} · {t('N molds in the library. Core designs must reuse an existing mold.').replace('N', '22')}
                  </span>
                </div>
              </div>
            </section>

            {/* 프리셋은 금속·도금·스톤을 한 번에 정한다. 그 값이 다음 단계의 조사 범위를
                통째로 바꾸므로, 조정 항목들보다 먼저 와야 한다. */}
            <section className="sect">
              <h2>{t('Quick preset')}</h2>
              <p className="note top">{t('Sets the metal, plating and stone in one go. You can adjust any of it in the next step.')}</p>
              <div className="chiprow">
                {LINE_PRESETS.map(pr => (
                  <button key={pr.id} className={`pick ${line.preset === pr.id ? 'on' : ''}`}
                    onClick={() => set('line', { preset: pr.id, ...pr.line })}>{t(pr.label)}</button>
                ))}
              </div>
              <div className="preview">
                <div className="pv-art">
                  <img src={svgDataUri(designSVG(previewSpec(p.itemType, line), 'sketch', 'front'))} alt="" />
                </div>
                <div className="pv-txt">
                  <b>{t(TYPE_LABEL[p.itemType] ?? p.itemType)}</b>
                  <span>{t(METAL_EN[line.baseMetal])}
                    {line.coating !== 'none' && <> · {t(COATING_EN[line.coating])}</>}
                    {line.stone !== 'none' && <> · {t(STONE_EN[line.stone])}</>}
                  </span>
                  <span className="hint">{t('A rough outline of what you are setting up, not a result.')}</span>
                </div>
              </div>
            </section>
          </>)}

          {/* ── 2단계 · 어떻게 조사할지 ──────────────────────────── */}
          {step === 2 && (<>
            {p.mode === 'trend' && (<>
              {/* 라인 구성 · 경쟁 브랜드보다 먼저다. 925실버+무스톤과 925실버+랩다이아는
                  경쟁군·가격 구조·소비자 기대가 완전히 다른 시장이라, 라인이 정해져야
                  경쟁사도 트렌드도 같은 시장 안에서 조사된다. */}
              <section className="sect">
                <h2>{t('What line is this?')}</h2>
                <p className="note top">{t('Metal and stone are separate axes. The research stays inside this market.')}</p>
                {/* 프리셋 선택은 1단계에서 끝났다. 여기서는 그 결과를 보여 주고 조정만 한다 —
                    같은 칩을 두 화면에 두면 어느 쪽이 진짜인지 알 수 없다. */}
                <div className="fromreset">
                  <span className="fr-t">{t('From your preset')}</span>
                  <b>{line.preset === 'custom'
                    ? t('Adjusted by hand')
                    : t(LINE_PRESETS.find(x => x.id === line.preset)?.label ?? line.preset)}</b>
                  <button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>{t('Change preset')}</button>
                </div>
                <div className="stack">
                  <span className="lbl">{t('Base metal')}</span>
                  <Seg options={['925_silver', '14k_gold', '18k_gold', 'gold_filled', 'plated_brass'] as const}
                    value={line.baseMetal} onChange={v => set('line', { ...line, preset: 'custom', baseMetal: v })}
                    format={v => t(METAL_EN[v])} />
                </div>
                <div className="stack">
                  <span className="lbl">{t('Coating')}</span>
                  <Seg options={['none', 'rhodium', 'gold_vermeil', 'gold_plated', 'oxidized'] as const}
                    value={line.coating} onChange={v => set('line', { ...line, preset: 'custom', coating: v })}
                    format={v => v === 'none' ? t('None') : t(COATING_EN[v])} />
                </div>
                <div className="stack">
                  <span className="lbl">{t('Stone')}</span>
                  <Seg options={['none', 'cz', 'lab_diamond', 'natural_diamond', 'ruby', 'sapphire', 'pearl', 'crystal'] as const}
                    value={line.stone} onChange={v => set('line', { ...line, preset: 'custom', stone: v })}
                    format={v => v === 'none' ? t('No stone') : t(STONE_EN[v])} />
                </div>

                {/* 전문가 설정 · 아는 값만 채운다. 프로그램 문자열에 실려 조사 프롬프트와
                    캐시 키가 함께 갈라지므로, 값을 바꾸면 조사도 다시 돈다. */}
                {(line.coating !== 'none' || line.stone !== 'none') && (
                  <details className="expertbox">
                    <summary>{t('Expert settings')}<span className="hint"> · {t('plating microns, diamond 4Cs, pearl grading, total carat weight')}</span></summary>
                    {line.coating !== 'none' && (
                      <PickRow label={t('Plating thickness')} options={[0.5, 1, 2, 2.5, 3] as const}
                        value={line.coatingMicrons as 0.5 | 1 | 2 | 2.5 | 3 | undefined}
                        onPick={v => set('line', { ...line, coatingMicrons: v })}
                        format={v => `${v}μm`} />
                    )}
                    {(line.stone === 'lab_diamond' || line.stone === 'natural_diamond') && (<>
                      <PickRow label={t('Diamond colour')} options={['D-F', 'G-H', 'I-J'] as const}
                        value={line.stoneGrade?.color as 'D-F' | 'G-H' | 'I-J' | undefined}
                        onPick={v => set('line', { ...line, stoneGrade: { ...line.stoneGrade, color: v } })} />
                      <PickRow label={t('Clarity')} options={['VVS', 'VS', 'SI'] as const}
                        value={line.stoneGrade?.clarity as 'VVS' | 'VS' | 'SI' | undefined}
                        onPick={v => set('line', { ...line, stoneGrade: { ...line.stoneGrade, clarity: v } })} />
                      <PickRow label={t('Cut')} options={['excellent', 'very good', 'good'] as const}
                        value={line.stoneGrade?.cut as 'excellent' | 'very good' | 'good' | undefined}
                        onPick={v => set('line', { ...line, stoneGrade: { ...line.stoneGrade, cut: v } })} />
                      <PickRow label={t('Centre stone')} options={[0.1, 0.3, 0.5, 1] as const}
                        value={line.stoneGrade?.caratCt as 0.1 | 0.3 | 0.5 | 1 | undefined}
                        onPick={v => set('line', { ...line, stoneGrade: { ...line.stoneGrade, caratCt: v } })}
                        format={v => `${v}ct`} />
                    </>)}
                    {line.stone === 'pearl' && (<>
                      <PickRow label={t('Pearl type')} options={['freshwater', 'akoya', 'south sea', 'tahitian'] as const}
                        value={line.pearl?.type as 'freshwater' | 'akoya' | 'south sea' | 'tahitian' | undefined}
                        onPick={v => set('line', { ...line, pearl: { ...line.pearl, type: v } })} />
                      <PickRow label={t('Pearl size')} options={[5, 6, 7, 8, 9, 10, 12] as const}
                        value={line.pearl?.sizeMm as 5 | 6 | 7 | 8 | 9 | 10 | 12 | undefined}
                        onPick={v => set('line', { ...line, pearl: { ...line.pearl, sizeMm: v } })}
                        format={v => `${v}mm`} />
                      <PickRow label={t('Shape')} options={['round', 'near-round', 'oval', 'baroque'] as const}
                        value={line.pearl?.shape as 'round' | 'near-round' | 'oval' | 'baroque' | undefined}
                        onPick={v => set('line', { ...line, pearl: { ...line.pearl, shape: v } })} />
                      <PickRow label={t('Body colour')} options={['white', 'cream', 'golden', 'grey', 'black'] as const}
                        value={line.pearl?.color as 'white' | 'cream' | 'golden' | 'grey' | 'black' | undefined}
                        onPick={v => set('line', { ...line, pearl: { ...line.pearl, color: v } })} />
                      <PickRow label={t('Luster')} options={['excellent', 'good', 'fair'] as const}
                        value={line.pearl?.luster as 'excellent' | 'good' | 'fair' | undefined}
                        onPick={v => set('line', { ...line, pearl: { ...line.pearl, luster: v } })} />
                      <PickRow label={t('Surface')} options={['clean', 'lightly spotted', 'spotted'] as const}
                        value={line.pearl?.surface as 'clean' | 'lightly spotted' | 'spotted' | undefined}
                        onPick={v => set('line', { ...line, pearl: { ...line.pearl, surface: v } })} />
                      <PickRow label={t('Nacre')} options={['thick', 'medium', 'thin'] as const}
                        value={line.pearl?.nacre as 'thick' | 'medium' | 'thin' | undefined}
                        onPick={v => set('line', { ...line, pearl: { ...line.pearl, nacre: v } })} />
                    </>)}
                    {line.stone !== 'none' && (
                      <PickRow label={t('Total carat weight, max')} options={[0.25, 0.5, 1, 2] as const}
                        value={line.tcwMaxCt as 0.25 | 0.5 | 1 | 2 | undefined}
                        onPick={v => set('line', { ...line, tcwMaxCt: v })}
                        format={v => `≤ ${v}ct`} />
                    )}
                    {/* 컴플라이언스는 다중 선택 · 수출 라인이면 셋 다 켜는 게 보통이다 */}
                    <div className="stack">
                      <span className="lbl">{t('Compliance')}</span>
                      <div className="chiprow">
                        {(['nickel_free', 'cadmium_free', 'lead_free'] as const).map(c => {
                          const on = (line.compliance ?? []).includes(c)
                          return (
                            <button key={c} className={`pick ${on ? 'on' : ''}`}
                              onClick={() => set('line', {
                                ...line,
                                compliance: on ? (line.compliance ?? []).filter(x => x !== c)
                                  : [...(line.compliance ?? []), c],
                              })}>
                              {t(c === 'nickel_free' ? 'Nickel-safe' : c === 'cadmium_free' ? 'Cadmium-free' : 'Lead-free')}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <p className="note">{t('Leave anything you do not know empty. Unknown is a valid answer; a guessed grade poisons the research.')}</p>
                  </details>
                )}
                <p className="note">{t('Primary competitors come from this exact program. Other tiers are kept as reference, not mixed in.')}</p>
              </section>

              <section className="sect">
                <h2>{t('Competitor brands')}</h2>
                <p className="note top">{t('Their best sellers and the trends around them get searched on the web.')}</p>
                <div className="chiplist">
                  {p.trend.competitors.map(c => (
                    <span className="chip-in" key={c}>
                      {c}
                      <button onClick={() => setP(v => ({ ...v, trend: { ...v.trend, competitors: v.trend.competitors.filter(x => x !== c) } }))} aria-label={tf('Remove {name}', { name: c })}>{t('Remove')}</button>
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
                    onChange={v => setTrend({ priceBand: v })} format={v => t(v)} />
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
                  <input className="input" style={{ maxWidth: 260 }} placeholder={t('e.g. Arc line')}
                    value={p.series.seriesName} onChange={e => setSeries({ seriesName: e.target.value })} />
                </div>
                <label className="dropzone">
                  <input type="file" multiple accept="image/*" hidden disabled={uploading}
                    onChange={async e => {
                      const picked = await sendUploads(Array.from(e.target.files ?? []))
                      if (picked.length) setSeries({ archiveFiles: [...p.series.archiveFiles, ...picked] })
                    }} />
                  {uploading ? t('Uploading') : t('Upload past designs from this series')}
                  <span className="dz-sub">{t('8 or more, so the constants can be told apart')}</span>
                </label>
                {uploadError && <p className="note" style={{ color: 'var(--warn)' }}>{uploadError}</p>}
                {nSeriesFiles > 0 && (
                  <div className="chiplist quick">
                    {userUploads(p.series.archiveFiles).slice(0, 6).map((f, i) => <span className="chip-in" key={i}>{uploadName(f)}</span>)}
                    {nSeriesFiles > 6 && <span className="hint">{tf('+{n} more', { n: nSeriesFiles - 6 })}</span>}
                  </div>
                )}
                <div className="chiplist quick">
                  <Tag kind={nSeriesFiles >= 8 ? 'ok' : 'warn'}>
                    {tf('{n} files', { n: nSeriesFiles })} · {nSeriesFiles >= 8 ? t('enough to separate constants') : t('need 8 or more')}
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
                    onChange={v => setSeries({ trendSearch: v === 'On' })} format={v => t(v)} />
                </div>
                <p className="note">{t('The only outside research in this mode')}</p>
              </section>
            </>)}

            {p.mode === 'moodboard' && (
              <section className="sect">
                <h2>{t('Your file')}</h2>
                <label className="dropzone">
                  <input type="file" multiple accept="application/pdf" hidden disabled={uploading}
                    onChange={async e => {
                      const picked = await sendUploads(Array.from(e.target.files ?? []))
                      if (picked.length) setMood({ files: [...p.moodboard.files, ...picked] })
                    }} />
                  {uploading ? t('Uploading') : t('Upload your trend report or moodboard PDF')}
                  <span className="dz-sub">{t('Nothing outside these files is used')}</span>
                </label>
                {uploadError && <p className="note" style={{ color: 'var(--warn)' }}>{uploadError}</p>}
                {/* 앱이 떠 둔 PDF 쪽 그림은 목록에 세우지 않는다. 지울 때는 그 PDF 에서 나온
                    쪽 그림도 함께 지운다 — 원본만 빠지고 파생본이 남으면 없는 문서를 인용하게 된다. */}
                {userUploads(p.moodboard.files).length > 0 && (
                  <div className="chiplist quick">
                    {userUploads(p.moodboard.files).map((f, i) => {
                      const stem = uploadName(f).replace(/\.pdf$/i, '')
                      return (
                        <span className="chip-in" key={i}>{uploadName(f)}
                          <button aria-label={t('Remove')} onClick={() => setMood({
                            files: p.moodboard.files.filter(x =>
                              x !== f && !(typeof x === 'object' && x.derived && x.name.startsWith(`${stem} p.`))),
                          })}>{t('Remove')}</button>
                        </span>
                      )
                    })}
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
                        <span className="sc-g">{t(scopeGets(st, p.mode))}</span>
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
              <Locked on={caps.sketches} why="Research only · no sketches are made">
              <div className="stack">
                <span className="lbl">{t('Sketches')}</span>
                <div className="inrow">
                  <Seg options={[6, 12, 18, 24] as const} value={p.sketchCount} onChange={v => set('sketchCount', v)} />
                  <span className="hint">{t('Core')} {perTier(rc)} · {t('Push')} {perTier(rp)} · {t('Signature')} {p.sketchCount - perTier(rc) - perTier(rp)}</span>
                </div>
              </div>
              </Locked>
              <Locked on={caps.renders} why="Stops before the renders, so this changes nothing">
              <div className="stack">
                <span className="lbl">{t('Designs per sketch')}</span>
                <div className="inrow">
                  <Seg options={[1, 2, 3, 4] as const} value={p.designsPerSketch ?? 2} onChange={v => set('designsPerSketch', v)} />
                  <span className="hint">{designCount * (p.designsPerSketch ?? 2)} {t('designs in total, each from a trend-based prompt')}</span>
                </div>
              </div>
              </Locked>
              <Locked on={caps.campaign} why="Top picks are chosen at the campaign stage">
              <div className="stack">
                <span className="lbl">{t('Top picks')}</span>
                <div className="inrow">
                  <Seg options={[1, 2, 3, 4, 5] as const} value={p.topN as any} onChange={v => set('topN', Number(v))} />
                  <span className="hint">{t('At least one from each tier')}</span>
                </div>
              </div>
              </Locked>
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
              <Locked on={caps.sketches} why="Research only · there are no sketches to review">
              <label className="checkline">
                <input type="checkbox" checked={p.approvalGate} onChange={e => set('approvalGate', e.target.checked)} />
                {t('Show me the sketches before rendering')}
              </label>
              </Locked>
            </section>

            {/* 폴드는 "안에 무엇이 있는지" 를 말로 알려야 열어 볼지 판단할 수 있다.
                숫자만 늘어놓으면 무엇을 다시 쓰는 값인지 읽히지 않는다. */}
            <button className={`moretoggle ${more ? 'open' : ''}`} onClick={() => setMore(v => !v)}
              aria-expanded={more}>
              <span className="mt-cv" aria-hidden="true">
                <svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span className="mt-t">{t('Advanced settings')}</span>
              <span className="mt-sum">{t('Tier mix, how many move on, extra views and colorways, campaign cuts, 3D, image model and cap')}</span>
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
              <Locked on={caps.renders} why="Stops before the renders, so this changes nothing">
              <div className="stack"><span className="lbl">{t('To render')}</span>
                <div className="inrow">
                  <Seg options={[0.25, 0.5, 0.75] as const} value={p.renderRatio} onChange={v => set('renderRatio', v)} format={v => `${Number(v) * 100}%`} />
                  <span className="hint">{designCount} {t('move on')}</span>
                </div>
              </div>
              </Locked>
              <Locked on={caps.renders} why="Stops before the renders, so this changes nothing">
              <div className="stack"><span className="lbl">{t('Views')}</span>
                <div className="inrow">
                  <Seg options={[1, 3, 4] as const} value={p.viewCount} onChange={v => set('viewCount', v)} />
                  <span className="lbl sub">{t('Colorways')}</span>
                  <Seg options={[0, 1, 2, 3] as const} value={p.colorwayCount} onChange={v => set('colorwayCount', v)} />
                </div>
              </div>
              </Locked>
              <Locked on={caps.renders} why="Stops before the renders, so this changes nothing">
              <div className="stack"><span className="lbl">{t('Variations')}</span>
                <div className="inrow">
                  <Seg options={[0, 2, 3, 4, 6, 8] as const} value={p.variationCount} onChange={v => set('variationCount', v)} />
                  <span className="hint">{t('Branches off one sketch, one axis changed each')}</span>
                </div>
              </div>
              </Locked>
              <Locked on={caps.campaign} why="Stops before the campaign shots">
              <div className="stack"><span className="lbl">{t('Campaign cuts')}</span>
                <div className="inrow">
                  <Seg options={[0, 2, 4, 6] as const} value={p.campaignShots} onChange={v => set('campaignShots', v)} />
                  <span className="hint">{t('Per selected design. Half worn on a model, half staged.')}</span>
                </div>
              </div>
              </Locked>
              <Locked on={caps.model3d} why="Only the 3D showroom scope builds models">
              <div className="stack"><span className="lbl">{t('3D showroom')}</span>
                <div className="inrow">
                  <Seg options={['Off', 'On'] as const} value={p.make3d ? 'On' : 'Off'} onChange={v => set('make3d', v === 'On')} format={v => t(v)} />
                  <span className="hint">{t('Only the final picks are built in 3D. Turn and download them on the board.')}</span>
                </div>
              </div>
              </Locked>
              <div className="stack"><span className="lbl">{t('Model')}</span>
                <div className="opts two tight">
                  {(['fast', 'detail'] as const).map(id => (
                    <button key={id} className={`opt ${p.imageEngine === id ? 'on' : ''}`}
                      onClick={() => set('imageEngine', id)}>
                      <span className="o-t">{t(ENGINES[id].label)}</span>
                      <span className="o-d">{t(ENGINES[id].blurb)}</span>
                      <span className="o-m">${ENGINES[id].usdPerImage.toFixed(3)} · {tf('{s}s each', { s: ENGINES[id].secPerImage })}</span>
                      {p.imageEngine === id && <Badge />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="stack"><span className="lbl">{t('Image cap')}</span>
                <div className="inrow">
                  <Seg options={[0, 6, 12, 24, 48] as const} value={p.imageBudget}
                    onChange={v => set('imageBudget', v)}
                    format={v => v === 0 ? t('None') : `${v}`} />
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
                        <td>{s.images > 0 ? (s.real < s.images ? tf('{real} of {total}', { real: s.real, total: s.images }) : tf('{n} imgs', { n: s.images })) : ''}</td>
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
