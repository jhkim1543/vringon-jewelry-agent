// ── 디자인 카드 (지시서 12.4) · 목표값/시각화/검증 분리 + 근거 패널 + 게이트 ──
import { t } from '../core/i18n'
import { useState } from 'react'
import type { Design, Signal } from '../core/types'
import { TIER_LABEL, TYPE_LABEL, CAT_LABEL, VERDICT_TAGS } from '../core/types'
import { PACKS } from '../core/packs'
import { designSVG, svgDataUri } from '../core/sketch'
import { Tag } from './bits'

export function DesignCard({ d, signals, stagePassed, onVerdict, compact }: {
  d: Design
  signals: Signal[]
  stagePassed: { s3: boolean; s4: boolean }
  onVerdict?: (id: string, v: 'approve' | 'reject', tags: string[]) => void
  compact?: boolean
}) {
  const [showRationale, setShowRationale] = useState(false)
  const [pendingReject, setPendingReject] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const pack = PACKS[d.spec.category]
  const rendered = stagePassed.s3 && !d.rejected && d.colorways.length >= 0 && d.qa.length > 0
  const mainView = 'front'
  const mainSvg = designSVG(d.spec, rendered ? 'render' : 'sketch', mainView as any)
  const f = d.spec.fields
  // 실제 생성 이미지 우선 · 렌더(기준뷰) > 스케치 > SVG 시뮬레이션 폴백
  const baseImg = d.images.find(i => i.view === mainView && !i.colorway)
  const sketchImg = d.images.find(i => i.view === 'sketch')
  const heroImg = baseImg ?? sketchImg
  const extraImgs = d.images.filter(i => i !== heroImg && i.view !== 'sketch')

  const specSummary = d.spec.category === 'jewelry'
    ? `${f.stone_count} stones · ${f.setting_type} · ${f.target_weight_g}g · ${f.min_wall_thickness_mm}mm wall`
    : `${f.heel_height_mm}mm heel · ${f.panel_count} panels · ${f.toe_shape} · ${f.last_id}`

  const fails = d.ruleResults.filter(r => r.severity === 'fail')
  const warns = d.ruleResults.filter(r => r.severity === 'warn')
  const qaPass = d.qa.filter(q => q.pass).length

  return (
    <div className={`dcard ${d.rejected ? 'rejected' : ''}`}>
      <div className="imgwrap">
        {/* 생성 이미지가 못 불려오면 조용히 비워두지 않고 도식으로 되돌린다 */}
        <img src={heroImg ? heroImg.url : svgDataUri(mainSvg)} alt={d.spec.design_id}
          onError={e => { (e.currentTarget as HTMLImageElement).src = svgDataUri(mainSvg) }} />
        <div className="flag" style={{ display: 'flex', gap: 4 }}>
          {d.isTop && <Tag kind="accent">TOP</Tag>}
          {d.viewMismatch && <Tag kind="warn">{t('View mismatch')}</Tag>}
          {d.rejected && <Tag kind="danger">{t('Rule reject')}</Tag>}
        </div>
        {!heroImg && !d.rejected && <span className="simbadge">{t('Diagram')}</span>}
      </div>

      {rendered && !compact && (
        <div style={{ padding: '6px 10px 0' }}>
          <div className="viewstrip">
            {extraImgs.length > 0
              ? extraImgs.map(im => (
                <div className="v" key={im.hash} title={im.colorway ? `${im.colorway} colourway (edit)` : `${im.view} (edit)`}>
                  <img src={im.url} alt={im.colorway ?? im.view} />
                </div>
              ))
              : (<>
                {pack.viewSet.filter(v => v.required).slice(1).map(v => (
                  <div className="v" key={v.key} title={v.label}>
                    <img src={svgDataUri(designSVG(d.spec, 'render', v.key as any))} alt={v.label} />
                  </div>
                ))}
                {d.colorways.map(cw => (
                  <div className="v" key={cw} title={`${cw} colourway`}>
                    <img src={svgDataUri(designSVG(d.spec, 'render', mainView as any, cw))} alt={cw} />
                  </div>
                ))}
              </>)}
          </div>
          <div className="hint" style={{ marginTop: 4 }}>{t('A concept rendering of the target spec. It may not match the numbers exactly.')}</div>
        </div>
      )}

      <div className="body">
        <div className="idline">
          {d.spec.design_id}
          <span className="muted">{CAT_LABEL[d.spec.category]}/{TYPE_LABEL[d.spec.itemType]}</span>
          <Tag kind={d.spec.tier === 'signature' ? 'accent' : undefined}>{TIER_LABEL[d.spec.tier]}</Tag>
        </div>

        {/* 설계 목표값 (AI 생성 스펙) · 한 줄 요약, 상세는 근거 패널 */}
        <div className="metric"><b>{t('Target')}</b> {specSummary}
          {d.spec.fieldsLocked.length > 0 && <> · <span style={{ color: 'var(--accent-hi)' }}>🔒 DNA {d.spec.fieldsLocked.length}</span></>}
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {fails.length === 0
            ? <Tag kind="ok">{t('Passed rules')}</Tag>
            : fails.map(r => <Tag kind="danger" key={r.rule}>{r.rule}</Tag>)}
          {warns.map(r => <Tag kind="warn" key={r.rule}>{r.rule}</Tag>)}
          {d.qa.length > 0 && <Tag kind={qaPass === d.qa.length ? 'ok' : 'warn'}>QA {qaPass}/{d.qa.length}</Tag>}
        </div>

        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowRationale(v => !v)}>
          {showRationale ? '▾' : '▸'} Reasoning, metrics, cost
        </button>
      </div>

      {showRationale && <RationalePanel d={d} signals={signals} />}

      {/* 승인 게이트 · 카드 위 (별도 평가 화면 금지) */}
      {onVerdict && !d.rejected && (
        <div className="gate-actions">
          {d.verdict === 'approve' && <Tag kind="ok">{t('Approved')}</Tag>}
          {d.verdict === 'reject' && <Tag kind="danger">Rejected · {d.verdictTags?.join(', ')}</Tag>}
          {!d.verdict && !pendingReject && (<>
            <button className="btn btn-ok btn-sm" onClick={() => onVerdict(d.spec.design_id, 'approve', [])}>{t('Approve')}</button>
            <button className="btn btn-danger btn-sm" onClick={() => setPendingReject(true)}>{t('Reject')}</button>
          </>)}
          {pendingReject && (<>
            <div className="tagpick">
              {VERDICT_TAGS.map(t => (
                <button key={t} className={tags.includes(t) ? 'on' : ''}
                  onClick={() => setTags(v => v.includes(t) ? v.filter(x => x !== t) : [...v, t])}>{t}</button>
              ))}
            </div>
            <button className="btn btn-danger btn-sm" disabled={tags.length === 0}
              onClick={() => { onVerdict(d.spec.design_id, 'reject', tags); setPendingReject(false) }}>{t('Confirm reasons')}</button>
          </>)}
        </div>
      )}
    </div>
  )
}

export function RationalePanel({ d, signals }: { d: Design; signals: Signal[] }) {
  return (
    <div className="rationale">
      <div>
        <h5>{t('Metrics, calculated and reproducible')}</h5>
        <div style={{ color: 'var(--text-2)' }}>
          {d.metrics.map(m => <span key={m.label}>{m.label} <b style={{ color: 'var(--text)' }}>{m.value}</b> · </span>)}
          {d.topDistance != null && <span>{t('Distance between top picks')} <b style={{ color: 'var(--text)' }}>{d.topDistance}</b></span>}
        </div>
      </div>
      <div>
        <h5>{t('Model judgement, kept separate')}</h5>
        {d.modelEval.map(m => (
          <div key={m.label} style={{ color: 'var(--text-2)' }}>{m.label} <b style={{ color: 'var(--text)' }}>{m.value}</b> <span style={{ color: 'var(--text-3)' }}>· {m.basis}</span></div>
        ))}
      </div>
      <div>
        <h5>{t('Signals behind this, with sources')}</h5>
        {d.rationale.driving_signals.map(ds => {
          const s = signals.find(x => x.signal_id === ds.signal_id)
          if (!s) return null
          return (
            <div className="sig" key={ds.signal_id}>
              <Tag kind="accent">{s.signal_id}</Tag>
              <span>{s.label} · seen {s.observed_count}x · w={ds.weight}
                {s.sales_proxy_score != null && ` · proxy ${s.sales_proxy_score} (${s.proxy_confidence})`}
                {s.page_ref && ` · ${s.page_ref}`}
                {' '}{s.sources.slice(0, 2).map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer">[{i + 1}]</a>)}
              </span>
            </div>
          )
        })}
      </div>
      <div>
        <h5>{t('References, for attribution')}</h5>
        {d.rationale.reference_images.map(r => (
          <div className="refthumb" key={r.ref_id} style={{ marginBottom: 4 }}>
            <div className="ph">{r.source_type === 'competitor' ? 'CMP' : r.source_type === 'archive' ? 'ARC' : 'REF'}</div>
            <div style={{ fontSize: 11, lineHeight: 1.5 }}>
              {r.source_type} · collected {r.collected_at} · {r.borrowed_attributes.join(', ')}
              <div>
                <Tag kind={r.usage === 'attribute_only' ? undefined : 'accent'}>{r.usage}</Tag>
                {r.source_type === 'competitor' && <span style={{ color: 'var(--text-3)' }}> {t('blocked from generation, attributes only')}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      {d.rationale.reference_prompts.length > 0 && (
        <div>
          <h5>{t('Concept prompt')}</h5>
          {d.rationale.reference_prompts.map((p, i) => (
            <div key={i} style={{ color: 'var(--text-2)' }}>"{p.text}" → {p.applied_as.join(' · ')}</div>
          ))}
        </div>
      )}
      {d.rationale.series_dna_inherited.length > 0 && (
        <div><h5>{t('Inherited series DNA')}</h5>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {d.rationale.series_dna_inherited.map(e => <Tag key={e} kind="accent">🔒 {e}</Tag>)}
          </div>
        </div>
      )}
      <div>
        <h5>{t('Why this tier')}</h5>
        <div style={{ color: 'var(--text-2)' }}>{d.rationale.type_placement_reason}</div>
      </div>
      <div>
        <h5>{t('Talk track')}</h5>
        {d.rationale.narrative.map((n, i) => <div key={i} style={{ color: 'var(--text-2)' }}>{i + 1}. {n}</div>)}
      </div>
      {d.qa.length > 0 && (
        <div>
          <h5>{t('Vision QA')}</h5>
          {d.qa.map(q => (
            <div key={q.check} style={{ color: q.pass ? 'var(--text-2)' : 'var(--warn)' }}>
              {q.pass ? '✓' : '⚠'} {q.check} · target {q.target} / observed {q.observed}
            </div>
          ))}
        </div>
      )}
      <div>
        <h5>{t('Cost, with band, assumptions and exclusions')}</h5>
        <div style={{ color: 'var(--text-2)' }}>
          Estimated KRW {(d.cost.estimated_total_krw / 10000).toFixed(1)}0k · band {d.cost.estimated_band_krw.map(v => (v / 10000).toFixed(1)).join('~')}0k · confidence {d.cost.confidence}
          {d.cost.tooling.total_tooling_krw > 0 && (
            <div>Tooling KRW {(d.cost.tooling.total_tooling_krw / 10000).toFixed(0)}0k
              {d.cost.tooling.size_run_count ? ` (${d.cost.tooling.mold_count_required} moulds across a ${d.cost.tooling.size_run_count} size run)` : ''}
              {' '}÷ {d.cost.tooling.amortization_volume.toLocaleString()} = {d.cost.tooling.tooling_per_unit_krw.toLocaleString()} each</div>
          )}
          <div style={{ color: 'var(--text-3)', fontSize: 11 }}>Assumes: {d.cost.assumptions.join(' · ')}</div>
          <div style={{ color: 'var(--text-3)', fontSize: 11 }}>Excludes: {d.cost.excluded_costs.join(' · ')}</div>
        </div>
      </div>
    </div>
  )
}
