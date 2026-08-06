// ── Library · 지난 Run을 카드로 보고 다시 연다 ────────────────────────
import { t } from '../core/i18n'
import { useMemo, useState } from 'react'
import type { RunRecord } from '../core/store'
import { deleteRun, listRuns, toggleFavorite } from '../core/store'
import { CAT_LABEL, MODE_LABEL, TIER_LABEL, TYPE_LABEL } from '../core/types'
import { Tag } from './bits'

type Filter = 'all' | 'favorite'

export default function Library({ onOpen, filter: initial = 'all' }: {
  onOpen: (rec: RunRecord, view: 'run' | 'board') => void
  filter?: Filter
}) {
  const [tick, setTick] = useState(0)
  const [filter, setFilter] = useState<Filter>(initial)
  const runs = useMemo(() => listRuns(), [tick])
  const shown = filter === 'favorite' ? runs.filter(r => r.favorite) : runs

  if (!runs.length) {
    return (
      <div className="libwrap">
        <div className="libhead">
          <h1>{t('Library')}</h1>
          <p className="lead">{t('Finished runs are kept here. Nothing yet.')}</p>
        </div>
        <div className="empty" style={{ height: 260 }}>
          <div>{t('Run the agent once and it will show up here.')}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="libwrap">
      <div className="libhead">
        <div>
          <h1>{t('Library')}</h1>
          <p className="lead">{t('Past runs, with their boards. Star the ones worth keeping.')}</p>
        </div>
        <div className="chiprow" style={{ flex: 'none' }}>
          <button className={`pick sm ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
            All {runs.length}
          </button>
          <button className={`pick sm ${filter === 'favorite' ? 'on' : ''}`} onClick={() => setFilter('favorite')}>
            Starred {runs.filter(r => r.favorite).length}
          </button>
        </div>
      </div>

      <div className="libgrid">
        {shown.map(r => {
          const st = r.state
          const alive = st.designs.filter(d => !d.rejected).length
          const approved = st.designs.filter(d => d.verdict === 'approve').length
          const tiers = new Set(st.designs.filter(d => d.isTop).map(d => TIER_LABEL[d.spec.tier]))
          return (
            <div className="libcard" key={r.id}>
              <button className="lc-thumb" onClick={() => onOpen(r, 'board')}>
                {r.thumb
                  ? <img src={r.thumb} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                  : <span className="lc-nothumb">No image</span>}
                {st.sample && <span className="lc-badge">{t('Sample')}</span>}
              </button>
              <div className="lc-body">
                <div className="lc-title">
                  {TYPE_LABEL[st.params.itemType] ?? st.params.itemType}
                  <span className="lc-sub">{MODE_LABEL[st.params.mode]}</span>
                </div>
                <div className="lc-meta">
                  {CAT_LABEL[st.params.category]} · {alive} passed
                  {approved > 0 && <> · {approved} approved</>}
                </div>
                <div className="lc-tags">
                  {[...tiers].slice(0, 3).map(t => <Tag key={t}>{t}</Tag>)}
                  <span className="lc-date">{new Date(r.savedAt).toLocaleDateString()}</span>
                </div>
                <div className="lc-acts">
                  <button className="btn btn-ghost btn-sm" onClick={() => onOpen(r, 'run')}>{t('Run')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onOpen(r, 'board')}>{t('Board')}</button>
                  <button className={`starbtn ${r.favorite ? 'on' : ''}`}
                    title={r.favorite ? 'Remove star' : 'Star'}
                    onClick={() => { toggleFavorite(r.id); setTick(t => t + 1) }}>
                    <svg viewBox="0 0 20 20" width="15" height="15"
                      fill={r.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                      <path d="M10 2.6l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L2.5 8.1l5.2-.8z" />
                    </svg>
                  </button>
                  {!st.sample && (
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}
                      onClick={() => { deleteRun(r.id); setTick(t => t + 1) }}>{t('Delete')}</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
