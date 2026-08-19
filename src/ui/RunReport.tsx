// ── 분석 리포트 · 끝난 분석을 한 장짜리 문서처럼 보여준다 ────────────
// 진행 로그와 접힘 패널은 그대로 두되, 맨 위에 "무엇이 나왔는가"를 먼저 둔다.
// 여기 있는 숫자와 표는 전부 수집된 데이터에서 뽑는다. 채워 넣은 값은 없다.
import { t, tf } from '../core/i18n'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { RunState } from '../core/types'
import { CAT_LABEL, TYPE_LABEL, MODE_LABEL, uploadName, userUploads } from '../core/types'
import { GRADE_LABEL, shotUrl } from '../core/research'
import type { Macrotrend, SeasonDossier, TrendReport } from '../core/research'
import { DeckViewer } from './DeckViewer'
import { dossierDeckHtml, openDossierPdf, saveDossierHtml } from '../core/dossierPdf'
import { openTrendReportPdf, saveTrendReportHtml, trendDeckHtml } from '../core/reportPdf'
import { IcGem, IcReport, IcTrend } from './icons'

const KRW = (n: number) => `₩${Math.round(n).toLocaleString('en-US')}`

/** 매크로트렌드 카드에 쓸 대표 이미지 · 키아이템 사진이 있으면 그것을 쓴다 */
function macroShot(m: Macrotrend): string | null {
  for (const k of m.key_items ?? []) {
    const u = (k as { image_url?: string }).image_url
    // 정적 배포에서는 shotUrl 이 빈 문자열을 돌려줄 수 있다 — 그건 사진이 없다는 뜻이다
    if (u && shotUrl(u)) return shotUrl(u)
  }
  return null
}

export default function RunReport({ st, onOpenBoard, competitorDetail, bestsellerDetail, dossierDetail, reportDetail }: {
  st: RunState
  onOpenBoard: () => void
  /** 조사 상세 · 예전에는 화면 맨 밑에 따로 있던 패널들이 각 섹션 안으로 들어온다 */
  competitorDetail?: ReactNode
  bestsellerDetail?: ReactNode
  dossierDetail?: ReactNode
  reportDetail?: ReactNode
}) {
  const d = st.dossier as SeasonDossier | null
  const report = st.trendReport as TrendReport | null
  const macros = d?.macrotrends ?? []
  const top = st.designs.filter(x => x.isTop)
  const shown = (top.length ? top : st.designs.filter(x => !x.rejected)).slice(0, 6)

  // 히어로 이미지는 이번 분석이 실제로 만든 렌더를 쓴다.
  // 조사만 돌린 런에는 렌더가 없으므로 리포트용으로 생성한 무드컷으로 채운다.
  const hero = useMemo(() => {
    for (const x of [...top, ...st.designs]) {
      const im = x.images.find(i => i.origin === 'generated' && i.view !== 'sketch')
      if (im) return im.url
    }
    return st.reportArt?.cover ?? null
  }, [st.designs, top, st.reportArt])

  // 경쟁 구도 · 브랜드별로 묶어 가격 범위와 대표 제품을 낸다
  const brands = useMemo(() => {
    const by = new Map<string, typeof st.competitors>()
    for (const c of st.competitors) {
      if (!by.has(c.brand)) by.set(c.brand, [])
      by.get(c.brand)!.push(c)
    }
    return [...by.entries()].map(([brand, items]) => {
      const prices = items.map(i => i.price_krw).filter((n): n is number => typeof n === 'number' && n > 0)
      return {
        brand,
        items,
        lo: prices.length ? Math.min(...prices) : null,
        hi: prices.length ? Math.max(...prices) : null,
        // design_traits 가 실제로 채워지는 필드다. praise_points 는 비어 오는 경우가 많다.
        traits: [...new Set(items.flatMap(i => i.design_traits ?? []))].slice(0, 6),
        signals: [...new Set(items.flatMap(i => i.proxy_signals ?? []))].slice(0, 3),
        shots: items.map(i => i.image_urls?.[0]).filter(Boolean).slice(0, 2) as string[],
        inBand: items.filter(i => i.in_band).length,
        strong: items.filter(i => i.evidence_strength === 'strong').length,
        // 브랜드의 대표 분류 · 제품별 분류 중 다수결
        cls: (() => { const c: Record<string, number> = {}
          for (const i of items) if (i.competitor_class) c[i.competitor_class] = (c[i.competitor_class] ?? 0) + 1
          return (Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) as 'direct' | 'aspirational' | 'directional' | null })(),
      }
    }).sort((a, b) => b.items.length - a.items.length)
  }, [st.competitors])

  // 디자인 시사점 · 도시에의 소재·디테일·팔레트와 신호를 축별로 묶는다
  const implications = useMemo(() => {
    const pick = (list: readonly { label?: string; name?: string }[] | undefined, n: number) =>
      (list ?? []).map(x => x.label ?? x.name ?? '').filter(Boolean).slice(0, n)
    const mats = [...new Set(macros.flatMap(m => pick(m.materials, 3)))]
    const dets = [...new Set(macros.flatMap(m => pick(m.details, 3)))]
    const cols = [...new Set(macros.flatMap(m => (m.palette ?? []).map(c => c.name)))]
    const axes = [...new Set(st.signals.map(s => s.axis))]
    const rows: { k: string; label: string; body: string }[] = []
    if (axes.length) rows.push({ k: 'silhouette', label: 'Silhouette', body: axes.slice(0, 4).join(' · ') })
    if (mats.length) rows.push({ k: 'material', label: 'Material', body: mats.slice(0, 5).join(' · ') })
    if (dets.length) rows.push({ k: 'detail', label: 'Detail', body: dets.slice(0, 5).join(' · ') })
    if (cols.length) rows.push({ k: 'palette', label: 'Palette', body: cols.slice(0, 6).join(' · ') })
    if (d?.powershift) rows.push({ k: 'direction', label: 'Market direction', body: d.powershift })
    return rows
  }, [macros, st.signals, d])

  const sourceCount = (d?.sources?.length ?? 0) + (report?.sources?.length ?? 0)

  // 표지는 모드마다 다른 것을 말해야 한다. 무드보드 실행에는 매크로트렌드도 외부 출처도 없는데
  // "Key macro trends · Data sources" 를 세어 보이면 하지 않은 조사를 한 것처럼 읽힌다.
  const cover = useMemo(() => {
    const m = st.params.mode
    if (m === 'moodboard') {
      const pages = new Set(st.signals.map(s => s.page_ref).filter(Boolean)).size
      return {
        title: `${userUploads(st.params.moodboard.files).map(uploadName).join(', ') || t('Your documents')}`,
        sub: 'read from your documents',
        stats: [
          { n: st.signals.length, label: 'Signals read' },
          { n: pages, label: 'Pages cited' },
          { n: implications.length, label: 'Design implications' },
        ],
      }
    }
    if (m === 'series') {
      const dna = (st.seriesDna?.invariant.length ?? 0) + (st.seriesDna?.variable.length ?? 0)
      return {
        title: st.params.series.seriesName
          ? `${st.params.series.seriesName} ${t('continued')}`
          : `${t(CAT_LABEL[st.params.category])} ${t('series continuation')}`,
        sub: 'series continuation report',
        stats: [
          { n: dna, label: 'DNA elements read' },
          { n: macros.length, label: 'Key macro trends' },
          { n: implications.length, label: 'Design implications' },
        ],
      }
    }
    return {
      title: d?.season_title ?? `${t(CAT_LABEL[st.params.category])} ${t('macro trends')}`,
      sub: 'trend report',
      stats: [
        { n: macros.length, label: 'Key macro trends' },
        { n: sourceCount, label: 'Data sources' },
        { n: implications.length, label: 'Design implications' },
      ],
    }
  }, [st.params, st.signals, st.seriesDna, macros.length, implications.length, sourceCount, d])
  // 덱은 st 가 바뀔 때만 다시 만든다. 매 렌더마다 만들면 iframe 이 계속 새로 뜬다.
  const trendDeck = useMemo(() => (report ? trendDeckHtml(st) : null), [report, st])
  const seasonDeck = useMemo(() => (d ? dossierDeckHtml(st) : null), [d, st])
  const CatIcon = IcGem

  return (
    <div className="rep">
      {/* ── 표지 ─────────────────────────────────────────────── */}
      <header className="rep-hero">
        <div className="rep-hero-txt">
          <nav className="rep-crumb">
            {/* 브랜드 이름과 한 줄은 여기서 쓴다 · 설정 화면에서 받아 놓고 아무 데도 안 쓰면 받을 이유가 없다.
                이미지 프롬프트에는 넣지 않는다 — 글자가 제품에 찍힌다. */}
            {st.params.brand?.brandName && (
              <><span title={st.params.brand.tagline || undefined}>
                {st.params.brand.brandName}{st.params.brand.tagline ? ` · ${st.params.brand.tagline}` : ''}
              </span><i>/</i></>
            )}
            <span>{t(MODE_LABEL[st.params.mode])}</span>
            <i>/</i><span>{t(TYPE_LABEL[st.params.itemType])}</span>
            {(d?.season || st.params.mode === 'trend') && <><i>/</i><span>{d?.season ?? st.params.trend.priceBand}</span></>}
          </nav>
          <h1>{cover.title}</h1>
          <p className="rep-sub">{t(TYPE_LABEL[st.params.itemType])} {t(cover.sub)}</p>
          <p className="rep-lede">{d?.season_narrative ?? report?.executive_view ?? t('The analysis is still filling in. Sections appear as they land.')}</p>
          <div className="rep-stats">
            {cover.stats.map(s => <div key={s.label}><b>{s.n || '—'}</b><span>{t(s.label)}</span></div>)}
          </div>
        </div>
        {hero && <div className="rep-hero-art"><img src={hero} alt="" /></div>}
      </header>

      {/* ── 트렌드 리포트 PDF ─────────────────────────────────── */}
      {report && (
        <section className="rep-sect" id="sec-report">
          <div className="rep-head">
            <h2>{t('Trend report')}</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => openTrendReportPdf(st)}>{t('Download PDF')}</button>
          </div>
          {trendDeck && (
            <DeckViewer title={trendDeck.title} html={trendDeck.html}
              onPrint={() => openTrendReportPdf(st)} onSave={() => saveTrendReportHtml(st)} />
          )}
          {reportDetail && <div className="rep-detail">{reportDetail}</div>}
        </section>
      )}

      {/* ── 매크로트렌드 ──────────────────────────────────────── */}
      {macros.length > 0 && (
        <section className="rep-sect" id="sec-macros">
          <div className="rep-head"><h2>{t('Key macro trends')}</h2></div>
          <div className="rep-macros">
            {macros.map(m => {
              // 조사에서 찾은 참고 사진이 먼저다 · 없으면 이 매크로용으로 생성한 무드컷
              const shot = macroShot(m) ?? st.reportArt?.sections?.[m.name] ?? null
              return (
                <article className="rep-macro" key={m.name}>
                  {/* 대표 이미지가 없으면 팔레트를 띠로 깐다. 아이콘만 두면 임팩트가 없다. */}
                  <span className="rm-art">
                    {shot
                      ? <img src={shot} alt="" />
                      : (m.palette ?? []).length
                        ? <span className="rm-pal">
                            {(m.palette ?? []).slice(0, 6).map((c, i) => (
                              <i key={i} style={{ background: c.hex }} title={`${c.name} ${c.hex}`} />
                            ))}
                          </span>
                        : <CatIcon />}
                    <span className="rm-grade">{t(GRADE_LABEL[m.grade] ?? m.grade)}</span>
                  </span>
                  <span className="rm-txt">
                    <b>{m.name}</b>
                    <span className="rm-d">{m.statement}</span>
                    {(m.sub_trends ?? []).length > 0 && (
                      <span className="rm-subs">
                        {(m.sub_trends ?? []).slice(0, 4).map((s, i) => <i key={i}>{s}</i>)}
                      </span>
                    )}
                  </span>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Top 디자인 ────────────────────────────────────────── */}
      {shown.length > 0 && (
        <section className="rep-sect" id="sec-designs">
          <div className="rep-head">
            <h2>{t('Top trending designs')}</h2>
            <button className="btn btn-ghost btn-sm" onClick={onOpenBoard}>{t('View all designs')}</button>
          </div>
          {/* MD 총평 · 무엇이 픽을 갈랐는지, 설정된 페르소나의 말로 */}
          {st.mdPickRationale && (
            <p className="rep-mdnote">{st.mdPickRationale}</p>
          )}
          <div className="rep-designs">
            {shown.map(x => {
              const im = x.images.find(i => i.origin === 'generated' && i.view !== 'sketch') ?? x.images[0]
              return (
                <article className="rep-design" key={x.spec.design_id}>
                  <span className="rd-shot">{im ? <img src={im.url} alt="" /> : null}</span>
                  <span className="rd-id">{x.spec.design_id}<i className={`rd-tier t-${x.spec.tier}`}>{t(x.spec.tier)}</i></span>
                  {x.recipe && <span className="rd-recipe">{x.recipe.title}</span>}
                  <span className="rd-spec">{x.metrics.slice(0, 2).map(m => `${m.label} ${m.value}`).join(' · ')}</span>
                  <span className="rd-chips">
                    <i className={x.rejected ? 'bad' : ''}>{x.rejected ? t('Rule reject') : t('Passed rules')}</i>
                    {x.qa.length > 0 && <i className={x.qa.some(q => (q.status ?? (q.pass ? 'pass' : 'fail')) === 'fail') ? 'bad' : ''}>{tf('QA {pass}/{total}', { pass: x.qa.filter(q => q.pass).length, total: x.qa.length })}</i>}
                    {x.mdReview && <i className={x.mdReview.verdict === 'drop' ? 'bad' : ''}>{
                      x.mdReview.verdict === 'pick' ? t('MD pick') : x.mdReview.verdict === 'drop' ? t('MD drop') : t('MD hold')}</i>}
                  </span>
                  {x.mdReview && <span className="rd-md">{x.mdReview.reason}</span>}
                </article>
              )
            })}
          </div>
        </section>
      )}

      {/* ── 경쟁 구도 ─────────────────────────────────────────── */}
      {brands.length > 0 && (
        <section className="rep-sect" id="sec-comp">
          <div className="rep-head"><h2>{t('Competitive landscape')}</h2></div>
          <div className="rep-tablewrap">
            <table className="rep-table">
              <thead>
                <tr>
                  <th>{t('Brand')}</th><th>{t('Products found')}</th><th>{t('Design traits observed')}</th>
                  <th>{t('Market signals')}</th><th>{t('Price range')}</th>
                </tr>
              </thead>
              <tbody>
                {brands.map(b => (
                  <tr key={b.brand}>
                    <td className="rt-brand">
                      {b.brand}
                      {b.cls && <em className={`rt-cls ${b.cls}`}>{t(b.cls === 'direct' ? 'Direct' : b.cls === 'aspirational' ? 'Aspirational' : 'Directional')}</em>}
                      <i>{b.inBand}/{b.items.length} {t('in band')}{b.strong ? ` · ${b.strong} ${t('strong')}` : ''}</i>
                    </td>
                    {/* 제품 사진과 이름을 함께 둔다. 사진만으로는 무엇을 본 건지 알 수 없다. */}
                    <td className="rt-prods">
                      {b.items.slice(0, 3).map(p => (
                        <span className="rt-prod" key={p.product_id}>
                          {p.image_urls?.[0] && <img src={shotUrl(p.image_urls[0])} alt=""
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />}
                          <span>
                            <b>{p.name}</b>
                            {typeof p.price_krw === 'number' && p.price_krw > 0 && <i>{KRW(p.price_krw)}</i>}
                          </span>
                        </span>
                      ))}
                      {b.items.length > 3 && <span className="dim">+{b.items.length - 3}</span>}
                    </td>
                    <td className="rt-traits">
                      {b.traits.length
                        ? b.traits.map((x, i) => <i key={i}>{x}</i>)
                        : <span className="dim">{t('none recorded')}</span>}
                    </td>
                    <td className="rt-sig">
                      {b.signals.length
                        ? b.signals.map((x, i) => <span key={i}>{x}</span>)
                        : <span className="dim">—</span>}
                    </td>
                    <td className="rt-price">{b.lo != null ? `${KRW(b.lo)} – ${KRW(b.hi!)}` : <span className="dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {competitorDetail && <div className="rep-detail">{competitorDetail}</div>}
        </section>
      )}

      {brands.length === 0 && competitorDetail && (
        <section className="rep-sect">
          <div className="rep-head"><h2>{t('Competitors')}</h2></div>
          <div className="rep-detail">{competitorDetail}</div>
        </section>
      )}

      {/* ── 백화점 베스트셀러 · 실제 팔리는 것의 사진이 경쟁 구도의 기준점이다 ── */}
      {bestsellerDetail && (
        <section className="rep-sect" id="sec-bestsellers">
          <div className="rep-head"><h2>{t('What actually sells')}</h2>
            <p>{t('Bestseller listings at department stores and luxury retailers, captured with photos at research time.')}</p>
          </div>
          <div className="rep-detail">{bestsellerDetail}</div>
        </section>
      )}

      {/* ── 시즌 도시에 PDF ───────────────────────────────────── */}
      {d && (
        <section className="rep-sect" id="sec-season">
          <div className="rep-head">
            <h2>{t('Season report')}</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => openDossierPdf(st)}>{t('Download PDF')}</button>
          </div>
          {seasonDeck && (
            <DeckViewer title={seasonDeck.title} html={seasonDeck.html}
              onPrint={() => openDossierPdf(st)} onSave={() => saveDossierHtml(st)} />
          )}
          {dossierDetail && <div className="rep-detail">{dossierDetail}</div>}
        </section>
      )}

      {/* ── 디자인 시사점 ─────────────────────────────────────── */}
      {implications.length > 0 && (
        <section className="rep-sect" id="sec-impl">
          <div className="rep-head"><h2>{t('Design implications')}</h2></div>
          <div className="rep-impl">
            {implications.map(r => (
              <div className="ri-row" key={r.k}>
                <span className="ri-ic"><IcTrend /></span>
                <span className="ri-l">{t(r.label)}</span>
                <span className="ri-b">{r.body}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {d && (
        <footer className="rep-foot">
          <IcReport />
          <span>
            {t('Collected up to')} {new Date(d.collected_at).toLocaleDateString()} · {d.searches} {t('web searches')} · {d.sources.length} {t('sources')}.
            {d.method_note ? ` ${d.method_note}` : ''}
          </span>
        </footer>
      )}
    </div>
  )
}
