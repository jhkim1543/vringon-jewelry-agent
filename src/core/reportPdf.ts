// ── 트렌드 리포트 · 발표용 슬라이드 덱 ──────────────────────────────
// 도시에와 같은 뼈대를 쓴다. 이쪽은 서술형 리포트라 장수가 적다.
// 화면(Run)에서는 텍스트로 읽고, 여기서는 발표에 그대로 쓸 수 있는 형태로 나간다.
import type { RunState, Design } from './types'
import { CAT_LABEL, MODE_LABEL, TYPE_LABEL } from './types'
import type { TrendReport } from './research'
import { downloadDeck, esc, printDeck, slide } from './deck'

const ACCENT = '#3B45C8'

function pics(st: RunState) {
  const all = st.designs.flatMap((d: Design) => d.images.map(i => i.url ? { view: i.view, url: i.url } : null))
    .filter(Boolean) as { view: string; url: string }[]
  const of = (v: string) => all.filter(i => i.view === v).map(i => i.url)
  return { concept: of('concept'), wear: of('wear'), any: all.filter(i => i.view !== 'sketch').map(i => i.url) }
}
const at = (l: string[], i: number) => (l.length ? l[i % l.length] : '')
const img = (url: string, cls = '') => url
  ? `<div class="frame ${cls}"><img class="ph" src="${esc(url)}" alt=""></div>`
  : `<div class="frame ${cls}"><div class="ph"></div></div>`

function build(st: RunState): { title: string; html: string } {
  const rep = st.trendReport as TrendReport
  const p = st.params
  const pool = pics(st)
  const item = `${CAT_LABEL[p.category]} / ${TYPE_LABEL[p.itemType] ?? p.itemType}`
  const band = p.mode === 'trend'
    ? `KRW ${(p.trend.priceMinKrw / 10000).toFixed(0)}0k–${(p.trend.priceMaxKrw / 10000).toFixed(0)}0k · ${p.trend.priceBand}`
    : ''
  const eyebrow = `${item} trend report`
  const out: string[] = []
  let page = 0
  const P = () => ++page

  // 표지
  out.push(slide({
    bare: true,
    body: `<div style="display:flex;height:100%">
      <div style="flex:1;background:${ACCENT};color:#fff;padding:24mm 16mm;display:flex;flex-direction:column">
        <div style="font-size:9pt;letter-spacing:.3em;font-weight:800">VRINGON</div>
        <div style="font-size:7pt;letter-spacing:.24em;opacity:.75;margin-top:1mm">TREND REPORT</div>
        <h1 class="title" style="margin-top:auto;color:#fff;font-size:26pt">${esc(rep.title)}</h1>
        <div style="margin-top:auto;font-size:8pt;opacity:.85;line-height:1.7">
          ${esc(item)}${band ? `<br>${esc(band)}` : ''}<br>
          ${esc(MODE_LABEL[p.mode])} mode · ${st.signals.length} signals
        </div>
      </div>
      <div style="flex:1.15">${img(at(pool.concept, 0) || at(pool.any, 0))}</div>
    </div>`,
  }))

  // 요약
  out.push(slide({
    eyebrow, tag: 'SUMMARY', page: P(),
    body: `<div class="cols">
      <div style="flex:1.1">
        <h2 class="stitle">What to do <span class="thin">this season</span></h2>
        <div class="quote" style="color:${ACCENT};font-size:10.5pt">${esc(rep.executive_view)}</div>
        <div style="margin-top:6mm;font-size:8pt;color:#565D63;line-height:1.65">
          Signals below are the ones this report is built on. Each is linked to the pages it was observed on,
          and a signal seen only once is marked low confidence rather than promoted.
        </div>
        <div style="margin-top:4mm">
          ${st.signals.slice(0, 6).map(s => `<div style="display:flex;gap:3mm;padding:2mm 0;border-bottom:.25mm solid #EEF1F5;font-size:8pt">
            <b style="flex:1">${esc(s.label)}</b>
            <span style="color:#8A9099">${esc(s.axis)}</span>
            <span style="color:${ACCENT};font-weight:700">${s.observed_count}×</span>
            <span style="color:#8A9099">${esc(s.confidence)}</span>
          </div>`).join('')}
        </div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:4mm">
        <div style="flex:1">${img(at(pool.any, 1))}</div>
        <div style="flex:1;display:flex;gap:4mm">
          <div style="flex:1">${img(at(pool.wear, 0))}</div>
          <div style="flex:1">${img(at(pool.concept, 1))}</div>
        </div>
      </div>
    </div>`,
  }))

  // 디자인 시사점
  if (rep.design_implications?.length) {
    const chunk = 6
    for (let i = 0; i < rep.design_implications.length; i += chunk) {
      const part = rep.design_implications.slice(i, i + chunk)
      out.push(slide({
        eyebrow, tag: 'IMPLICATIONS', page: P(),
        body: `<h2 class="stitle">What to change <span class="thin">in the design</span></h2>
          <div class="grid2" style="gap:6mm 10mm">
            ${part.map(x => `<div style="border-top:.5mm solid ${ACCENT};padding-top:2.5mm">
              <div style="font-size:7pt;letter-spacing:.12em;text-transform:uppercase;color:${ACCENT};font-weight:800">${esc(x.area)}</div>
              <div style="font-size:8.6pt;line-height:1.55;margin-top:1.5mm">${esc(x.guidance)}</div>
              <div style="font-size:7pt;color:#8A9099;margin-top:1.5mm">From: ${esc(x.basis)}</div>
            </div>`).join('')}
          </div>`,
      }))
    }
  }

  // 본문
  const paras = (rep.body_markdown ?? '').split(/\n{2,}/).filter(Boolean)
  const perSlide = 7
  for (let i = 0; i < paras.length; i += perSlide) {
    const part = paras.slice(i, i + perSlide)
    out.push(slide({
      eyebrow, tag: 'REPORT', page: P(),
      body: `<div class="cols">
        <div style="flex:1.35;font-size:8.2pt;line-height:1.62;color:#40474F;column-count:2;column-gap:8mm">
          ${part.map(x => {
            const h = /^(#{2,4})\s+(.*)$/.exec(x.trim())
            if (h) return `<h3 class="sub" style="color:${ACCENT};break-after:avoid">${esc(h[2])}</h3>`
            return `<p>${esc(x)}</p>`
          }).join('')}
        </div>
        <div style="flex:.55">${img(at(pool.any, 2 + i))}</div>
      </div>`,
    }))
  }

  // 미확인 + 출처
  out.push(slide({
    eyebrow, tag: 'SOURCES', page: P(),
    body: `<h2 class="stitle">Sources <span class="thin">and what is still open</span></h2>
      <div class="grid2" style="gap:10mm">
        <div>
          <h3 class="sub">Every claim traces here</h3>
          <table class="src">
            ${(rep.sources ?? []).map((s, i) => `<tr><td class="n">${i + 1}</td><td class="u">${esc(s)}</td></tr>`).join('')}
          </table>
        </div>
        <div>
          <h3 class="sub">Still unverified</h3>
          ${(rep.open_questions ?? []).map(q => `<div style="font-size:8.2pt;padding:2mm 0;border-bottom:.25mm solid #EEF1F5">${esc(q)}</div>`).join('')}
          <div class="note" style="margin-top:5mm">
            Numbers that could not be confirmed are left out rather than estimated.
            Imagery in this report was generated, not photographed.
          </div>
        </div>
      </div>`,
  }))

  return { title: rep.title, html: out.join('\n') }
}

/** 덱 HTML만 필요할 때 (미리보기·검증용) */
export function trendDeckHtml(st: RunState) { return build(st) }

export function openTrendReportPdf(st: RunState) {
  if (!st.trendReport) return
  const { title, html } = build(st)
  printDeck(title, html)
}

export function saveTrendReportHtml(st: RunState) {
  if (!st.trendReport) return
  const { title, html } = build(st)
  downloadDeck('VRINGON_trend_report.html', title, html)
}
