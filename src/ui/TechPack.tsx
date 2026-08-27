/* 테크팩 · 디자인 한 점을 공방에 넘길 수 있는 한 장 ──────────────────
   페르소나 QA 에서 "이미지는 예쁘지만 이대로는 벤치에 못 올린다" 가 5명,
   "이 가격에 만들 수 있는지 모르겠다" 가 9명이었다.
   여기서 치수·소재·부속·공정과 계산된 원가를 한 장에 모은다.

   원가는 estimateCost() 가 계산한다 — 모델에게 묻지 않는다.
   그래서 같은 사양이면 늘 같은 값이 나오고, 무엇을 곱해서 나왔는지 줄마다 남는다. */
import { checkTarget, dimText, estimateCost, retailBand, stoneText, type MakeSpec } from '../core/cost'
import { t } from '../core/i18n'

const usd = (n: number) => `$${n < 10 ? n.toFixed(1) : Math.round(n)}`

export function TechPack({ spec, priceTarget }: { spec?: MakeSpec; priceTarget?: string }) {
  const c = estimateCost(spec)
  if (!spec) return null

  const [rLo, rHi] = retailBand(c)
  const tgt = checkTarget(c, priceTarget)
  return (
    <div className="tp">
      <div className="tp-grid">
        <section>
          <h5>{t('Dimensions')}</h5>
          <table className="tp-tab">
            <tbody>
              {spec.dims?.length
                ? spec.dims.map(d => (
                  <tr key={d.name}><th>{d.name}</th><td>{dimText(d.mm)}</td></tr>
                ))
                : <tr><td className="hint">{t('Not specified')}</td></tr>}
            </tbody>
          </table>
        </section>

        <section>
          <h5>{t('Materials')}</h5>
          <table className="tp-tab">
            <tbody>
              <tr><th>{t('Metal')}</th><td>{spec.metal || '—'}</td></tr>
              {spec.plating?.trim() && <tr><th>{t('Plating')}</th><td>{spec.plating}</td></tr>}
              {spec.stones?.map((s, i) => (
                <tr key={i}><th>{t('Stone')}</th><td>{stoneText(s)}{s.count ? t(' pcs') : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h5>{t('Findings')}</h5>
          <table className="tp-tab">
            <tbody>
              {spec.findings?.length
                ? spec.findings.map((f, i) => <tr key={i}><th>{f.name}</th><td>{f.spec}</td></tr>)
                : <tr><td className="hint">{t('None')}</td></tr>}
            </tbody>
          </table>
          {!!spec.process?.length && (
            <p className="hint tp-proc">{t('Process')}: {spec.process.join(' → ')}</p>
          )}
        </section>

        <section className="tp-cost">
          <h5>{t('Estimated unit cost')}</h5>
          {c.ok ? (<>
            <p className="tp-big">{usd(c.low)} – {usd(c.high)}</p>
            <table className="tp-tab">
              <tbody>
                {c.lines.map((l, i) => (
                  <tr key={i}><th>{l.label}</th><td>{usd(l.usd)}{l.how && <em className="tp-how">{l.how}</em>}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="hint">{t('Suggested DTC price')} {usd(rLo)} – {usd(rHi)}</p>
            {tgt.verdict !== 'unknown' && (
              <p className={`tp-verdict ${tgt.verdict}`}>
                <b>{t(tgt.verdict === 'inside' ? 'Within your target' : tgt.verdict === 'over' ? 'Above your target' : 'Below your target')}</b>
                <span>{tgt.note}</span>
              </p>
            )}
            {!!c.quotes.length && (
              <p className="hint" style={{ color: 'var(--warn)' }}>
                {c.quotes.map((q, i) => <span key={i}>{q}<br /></span>)}
              </p>
            )}
            <p className="hint tp-src">
              {t('Computed from the spec above using reference prices from')} {c.pricedAt}.
              {' '}{t('Metal weight is an estimate, so the cost is a range. Replace the rates with your own supplier quotes.')}
            </p>
          </>) : (
            <p className="hint" style={{ color: 'var(--warn)' }}>{t('Cost not calculated')} · {c.blocked}</p>
          )}
        </section>
      </div>
      {spec.note?.trim() && <p className="hint tp-note">{spec.note}</p>}
    </div>
  )
}
