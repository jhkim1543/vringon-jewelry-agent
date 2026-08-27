// ── 에이전트 산출물 덱 (16:9 / A4 가로) ──────────────────────────────
// 크롤 결과·트렌드 리포트를 PPT 꼴의 슬라이드로 만든다. 화면에서는 DeckViewer 로 보고,
// 인쇄(PDF 저장)와 HTML 다운로드는 deck.ts 의 공통 경로를 쓴다.
//
// 원칙
//  · 슬라이드의 모든 항목은 수집 데이터에서 온다. 채워 넣는 값은 없다.
//  · 사진은 자르지 않는다(contain). cover 로 두면 세로로 긴 제품 사진이 잘려 나간다.
//  · 사진이 없으면 "이미지 확인 필요" 칸으로 정직하게 남긴다 — 없는데 있는 척하지 않는다.
// 템플릿 · 트렌드는 종이색 에디토리얼(tpl-trend), 경쟁사·편집샵은 아이보리 럭셔리(tpl-lux).
import type { CrawledProduct, RunState } from './types'
import { BASIS_LABEL, CONFIDENCE_LABEL, ITEM_KO, regionsLabel, regionsOf } from './types'
import { esc, slide } from './deck'
import { shotUrl } from './agents'
import { t } from './i18n'

const price = (p?: number, c?: string) => p ? `${p.toLocaleString()} ${c ?? ''}` : t('price unconfirmed')

/** contain 이미지 · 죽은 링크는 deck.ts 의 정리 스크립트가 걷어낸다 */
function img(remote?: string, shot?: string, page?: string): string {
  const src = shot || shotUrl(remote, page)
  if (!src) return ''
  return `<img src="${esc(src)}"/>`
}

const domainOf = (url?: string) => {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : '' } catch { return '' }
}
const ymd = (iso?: string) => (iso ?? new Date().toISOString()).slice(0, 10).replace(/-/g, '.')

// ── 경쟁사·편집샵 공통 · 럭셔리 리포트 카드 ──────────────────────────
interface LuxItem {
  name: string; sub: string; badge: string; badgeKind: 'line' | 'fill' | 'mute'
  imageUrl?: string; shot?: string; page?: string
}

function luxCard(x: LuxItem, no: number, hero = false): string {
  const pic = img(x.imageUrl, x.shot, x.page)
  const im = pic
    ? `<div class="im">${pic}</div>`
    : `<div class="im miss"><span>${esc(t('image needs checking'))}</span></div>`
  return `<div class="${hero ? 'lx-hero' : 'lx-card'}">${im}
    <div class="cap">
      <div class="caphead"><span class="no">${String(no).padStart(2, '0')}</span>
        <span class="badge ${x.badgeKind === 'fill' ? 'fill' : x.badgeKind === 'mute' ? 'mute' : ''}">${esc(x.badge)}</span></div>
      <div class="nm">${esc(x.name)}</div>
      <div class="pr">${esc(x.sub)}</div>
    </div></div>`
}

/** 한 브랜드(또는 한 샵)를 여러 장으로 · 첫 장은 히어로+5, 이후 6칸 격자 */
function luxPages(opts: {
  eyebrow: string; meta: string[]; brand: string; sub: string
  items: LuxItem[]; footKey: string; footVal: string; crawledOn: string
  pageStart: number
}): { html: string; pages: number } {
  const out: string[] = []
  let page = opts.pageStart
  // 사진 있는 것을 히어로로 · 첫 항목에 사진이 없으면 있는 것을 앞으로 끌어온다
  const sorted = [...opts.items]
  const heroIdx = sorted.findIndex(x => x.imageUrl || x.shot || x.page)
  if (heroIdx > 0) sorted.unshift(...sorted.splice(heroIdx, 1))

  const foot = (pg: number) => `<div class="lx-foot">
      <span><span class="k">${esc(opts.footKey)}</span> ${esc(opts.footVal)}</span>
      <span><span class="k">CRAWLED ON</span> ${esc(opts.crawledOn)}</span>
      <span class="pg">${String(pg).padStart(2, '0')}</span></div>`

  const head = (cont: boolean) => `<div class="lx-top">
      <span class="lx-eyebrow">${esc(opts.eyebrow)}</span>
      <span class="lx-meta">${opts.meta.filter(Boolean).map(m => esc(m)).join('<span class="sep">|</span>')}</span></div>
    <h1 class="lx-brand">${esc(opts.brand)}</h1>
    <div class="lx-sub">${esc(opts.sub)}${cont ? ' · (계속)' : ''}</div>`

  const first = sorted.slice(0, 6)
  out.push(`<section class="slide tpl-lux"><div class="lx-wrap">
    ${head(false)}
    <div class="lx-cols">
      ${first[0] ? luxCard(first[0], 1, true) : ''}
      <div class="lx-grid">${first.slice(1).map((x, i) => luxCard(x, i + 2)).join('')}</div>
    </div>
    ${foot(page)}
  </div></section>`)

  for (let i = 6; i < sorted.length; i += 6) {
    page++
    out.push(`<section class="slide tpl-lux"><div class="lx-wrap">
      ${head(true)}
      <div class="lx-cols"><div class="lx-grid" style="grid-template-columns:repeat(3,1fr)">
        ${sorted.slice(i, i + 6).map((x, k) => luxCard(x, i + k + 1)).join('')}
      </div></div>
      ${foot(page)}
    </div></section>`)
  }
  return { html: out.join(''), pages: page - opts.pageStart + 1 }
}

const GROUP_BADGE: Record<string, { label: string; kind: LuxItem['badgeKind'] }> = {
  representative: { label: 'REPRESENTATIVE', kind: 'line' },
  best: { label: 'BEST', kind: 'fill' },
  new: { label: 'NEW', kind: 'mute' },
}

function toLux(x: CrawledProduct): LuxItem {
  const b = x.group ? GROUP_BADGE[x.group]
    : x.rankBasis === 'official_best' ? { label: 'BEST', kind: 'fill' as const }
      : { label: 'EXPOSURE', kind: 'mute' as const }
  return {
    name: x.name,
    sub: price(x.price, x.currency),
    badge: b.label, badgeKind: b.kind,
    imageUrl: x.imageUrl, shot: x.shot, page: x.productUrl,
  }
}

// ── 경쟁사 크롤 덱 ───────────────────────────────────────────────────
export function competitorDeckHtml(st: RunState): { title: string; html: string } {
  const out: string[] = []
  let page = 0
  const item = ITEM_KO[st.params.itemType] ?? st.params.itemType
  const crawledOn = ymd(st.savedAtISO)
  for (const c of st.crawl ?? []) {
    const currencies = [...new Set(c.items.map(x => x.currency).filter(Boolean))].slice(0, 3).join(' · ')
    const r = luxPages({
      eyebrow: 'COMPETITOR PRODUCT REPORT',
      meta: [`${c.items.length} PRODUCTS`, currencies || item],
      brand: c.brand,
      sub: `${t('Representative and best sellers')} · ${item} · ${regionsLabel(st.params)}`,
      items: c.items.map(toLux),
      footKey: 'SOURCE', footVal: domainOf(c.items[0]?.productUrl) || c.brand,
      crawledOn, pageStart: page + 1,
    })
    out.push(r.html); page += r.pages
  }
  return { title: t('Competitor product crawl'), html: out.join('') }
}

// ── 편집샵 덱 ────────────────────────────────────────────────────────
export function shopsDeckHtml(st: RunState): { title: string; html: string } {
  const out: string[] = []
  let page = 0
  const crawledOn = ymd(st.savedAtISO)
  for (const s of st.shops ?? []) {
    if (!s.items.length) continue
    const r = luxPages({
      eyebrow: 'SELECT SHOP REPORT',
      meta: [`${s.items.length} PRODUCTS`, s.region ?? ''],
      brand: s.name,
      sub: `${s.note.slice(0, 70)} · ${t('Ranks are shown exactly as the shop states them. Exposure order is never called sales.')}`,
      items: s.items.map(toLux),
      footKey: 'SOURCE', footVal: domainOf(s.url) || s.url,
      crawledOn, pageStart: page + 1,
    })
    out.push(r.html); page += r.pages
  }
  return { title: t('Jewelry select shops'), html: out.join('') }
}

// ── 트렌드 리포트 덱 · 종이색 에디토리얼 ─────────────────────────────
export function trendDeckHtml(st: RunState): { title: string; html: string } {
  const r = st.trendReport
  const out: string[] = []
  if (!r) return { title: t('Trend report'), html: '' }
  const item = ITEM_KO[st.params.itemType] ?? st.params.itemType
  const year = new Date(st.savedAtISO ?? Date.now()).getFullYear()

  // 표지의 사진 4장 · 수집된 실제 제품 사진에서 앞선 4장 (생성 아트 아님)
  const photoPool: { cap: string; imageUrl?: string; shot?: string; page?: string }[] = [
    ...(st.crawl ?? []).flatMap(c => c.items.map(x => ({ cap: `${c.brand} · ${x.name}`, imageUrl: x.imageUrl, shot: x.shot, page: x.productUrl }))),
    ...(st.shops ?? []).flatMap(s => s.items.map(x => ({ cap: `${x.brand} · ${x.name}`, imageUrl: x.imageUrl, shot: x.shot, page: x.productUrl }))),
    ...(st.runway?.looks ?? []).map(l => ({ cap: `${l.brand} · ${l.collection}`, imageUrl: l.image_url, shot: l.shot, page: l.source_url })),
  ].filter(x => x.imageUrl || x.shot).slice(0, 4)

  const eyebrow = `<div class="tt-eyebrow"><span class="b">VRINGON</span><span class="sep"></span>
    <span>${esc(regionsOf(st.params).join(' · ').toUpperCase())} · ${esc(item)} · ${year}</span></div>`

  // 표지 · 상위 3개 축이 번호 포인트가 된다
  const points = r.elements.slice(0, 3).map((el, i) => `
    <div class="pt"><span class="no">${String(i + 1).padStart(2, '0')}</span>
      <div><div class="pt-t">${esc(el.axis)}</div>
        <div class="pt-d">${esc(el.trends.slice(0, 2).map(x => x.label).join(' · '))}</div></div></div>`)

  out.push(`<section class="slide tpl-trend"><div class="tt-wrap">
    ${eyebrow}
    <div class="tt-cols">
      <div class="tt-left">
        <h1 class="tt-title">${esc(r.headline)}</h1>
        <p class="tt-sub">${esc(r.summary.split(/(?<=[.!?다요])\s/)[0] ?? r.summary)}</p>
        <div class="tt-points">${points.join('')}</div>
      </div>
      <div class="tt-right">
        ${photoPool.map(x => `<div class="tt-cell"><div class="im">${img(x.imageUrl, x.shot, x.page)}</div>
          <div class="tt-cap">${esc(x.cap.slice(0, 44))}</div></div>`).join('')}
      </div>
    </div>
    <div class="tt-foot">
      <span class="k">RESEARCH BASIS</span>
      <span>${r.sources.length} ${esc(t('sources'))}</span>
      ${st.params.direction ? `<span>· ${esc(t('Direction'))}: ${esc(st.params.direction.slice(0, 90))}</span>` : ''}
    </div>
  </div></section>`)

  // 축별 슬라이드 · 같은 종이색, 번호 행
  for (const el of r.elements) {
    const rows = el.trends.map((tr, i) => `
      <div class="tr-row"><span class="no">${String(i + 1).padStart(2, '0')}</span>
        ${tr.image_url ? `<div class="im2">${img(tr.image_url)}</div>` : ''}
        <div class="bd">
          <div class="lb">${esc(tr.label)}</div>
          <div class="ev">${esc(tr.evidence)}</div>
          <div class="mn">${tr.mentions} ${esc(t('sources'))}</div>
        </div></div>`)
    out.push(`<section class="slide tpl-trend"><div class="tt-wrap">
      ${eyebrow}
      <div style="margin-top:7mm">
        <div class="tt-axis">TREND AXIS</div>
        <h1 class="tt-title" style="font-size:22pt">${esc(el.axis)}</h1>
      </div>
      <div style="margin-top:4mm;overflow:hidden;flex:1">${rows.join('')}</div>
    </div></section>`)
  }

  // ── 다음 시즌 예측 · 같은 종이색, "예측" 배지를 정직하게 단다 ─────
  const fc = st.forecast
  if (fc) {
    const confColor = { high: '#3B3F8C', medium: '#6B675C', low: '#8B867A' } as const
    for (let i = 0; i < fc.predictions.length; i += 5) {
      const rows = fc.predictions.slice(i, i + 5).map((p, k) => `
        <div class="tr-row"><span class="no">${String(i + k + 1).padStart(2, '0')}</span>
          <div class="bd">
            <div class="lb">${esc(p.axis)} · ${esc(p.call)}
              <span style="font-size:6.5pt;letter-spacing:.1em;color:${confColor[p.confidence] ?? '#6B675C'};margin-left:2mm;text-transform:uppercase">${esc(t(CONFIDENCE_LABEL[p.confidence]))}</span></div>
            <div class="ev">${esc(p.why)}</div>
            <div class="mn">${esc(t('Watch'))}: ${esc(p.watch)}</div>
          </div></div>`)
      out.push(`<section class="slide tpl-trend"><div class="tt-wrap">
        ${eyebrow}
        <div style="margin-top:7mm">
          <div class="tt-axis">NEXT SEASON OUTLOOK · ${esc(t('Forecast, not fact'))}</div>
          <h1 class="tt-title" style="font-size:22pt">${esc(fc.horizon)}</h1>
          ${i === 0 ? `<p class="tt-sub">${esc(fc.thesis)}</p>` : ''}
        </div>
        <div style="margin-top:4mm;overflow:hidden;flex:1">${rows.join('')}</div>
        ${i + 5 >= fc.predictions.length && fc.risks.length ? `<div class="tt-foot">
          <span class="k">${esc(t('Risks'))}</span><span>${fc.risks.map(esc).join(' · ')}</span></div>` : ''}
      </div></section>`)
    }
  }

  // 출처 · 공통 골격의 담백한 표
  out.push(slide({
    eyebrow: t('Sources'), page: r.elements.length + 2,
    body: `<div style="font-size:8pt;color:#565D63;line-height:1.8;column-count:2;column-gap:8mm">${r.sources.slice(0, 40).map(s => esc(s)).join('<br/>')}</div>`,
  }))
  return { title: r.headline || t('Trend report'), html: out.join('') }
}

// ── 런웨이 덱 · 지역별 럭셔리 격자 ───────────────────────────────────
export function runwayDeckHtml(st: RunState): { title: string; html: string } {
  const r = st.runway
  const out: string[] = []
  let page = 0
  if (!r) return { title: t('Runway report'), html: '' }
  const crawledOn = ymd(st.savedAtISO)
  const byRegion = new Map<string, typeof r.looks>()
  for (const l of r.looks) {
    const k = l.region ?? regionsOf(st.params)[0] ?? ''
    byRegion.set(k, [...(byRegion.get(k) ?? []), l])
  }
  for (const [region, looks] of byRegion) {
    const rr = luxPages({
      eyebrow: 'RUNWAY REPORT',
      meta: [`${looks.length} LOOKS`, `${r.season_now} / ${r.season_next}`],
      brand: region || t('Global runway and collections'),
      sub: `${t('Global runway and collections')} · ${r.season_now} / ${r.season_next}`,
      items: looks.map(l => ({
        name: `${l.brand} · ${l.collection}`,
        sub: `${l.season} · ${l.silhouette.slice(0, 40)}`,
        badge: 'LOOK', badgeKind: 'line' as const,
        imageUrl: l.image_url, shot: l.shot, page: l.source_url,
      })),
      footKey: 'BASIS', footVal: 'RUNWAY · COLLECTION COVERAGE',
      crawledOn, pageStart: page + 1,
    })
    out.push(rr.html); page += rr.pages
  }
  return { title: t('Global runway and collections'), html: out.join('') }
}

// ── 확산 신호 덱 ─────────────────────────────────────────────────────
export function adoptionDeckHtml(st: RunState): { title: string; html: string } {
  const sig = st.adoption ?? []
  const out: string[] = []
  let page = 0
  out.push(slide({
    eyebrow: t('Market adoption'), page: ++page,
    body: `<h1 style="font-size:32px;margin:20px 0 8px">${esc(t('Fashion adoption signals'))}</h1>
      <p style="color:#565D63">${esc(t('Every signal is labelled by its real basis. Exposure is never called sales.'))}</p>`,
  }))
  for (let i = 0; i < sig.length; i += 5) {
    const rows = sig.slice(i, i + 5).map(s => `
      <div style="margin-bottom:12px">
        <div style="font-weight:700">${esc(s.label)}
          <span style="font-size:10.5px;padding:2px 8px;border-radius:99px;background:#EEF0F3;color:#565D63;margin-left:6px">${esc(t(BASIS_LABEL[s.basis]))}</span>
          ${s.region ? `<span style="font-size:10.5px;color:#9AA0AD;margin-left:6px">${esc(s.region)}</span>` : ''}</div>
        <div style="font-size:12.5px;color:#3A3F45;line-height:1.55">${esc(s.evidence)}</div>
      </div>`)
    out.push(slide({ eyebrow: t('Signals'), page: ++page, body: rows.join('') }))
  }
  return { title: t('Fashion adoption signals'), html: out.join('') }
}

// ── 키워드 인사이트 덱 (컬렉션) · 종이색 에디토리얼 ──────────────────
export function keywordDeckHtml(st: RunState): { title: string; html: string } {
  const k = st.insight
  const out: string[] = []
  if (!k) return { title: t('Keyword insight'), html: '' }
  const year = new Date(st.savedAtISO ?? Date.now()).getFullYear()
  const eyebrow = `<div class="tt-eyebrow"><span class="b">VRINGON</span><span class="sep"></span>
    <span>${esc(regionsOf(st.params).join(' · ').toUpperCase())} · KEYWORD · ${year}</span></div>`

  const kv = (label: string, items: string[]) => items.length ? `
    <div class="pt"><span class="no">·</span>
      <div><div class="pt-t">${esc(label)}</div>
        <div class="pt-d">${items.map(esc).join(' · ')}</div></div></div>` : ''

  out.push(`<section class="slide tpl-trend"><div class="tt-wrap">
    ${eyebrow}
    <div class="tt-cols">
      <div class="tt-left" style="flex-basis:56%">
        <h1 class="tt-title" style="font-size:24pt">${esc(st.params.direction.slice(0, 60))}</h1>
        <p class="tt-sub">${esc(k.meaning)}</p>
        <p class="tt-sub" style="margin-top:2mm">${esc(k.cultural)}</p>
      </div>
      <div class="tt-left" style="flex-basis:40%">
        <div class="tt-points">
          ${kv(t('Symbols'), k.symbols.slice(0, 6))}
          ${kv(t('Colors'), k.colors.slice(0, 6))}
          ${kv(t('Materials'), k.materials.slice(0, 6))}
          ${kv(t('Forms'), k.forms.slice(0, 6))}
        </div>
      </div>
    </div>
    <div class="tt-foot"><span class="k">RESEARCH BASIS</span><span>${k.sources.length} ${esc(t('sources'))}</span></div>
  </div></section>`)

  out.push(`<section class="slide tpl-trend"><div class="tt-wrap">
    ${eyebrow}
    <div style="margin-top:7mm"><div class="tt-axis">WHAT TO AVOID</div>
      <h1 class="tt-title" style="font-size:20pt">${esc(t('Common cliches in jewelry'))}</h1></div>
    <div class="tt-points" style="margin-top:4mm">
      ${kv(t('Common cliches in jewelry'), k.cliches)}
      ${kv(t('Cultural cautions'), k.cautions)}
    </div>
  </div></section>`)

  for (let i = 0; i < k.abstraction.length; i += 4) {
    out.push(`<section class="slide tpl-trend"><div class="tt-wrap">
      ${eyebrow}
      <div style="margin-top:7mm"><div class="tt-axis">ABSTRACTION</div></div>
      <div class="tt-points" style="margin-top:2mm">
        ${k.abstraction.slice(i, i + 4).map(ax => kv(ax.axis, ax.notes)).join('')}
      </div>
    </div></section>`)
  }
  return { title: t('Keyword insight'), html: out.join('') }
}

