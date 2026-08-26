// ── 라이브러리 · 지난 분석과 진행 중 분석 ────────────────────────────
// 흰 바탕의 갤러리 카드: 큰 정사각 썸네일 → 제목·에이전트 → 메타 한 줄 →
// 분석/보드 링크와 별. 삭제는 ⋯ 안으로 숨긴다(실수로 누르기엔 무거운 동작이다).
// 실행을 시작하면 맨 앞에 "진행 중" 카드가 생겨 단계 흐름이 실시간으로 보인다.
import { t, tf } from '../core/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RunRecord } from '../core/store'
import { deleteRun, listRuns, toggleFavorite } from '../core/store'
import type { RunState, Stage } from '../core/types'
import { agesOf, ITEM_LABEL, MODE_LABEL, STAGE_LABELS, regionsLabel } from '../core/types'

type Filter = 'all' | 'favorite'

const STAGES: Stage[] = ['S1', 'S2', 'S3', 'S4', 'S5']

/** 진행 중 카드 · 단계 흐름과 경과 */
function RunningCard({ st, onOpen }: { st: RunState; onOpen: () => void }) {
  const labels = STAGE_LABELS[st.params.mode]
  const startedAt = st.logs[0]?.t
  const [, tick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => tick(v => v + 1), 30_000)
    return () => clearInterval(iv)
  }, [])
  const elapsed = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 60_000)) : 0
  return (
    <button className="libcard running" onClick={onOpen}>
      <div className="lc-runhead">
        <span className="lc-spin" aria-hidden="true" />
        <b>{t('Running now')}</b>
        <span className="lc-elapsed">{tf('{n} min elapsed', { n: elapsed })}</span>
      </div>
      <div className="lc-title">
        {st.params.mode === 'collection'
          ? st.params.direction.slice(0, 22)
          : t(ITEM_LABEL[st.params.itemType] ?? st.params.itemType)}
        <span className="lc-sub">{t(MODE_LABEL[st.params.mode])}</span>
      </div>
      <div className="lc-flow">
        {STAGES.map((s, i) => {
          const status = st.stageStatus[s]
          return (
            <span key={s} className={`lc-step ${status}`}>
              {t(labels[s])}
              {i < STAGES.length - 1 && <i aria-hidden="true">›</i>}
            </span>
          )
        })}
      </div>
      <p className="hint">{st.logs[st.logs.length - 1]?.text.slice(0, 80)}</p>
    </button>
  )
}

export default function Library({ onOpen, onCreate, account, filter: initial = 'all', running, onOpenRunning }: {
  onOpen: (rec: RunRecord, view: 'run' | 'board') => void
  /** 맨 앞의 "새로 만들기" 카드 · 레일의 새로 만들기와 같은 일을 한다 */
  onCreate: () => void
  /** 로그인한 계정 · 있으면 이 사람 것으로 서버에 남는다는 사실을 밝힌다 */
  account?: { id: string; name?: string } | null
  filter?: Filter
  /** 지금 돌고 있는 실행 · 있으면 맨 앞에 진행 카드가 선다 */
  running?: RunState | null
  onOpenRunning?: () => void
}) {
  const [tick, setTick] = useState(0)
  const [filter, setFilter] = useState<Filter>(initial)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const runs = useMemo(() => listRuns(), [tick])
  const shown = filter === 'favorite' ? runs.filter(r => r.favorite) : runs

  // 바깥 클릭으로 ⋯ 메뉴 닫기
  useEffect(() => {
    if (!menuFor) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menuFor])

  const empty = !runs.length && !(running && !running.finished)

  return (
    <div className="libwrap">
      <div className="libhead">
        <div>
          <h1>{t('History')}</h1>
          <p className="lead">
            {t('Every analysis you have run. Open one to see its result and board.')}
            {account && <em className="lib-acct">{tf('Saved to {name}', { name: account.name ?? account.id })}</em>}
          </p>
        </div>
        <div className="chiprow" style={{ flex: 'none' }}>
          <button className={`pick sm ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
            {tf('All {n}', { n: runs.length })}
          </button>
          <button className={`pick sm ${filter === 'favorite' ? 'on' : ''}`} onClick={() => setFilter('favorite')}>
            {tf('Starred {n}', { n: runs.filter(r => r.favorite).length })}
          </button>
        </div>
      </div>

      <div className="libgrid">
        {/* 가장 왼쪽은 언제나 새로 만들기 · 내역이 비어 있어도 여기서 시작할 수 있다 */}
        <button className="libcard newcard" onClick={onCreate}>
          <span className="nc-plus" aria-hidden="true">+</span>
          <span className="nc-t">{t('Create New')}</span>
        </button>
        {running && !running.finished && onOpenRunning && (
          <RunningCard st={running} onOpen={onOpenRunning} />
        )}
        {empty && <div className="libcard hintcard">{t('Run the agent once and it will show up here.')}</div>}
          {shown.map(r => {
            const st = r.state
            const made = st.pairs.filter(p => p.versions.length > 0).length
            return (
              <div className="libcard" key={r.id}>
                <button className="lc-thumb" onClick={() => onOpen(r, 'run')}>
                  {r.thumb
                    ? <img src={r.thumb} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    : <span className="lc-nothumb">{t('No image')}</span>}
                  {st.sample && <span className="lc-badge">{t('Sample')}</span>}
                </button>
                <div className="lc-body">
                  <div className="lc-title">
                    {st.params.mode === 'collection'
                      ? st.params.direction.slice(0, 22)
                      : t(ITEM_LABEL[st.params.itemType] ?? st.params.itemType)}
                    <span className="lc-sub">{t(MODE_LABEL[st.params.mode])}</span>
                  </div>
                  <div className="lc-meta">
                    <span>{regionsLabel(st.params)} · {tf('{n} designs', { n: made })}</span>
                    <i aria-hidden="true" />
                    <span>{agesOf(st.params.target).join(', ')}</span>
                    <span className="lc-date">{new Date(r.savedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="lc-acts">
                    <button className="lc-link" onClick={() => onOpen(r, 'run')}>{t('Analysis')}</button>
                    <button className="lc-link" onClick={() => onOpen(r, 'board')}>{t('Board')}</button>
                    <span className="lc-gap" />
                    <button className={`starbtn ${r.favorite ? 'on' : ''}`}
                      title={r.favorite ? t('Remove star') : t('Star')}
                      onClick={() => { toggleFavorite(r.id); setTick(v => v + 1) }}>
                      <svg viewBox="0 0 20 20" width="15" height="15"
                        fill={r.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                        <path d="M10 2.6l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L2.5 8.1l5.2-.8z" />
                      </svg>
                    </button>
                    <div className="lc-more" ref={menuFor === r.id ? menuRef : undefined}>
                      <button className="lc-morebtn" aria-label={t('More')}
                        onClick={() => setMenuFor(m => m === r.id ? null : r.id)}>⋯</button>
                      {menuFor === r.id && (
                        <div className="lc-menu">
                          {!st.sample ? (
                            <button onClick={() => { deleteRun(r.id); setMenuFor(null); setTick(v => v + 1) }}>{t('Delete')}</button>
                          ) : (
                            <span className="hint">{t('Samples stay')}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
