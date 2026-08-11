// ── 시즌 도시에 · 발표용 슬라이드 덱 ────────────────────────────────
// 첨부받은 MICAM / Livetrend 바이어스 가이드의 구성을 그대로 따른다.
//   표지 → 인트로(WHAT·WHY·WHO·HOW) → 데이터 소스와 등급 → 시즌 서사
//   → 오버뷰(매크로 4) → 매크로마다 무드·팔레트 / 소재·디테일 / 키아이템(여·남·키즈)
//   → 연도별 흐름 → 출처 → 클로징
// 가로 A4 한 장이 슬라이드 한 장이다.
/** esc() 를 거친 텍스트 안의 [제목](url) 을 클릭되는 링크로 바꾼다.
 *  조사 문장이 출처를 이 형태로 들고 오는데, 그대로 두면 괄호와 주소가 글을 덮는다. */
function mdLinks(escaped: string): string {
  return escaped.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer" style="color:#3B45C8;text-decoration:underline;text-underline-offset:.8mm">$1</a>')
}

import type { RunState, Design } from './types'
import { CAT_LABEL, TYPE_LABEL, MODE_LABEL, metalProgramOf, stoneProgramOf } from './types'
import type { SeasonDossier, DossierMetric, Macrotrend } from './research'
import { GRADE_LABEL, SOURCE_LABEL, metricText, reportPhoto } from './research'
import { DECK_CSS, downloadDeck, esc, isLight, printDeck, slide } from './deck'

// 매크로마다 색을 하나씩 준다. MICAM이 트렌드별로 색을 정해 쓰는 방식과 같다.
const MACRO_COLORS = ['#3F5148', '#1E6FB8', '#8A4A2B', '#7B87C4']
const GRADE_TINT: Record<string, [string, string]> = {
  edgy: ['#E8F5E9', '#2E5B34'],
  early_sign: ['#F3E8FB', '#5B3A78'],
  safe: ['#E4E9F2', '#33415C'],
  big: ['#F8DEDE', '#8C2F2F'],
  stable: ['#FBF1DA', '#7A5C1E'],
  last_call: ['#FDE6DC', '#8A4326'],
}

/** 덱에 쓸 이미지를 실행 결과에서 고른다. 새로 만들지 않고 이미 만든 것을 쓴다. */
function imagePool(st: RunState) {
  const all = st.designs.flatMap((d: Design) => d.images.map(i => ({ ...i, id: d.spec.design_id })))
  const pick = (view: string) => all.filter(i => i.view === view).map(i => i.url)
  return {
    concept: pick('concept'),
    wear: pick('wear'),
    render: all.filter(i => i.origin === 'generated' && i.view !== 'sketch').map(i => i.url),
    variation: pick('variation'),
    sketch: pick('sketch'),
    any: all.filter(i => i.view !== 'sketch').map(i => i.url),
  }
}

const at = (list: string[], i: number) => (list.length ? list[i % list.length] : '')

// 사진이 없으면 아무것도 그리지 않는다. 빈 프레임을 두면 그 자리가 통째로 여백이 된다.
// 링크가 죽었을 때도 깨진 아이콘 대신 칸째로 사라지게 한다.
function img(url: string, cls = '') {
  if (!url) return ''
  return `<div class="frame ${cls}"><img class="ph" src="${esc(url)}" alt=""
    onerror="this.closest('.frame').remove()"></div>`
}

function statBar(m: DossierMetric, color: string) {
  return `<div class="stat" style="background:${color}">
    <span class="v">${esc(metricText(m))}</span>
    <span class="l">${esc(m.label)}</span>
    <span class="src">${esc(SOURCE_LABEL[m.source_kind] ?? m.source_kind)}</span>
  </div>`
}

function paletteStrip(m: Macrotrend) {
  if (!m.palette?.length) return ''
  const sw = (c: Macrotrend['palette'][number]) => `
    <div class="sw ${isLight(c.hex) ? 'dark' : ''}" style="background:${esc(c.hex)}">
      <div class="n">${esc(c.name)}</div>
      <div class="c">${esc(c.pantone_tcx || '—')}</div>
      <div class="c">${esc(c.hex)}</div>
    </div>`
  // 금속 톤·스톤 색·무드는 서로 다른 사양이다. layer 가 있으면 층을 나눠 그린다.
  // 옛 도시에에는 layer 가 없으므로 그때는 예전처럼 한 띠로 나간다.
  if (m.palette.some(c => c.layer)) {
    return (['metal', 'stone', 'mood'] as const).map(ly => {
      const cs = m.palette.filter(c => c.layer === ly)
      if (!cs.length) return ''
      return `<div style="display:flex;align-items:stretch;margin-top:.6mm">
        <div style="width:13mm;flex-shrink:0;display:flex;align-items:center;font-size:6pt;font-weight:800;letter-spacing:.12em;color:#8A9099">${ly.toUpperCase()}</div>
        <div class="palette" style="flex:1">${cs.map(sw).join('')}</div>
      </div>`
    }).join('')
  }
  return `<div class="palette">${m.palette.map(sw).join('')}</div>`
}

function keyItemCard(k: Macrotrend['key_items'][number], color: string, pic: string) {
  const [bg, fg] = GRADE_TINT[k.grade] ?? ['#EEF1F5', '#40474F']
  // 사진은 조사에서 찾은 참고 이미지가 우선이다 — 예측을 눈으로 확인시키는 자리라서.
  // 없으면 이번 분석이 만든 렌더를 쓰고, 그것도 없으면 사진 칸 자체를 접는다.
  // (빈 프레임을 그리면 카드의 절반이 흰 여백으로 남는다.)
  const ref = k as { reference_image_url?: string; reference_page_url?: string; reference_note?: string }
  const refPic = reportPhoto({ image_urls: ref.reference_image_url ? [ref.reference_image_url] : [] })
  const shown = refPic || pic
  const m = k.metric
  return `<div class="kitem">
    <div class="side" style="background:${color}">${esc(k.name)}</div>
    <div class="body">
      <div class="top">
        <span class="pct">${esc(m ? metricText(m) : '—')}</span>
        <span class="yoy">YoY</span>
        <span class="grade" style="background:${bg};color:${fg}">${esc(GRADE_LABEL[k.grade] ?? k.grade)}</span>
      </div>
      ${shown ? img(shown, 'pic') : ''}
      <p>${esc(k.description)}</p>
      <div class="spec">${esc(k.silhouette_spec)}</div>
      ${refPic && ref.reference_note
        ? `<div class="kref">Seen at: ${esc(ref.reference_note)}</div>`
        : ''}
      ${m?.observed_note
        ? `<div class="kref">${esc(SOURCE_LABEL[m.source_kind] ?? m.source_kind)} · ${esc(m.observed_note)}</div>`
        : ''}
    </div>
  </div>`
}

function buildDeck(st: RunState): { title: string; html: string } {
  const d = st.dossier as SeasonDossier
  const p = st.params
  const pool = imagePool(st)
  const item = `${CAT_LABEL[p.category]} / ${TYPE_LABEL[p.itemType] ?? p.itemType}`
  const band = p.mode === 'trend'
    ? `KRW ${(p.trend.priceMinKrw / 10000).toFixed(0)}0k–${(p.trend.priceMaxKrw / 10000).toFixed(0)}0k · ${p.trend.priceBand}`
    : ''
  // 예측 대상 시즌. 옛 도시에에는 없으므로 season 으로 떨어진다.
  const fc = (d as { forecast_season?: string }).forecast_season ?? d.season
  // 조사 지문 · 이 도시에가 어느 라인을 보고 쓰였는지 표지에 밝힌다
  const lineStr = p.line ? `${metalProgramOf(p.line)} · ${stoneProgramOf(p.line)}` : ''

  const eyebrow = `${d.season} ${CAT_LABEL[p.category]} trends`
  const out: string[] = []
  let page = 0
  const P = () => ++page

  // ── 1 표지 ────────────────────────────────────────────────────
  // 표지 그림은 생성한 무드컷을 먼저 쓴다 · 없으면 이번 분석의 컷으로 채운다
  const art = st.reportArt
  // 생성 아트는 마지막 보루다 · 이번 분석의 실제 컷이 먼저 쓰이고, 빈 칸일 때만 아트가 들어간다.
  const artList = [art?.cover ?? '', ...Object.values(art?.sections ?? {})].filter(Boolean)
  const fill = (l: string[], i: number) => at(l, i) || at(artList, i)
  out.push(slide({
    bare: true,
    body: `<div style="display:flex;height:100%">
      <div style="flex:1.15;position:relative;overflow:hidden">
        ${img(art?.cover || at(pool.concept, 0) || at(pool.any, 0))}
      </div>
      <div style="flex:1;background:#14181D;color:#fff;padding:24mm 16mm;display:flex;flex-direction:column">
        <div style="font-size:9pt;letter-spacing:.3em;font-weight:800">VRINGON</div>
        <div style="font-size:7pt;letter-spacing:.24em;color:#8A9099;margin-top:1mm">DESIGN AGENT</div>
        <h1 class="title" style="margin-top:auto;color:#fff">${esc(d.season)}<br>${esc(d.season_title)}</h1>
        ${d.powershift ? `<div style="margin-top:5mm;font-size:11pt;color:#8793FF;font-weight:700;letter-spacing:.04em">${esc(d.powershift)}</div>` : ''}
        <div style="margin-top:auto;font-size:8pt;color:#8A9099;line-height:1.7">
          ${esc(item)}${lineStr ? `<br>${esc(lineStr)}` : ''}${band ? `<br>${esc(band)}` : ''}<br>
          ${esc(MODE_LABEL[p.mode])} mode · Collected ${esc(d.collected_at)} · ${esc(d.searches)} searches · ${(d.sources ?? []).length} sources
        </div>
      </div>
    </div>`,
  }))

  // ── 2 인트로 ──────────────────────────────────────────────────
  const quad = (k: string, colour: string, text: string) => `
    <div>
      <div style="background:${colour};color:#fff;padding:2.4mm 5mm;border-radius:1mm;font-size:9pt;
                  font-weight:800;letter-spacing:.14em;margin-bottom:3mm;display:inline-block">${k}</div>
      <p style="font-size:8.4pt;line-height:1.65;color:#40474F">${text}</p>
    </div>`
  out.push(slide({
    eyebrow, tag: 'INTRO', page: P(),
    body: `<h2 class="stitle">INTRO <span class="thin">how this was built</span></h2>
      <div class="grid2" style="gap:10mm">
        ${quad('WHAT', '#8A3B3B', `A season dossier for ${esc(item)}, assembled by an agent that researches first and designs second. It maps the season into four macrotrends and carries each one down to key items a buyer can act on.`)}
        ${quad('WHO', '#3F8FA8', 'Built by the VRINGON Design Agent. Web research runs on OpenAI with search enabled; imagery is generated, not photographed. No stock library is used.')}
        ${quad('WHY', '#C06A22', 'Trend decks usually assert. This one shows its working: every figure states which data source produced it and links to the page it came from, so a buyer can disagree with the evidence rather than the conclusion.')}
        ${quad('HOW', '#2F6B8F', 'Four sources are read separately and always year on year: e-commerce assortments, Instagram visibility, runway appearances and search volume. Anything unverified is marked as a direction rather than given a made-up percentage.')}
      </div>`,
  }))

  // ── 3 데이터 소스 · 등급 ──────────────────────────────────────
  const SRC_ROWS: [string, string, string][] = [
    ['MARKET', '#5C7C6B', 'Year-on-year change in e-commerce assortments, sell-outs and restocks'],
    ['SOCIAL', '#3F8FA8', 'Year-on-year growth in visibility on Instagram'],
    ['SHOWS', '#8A4A2B', 'Year-on-year growth in runway and collection appearances'],
    ['CONSUMER', '#7B87C4', 'Year-on-year growth in search volume'],
  ]
  out.push(slide({
    eyebrow, tag: 'METHOD', page: P(),
    body: `<h2 class="stitle">DATA <span class="thin">& how a trend is graded</span></h2>
      <div class="grid2" style="gap:12mm">
        <div>
          <h3 class="sub">Data sources</h3>
          ${SRC_ROWS.map(([k, c, t]) => `<div class="stat" style="background:${c}">
            <span class="l" style="flex:0 0 24mm">${k}</span>
            <span style="font-size:7.6pt;font-weight:400;line-height:1.4">${t}</span>
          </div>`).join('')}
          <div class="note" style="margin-top:5mm">
            Every number in this deck is year on year and carries the source that produced it.
            Where a published figure could not be found, the entry shows a direction — surging, rising,
            steady or softening — instead of an invented percentage.
          </div>
        </div>
        <div>
          <h3 class="sub">Trend classification</h3>
          <div class="legend" style="grid-template-columns:1fr">
            ${(Object.keys(GRADE_TINT)).map(g => {
              const [bg, fg] = GRADE_TINT[g]
              const note: Record<string, string> = {
                edgy: 'Weak signal. A micro trend might form. Very high risk.',
                early_sign: 'Emerging. Real upside, but the risk is still large.',
                safe: 'Already announced, growing, low risk.',
                big: 'High commercial potential and quick adoption.',
                stable: 'Already in the market, growth is flat.',
                last_call: 'Declining outlook, still sellable this season.',
              }
              return `<div class="row">
                <span class="key" style="background:${bg};color:${fg}">${esc(GRADE_LABEL[g as keyof typeof GRADE_LABEL] ?? g)}</span>
                <span style="color:#40474F">${note[g]}</span>
              </div>`
            }).join('')}
          </div>
        </div>
      </div>`,
  }))

  // ── 3.5 관측된 시장 · 예측은 실물에서 출발한다. 조사에서 사진으로 확인된
  //     경쟁 제품과 백화점 베스트셀러를 예측 앞에 먼저 보여준다.
  const marketShots = [
    ...(st.bestsellers ?? []).map(b => ({
      u: reportPhoto(b),
      cap: `<b>${esc(b.brand)}</b> ${esc(b.name)}`,
      sub: `${esc(b.retailer)}${b.rank_note ? ` · ${esc(b.rank_note)}` : ''}`,
    })),
    ...(st.competitors ?? []).map(c => ({
      u: reportPhoto(c),
      cap: `<b>${esc(c.brand)}</b> ${esc(c.name)}`,
      sub: `${c.price_krw ? `KRW ${(c.price_krw / 10000).toFixed(1)}만` : ''}${c.competitor_class ? ` · ${esc(c.competitor_class)}` : ''}`,
    })),
  ].filter(x => x.u).slice(0, 8)
  if (marketShots.length) {
    out.push(slide({
      eyebrow, tag: 'OBSERVED MARKET', page: P(),
      body: `<h2 class="stitle">OBSERVED <span class="thin">what is actually selling, before any forecast</span></h2>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5mm;margin-top:4mm">
          ${marketShots.map(x => `<div class="frame" style="display:flex;flex-direction:column">
            <img class="ph" src="${esc(x.u)}" alt="" style="height:34mm;object-fit:cover"
              onerror="this.closest('.frame').style.display='none'">
            <div style="font-size:7pt;padding:1.5mm 0;line-height:1.45">${x.cap}<br><span style="color:#8A9099">${x.sub}</span></div>
          </div>`).join('')}
        </div>
        <div class="note" style="margin-top:4mm">Bestseller listings and competitor products photographed by their retailers, captured at research time. The forecast that follows is read against these.</div>`,
    }))
  }

  // ── 4 시즌 서사 ───────────────────────────────────────────────
  const paras = (d.season_narrative ?? '').split(/\n{2,}/).filter(Boolean)
  out.push(slide({
    eyebrow, tag: 'SEASON', page: P(),
    body: `<div class="cols">
      <div style="flex:1.05;display:flex;flex-direction:column;gap:4mm">
        ${img(fill(pool.render, 0), '')}
        <div style="display:flex;gap:4mm;height:46mm">
          <div style="flex:1">${img(at(pool.wear, 0) || fill(pool.any, 1))}</div>
          <div style="flex:1">${img(at(pool.concept, 1) || fill(pool.any, 2))}</div>
        </div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column">
        <h2 class="stitle">${esc(d.season)} <span class="thin">${esc(d.season_title)}</span></h2>
        <div style="font-size:8.2pt;line-height:1.62;color:#40474F;overflow:hidden">
          ${paras.slice(0, 5).map(x => `<p>${esc(x)}</p>`).join('')}
        </div>
      </div>
    </div>`,
  }))

  // ── 5 오버뷰 ──────────────────────────────────────────────────
  out.push(slide({
    eyebrow, tag: 'OVERVIEW', page: P(),
    body: `<h2 class="stitle">OVERVIEW <span class="thin">four macrotrends</span></h2>
      <div class="grid4" style="height:calc(100% - 22mm)">
        ${(d.macrotrends ?? []).map((m, i) => {
          const c = MACRO_COLORS[i % MACRO_COLORS.length]
          return `<div style="display:flex;flex-direction:column;gap:3mm">
            <div style="font-size:26pt;font-weight:800;color:${c};line-height:1">${i + 1}</div>
            <div style="height:42mm">${img(fill(pool.any, i * 2))}</div>
            <div style="background:${c};color:#fff;padding:2mm 3mm;border-radius:1mm;
                        font-size:8.5pt;font-weight:800;letter-spacing:.06em;text-align:center">${esc(m.name)}</div>
            <div style="font-size:7.2pt;color:#565D63;line-height:1.5">${(m.sub_trends ?? []).map(esc).join('<br>')}</div>
          </div>`
        }).join('')}
      </div>`,
  }))

  // ── 6 매크로별 ────────────────────────────────────────────────
  ;(d.macrotrends ?? []).forEach((m, i) => {
    const c = MACRO_COLORS[i % MACRO_COLORS.length]
    const [gbg, gfg] = GRADE_TINT[m.grade] ?? ['#EEF1F5', '#40474F']
    const narr = (m.narrative ?? '').split(/\n{2,}/).filter(Boolean)

    // 6a 무드 + 팔레트
    out.push(slide({
      eyebrow, tag: `MACRO ${i + 1}`, page: P(),
      body: `<div style="display:flex;flex-direction:column;height:100%">
        <div class="cols" style="flex:1;min-height:0">
          <div style="flex:1;display:flex;flex-direction:column;gap:3mm">
            <div style="display:flex;align-items:baseline;gap:3mm">
              <h2 class="stitle" style="margin:0;color:${c}">${esc(m.name)}</h2>
              <span class="grade" style="background:${gbg};color:${gfg};font-size:7pt;font-weight:800;
                    letter-spacing:.08em;text-transform:uppercase;padding:1mm 2.5mm;border-radius:4mm">
                ${esc(GRADE_LABEL[m.grade] ?? m.grade)}</span>
            </div>
            <div>${(m.sub_trends ?? []).map(s => `<span class="chip" style="background:${c}">${esc(s)}</span>`).join('')}</div>
            <div style="margin-top:1mm">${(m.drivers ?? []).slice(0, 3).map(x => statBar(x, c)).join('')}</div>
            <div style="font-size:8pt;line-height:1.6;color:#40474F;margin-top:1mm;overflow:hidden;flex:1;min-height:0">
              ${narr.slice(0, 3).map(x => `<p>${mdLinks(esc(x))}</p>`).join('')}
            </div>
            <div class="quote" style="color:${c};margin-top:auto">${esc(m.statement)}</div>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;gap:3mm">
            <div style="flex:1.3">${img(art?.sections?.[m.name] || at(pool.concept, i) || at(pool.any, i))}</div>
            <div style="flex:1;display:flex;gap:3mm">
              <div style="flex:1">${img(at(pool.render, i) || fill(pool.any, i + 1))}</div>
              <div style="flex:1">${img(at(pool.wear, i) || fill(pool.any, i + 2))}</div>
            </div>
          </div>
        </div>
        <div style="margin-top:4mm">${paletteStrip(m)}</div>
      </div>`,
    }))

    // 6b 소재 · 디테일
    if ((m.materials ?? []).length || (m.details ?? []).length) {
      out.push(slide({
        eyebrow, tag: `MACRO ${i + 1}`, page: P(),
        body: `<h2 class="stitle" style="color:${c}">${esc(m.name)} <span class="thin">materials & details</span></h2>
          <div class="grid2" style="gap:10mm;height:calc(100% - 24mm)">
            <div>
              <h3 class="sub">Materials</h3>
              ${(m.materials ?? []).map(x => `
                <div style="display:flex;gap:4mm;align-items:center;padding:2.6mm 0;border-bottom:.25mm solid #EEF1F5">
                  <span style="font-size:13pt;font-weight:800;color:${c};flex:0 0 24mm">${esc(metricText(x))}</span>
                  <span style="flex:1">
                    <b style="font-size:8.4pt">${esc(x.label)}</b>
                    <div style="font-size:7pt;color:#8A9099">${esc(SOURCE_LABEL[x.source_kind] ?? x.source_kind)} · ${esc(x.observed_note)}</div>
                  </span>
                </div>`).join('')}
            </div>
            <div>
              <h3 class="sub">Construction details</h3>
              ${(m.details ?? []).map(x => `
                <div style="display:flex;gap:4mm;align-items:center;padding:2.6mm 0;border-bottom:.25mm solid #EEF1F5">
                  <span style="font-size:13pt;font-weight:800;color:${c};flex:0 0 24mm">${esc(metricText(x))}</span>
                  <span style="flex:1">
                    <b style="font-size:8.4pt">${esc(x.label)}</b>
                    <div style="font-size:7pt;color:#8A9099">${esc(SOURCE_LABEL[x.source_kind] ?? x.source_kind)} · ${esc(x.observed_note)}</div>
                  </span>
                </div>`).join('')}
            </div>
          </div>`,
      }))
    }

    // 6c 키아이템 · 세그먼트별
    const segs: [string, string][] = [['women', 'Women'], ['men', 'Men'], ['kids', 'Kids']]
    for (const [seg, label] of segs) {
      const items = (m.key_items ?? []).filter(k => k.segment === seg)
      if (!items.length) continue
      out.push(slide({
        eyebrow, tag: `MACRO ${i + 1}`, page: P(),
        // 칸은 아이템 수만큼만 연다. 세 칸에 한 장만 들어가면 나머지 2/3가 통째로 흰 여백이 된다.
        body: `<h2 class="stitle" style="color:${c}">KEY ITEMS <span class="thin">${esc(label)} · ${esc(m.name)}</span></h2>
          <div class="grid3" style="height:calc(100% - 24mm);grid-template-columns:repeat(${Math.min(items.length, 3)},1fr)">
            ${items.slice(0, 3).map((k, j) => keyItemCard(k, c, fill(pool.variation.length ? pool.variation : pool.any, i * 3 + j))).join('')}
          </div>`,
      }))
    }
  })

  // ── 6d 매크로별 다음 시즌 판단 · 이 문서의 결론에 해당한다
  ;(d.macrotrends ?? []).forEach((m, i) => {
    const call = (m as { next_season_call?: string }).next_season_call
    const conf = (m as { confidence?: string }).confidence
    if (!call) return
    const c = MACRO_COLORS[i % MACRO_COLORS.length]
    out.push(slide({
      eyebrow, tag: `MACRO ${i + 1} · NEXT`, page: P(),
      body: `<h3 class="sub">${esc(fc)} FORECAST</h3>
        <h2 class="stitle" style="color:${c}">${esc(m.name)} <span class="thin">next season</span></h2>
        <div class="cols" style="margin-top:4mm">
          <div style="flex:1.3">
            <p style="font-size:11pt;line-height:1.5">${esc(call)}</p>
            ${conf ? `<div style="margin-top:4mm;display:inline-flex;align-items:center;gap:2mm;
                  background:#EEF1F5;padding:1.4mm 3mm;border-radius:4mm;font-size:7.5pt;
                  font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#40474F">
                  CONFIDENCE ${esc(conf)}</div>` : ''}
          </div>
          <div style="flex:1">
            <h3 class="sub">CARRIES OVER</h3>
            ${(m.sub_trends ?? []).map(x => `<div style="font-size:9pt;padding:1.4mm 0;border-bottom:.2mm solid #E3E7EC">${esc(x)}</div>`).join('')}
          </div>
        </div>`,
    }))
  })

  // ── 7 연도별 흐름 ─────────────────────────────────────────────
  if ((d.yearly_context ?? []).length) {
    out.push(slide({
      eyebrow, tag: 'CONTEXT', page: P(),
      body: `<h2 class="stitle">HOW WE GOT HERE <span class="thin">season by season</span></h2>
        <div style="margin-top:4mm">
          ${d.yearly_context.map(y => `<div class="yr">
            <b>${esc(y.season)}</b>
            <div style="flex:1">
              <div style="font-weight:700;font-size:9pt">${esc(y.headline)}</div>
              <div style="color:#565D63;margin-top:.8mm">${esc(y.what_changed)}</div>
              ${y.source_url ? `<div style="color:#3B45C8;font-size:7pt;margin-top:.8mm">${esc(y.source_url)}</div>` : ''}
            </div>
          </div>`).join('')}
        </div>
        ${d.method_note ? `<div class="note" style="margin-top:6mm">${esc(d.method_note)}</div>` : ''}`,
    }))
  }

  // ── 8 출처 ────────────────────────────────────────────────────
  if ((d.sources ?? []).length) {
    out.push(slide({
      eyebrow, tag: 'SOURCES', page: P(),
      body: `<h2 class="stitle">SOURCES <span class="thin">everything above traces here</span></h2>
        <table class="src">
          ${d.sources.map((s, i2) => `<tr>
            <td class="n">ds.e${i2 + 1}</td>
            <td><b>${esc(s.title || s.url)}</b><div style="color:#8A9099">${esc(s.used_for)}</div></td>
            <td class="u">${esc(s.url)}</td>
          </tr>`).join('')}
        </table>
        ${(d.open_questions ?? []).length ? `<div class="note" style="margin-top:5mm">
          <b>Still unverified.</b> ${d.open_questions.map(esc).join(' · ')}
        </div>` : ''}`,
    }))
  }

  // ── 9 클로징 ──────────────────────────────────────────────────
  out.push(slide({
    bare: true,
    body: `<div style="display:flex;height:100%">
      <div style="flex:1;background:#14181D;color:#fff;padding:26mm 16mm;display:flex;flex-direction:column">
        <div style="font-size:9pt;letter-spacing:.3em;font-weight:800">VRINGON</div>
        <h1 class="title" style="margin-top:auto;color:#fff;font-size:26pt">Read it, then<br>argue with it.</h1>
        <p style="margin-top:6mm;font-size:8.4pt;color:#8A9099;line-height:1.7">
          Every figure in this deck states the source it came from and links to the page.
          Where a number could not be verified it is shown as a direction, not an estimate.
          Costs referenced elsewhere in the run are rough and exclude duty, freight, vendor margin and defect rate.
        </p>
        <p style="margin-top:4mm;font-size:8.4pt;color:#8A9099;line-height:1.7">
          The imagery here was generated, not photographed. The people in it are not real.
        </p>
        <div style="margin-top:auto;font-size:7pt;letter-spacing:.2em;color:#565D63">
          ${esc(MODE_LABEL[p.mode])} MODE · ${esc(d.collected_at)}
        </div>
      </div>
      <div style="flex:1.15">${img(at(pool.concept, 2) || fill(pool.any, 3))}</div>
    </div>`,
  }))

  return { title: `${d.season} ${d.season_title}`, html: out.join('\n') }
}

/** 덱 HTML만 필요할 때 (미리보기·검증용) */
export function dossierDeckHtml(st: RunState) { return buildDeck(st) }

export function openDossierPdf(st: RunState) {
  if (!st.dossier) return
  const { title, html } = buildDeck(st)
  printDeck(title, html)
}

export function saveDossierHtml(st: RunState) {
  if (!st.dossier) return
  const { title, html } = buildDeck(st)
  const d = st.dossier as SeasonDossier
  downloadDeck(`VRINGON_${d.season}_dossier.html`, title, html)
}

export { DECK_CSS }
