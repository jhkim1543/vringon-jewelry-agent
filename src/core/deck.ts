// ── 인쇄용 슬라이드 덱 · 공통 뼈대 ──────────────────────────────────
// 팝업으로 창을 띄우면 차단기에 막혀 아무 일도 안 일어난 것처럼 보인다.
// 같은 문서 안의 숨은 iframe에 그려 넣고 그쪽을 인쇄하면 차단당하지 않는다.
// 저장이 막힌 환경을 위해 HTML 파일 내려받기도 함께 둔다.

export const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 가로 A4 한 장 = 슬라이드 한 장. 화면 비율은 297×210mm. */
export const DECK_CSS = `
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #E9EBEF; }
  body { font: 10pt/1.55 "Helvetica Neue", -apple-system, "Segoe UI", Roboto, sans-serif; color: #14181D; }
  a { color: inherit; text-decoration: none; }

  .slide {
    position: relative; width: 297mm; height: 210mm; overflow: hidden;
    background: #FFFFFF; margin: 0 auto 6mm; page-break-after: always; break-after: page;
  }
  .slide:last-child { page-break-after: auto; break-after: auto; }

  /* 머리글 · 모든 슬라이드 공통 */
  .shead {
    position: absolute; top: 0; left: 0; right: 0; height: 9mm;
    display: flex; align-items: center; gap: 6mm; padding: 0 9mm;
    font-size: 7pt; letter-spacing: .12em; text-transform: uppercase; color: #8A9099;
    border-bottom: .3mm solid #E3E7EC;
  }
  .shead .brand { font-weight: 800; color: #14181D; letter-spacing: .18em; }
  .shead .right { margin-left: auto; display: flex; align-items: center; gap: 4mm; }
  .shead .tagpill { background: #14181D; color: #fff; padding: 1mm 3mm; border-radius: 1mm; letter-spacing: .1em; }

  .sbody { position: absolute; top: 9mm; left: 0; right: 0; bottom: 7.5mm; padding: 6mm 9mm 0; }
  .sfoot {
    position: absolute; bottom: 0; left: 0; right: 0; height: 7.5mm;
    display: flex; align-items: center; padding: 0 9mm; gap: 4mm;
    font-size: 7pt; color: #A8AEB5; border-top: .3mm solid #E3E7EC;
  }
  .sfoot .pageno { margin-left: auto; font-weight: 700; color: #565D63; }

  h1.title { font-size: 34pt; line-height: 1.02; margin: 0; letter-spacing: -.02em; font-weight: 800; }
  h2.stitle { font-size: 22pt; line-height: 1.05; margin: 0 0 4mm; font-weight: 800; letter-spacing: -.01em; }
  h2.stitle .thin { font-weight: 300; color: #6B7178; }
  h3.sub { font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; color: #8A9099; margin: 0 0 2mm; font-weight: 700; }
  p { margin: 0 0 3mm; }

  .cols { display: flex; gap: 8mm; height: 100%; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6mm; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }

  .ph { width: 100%; height: 100%; object-fit: cover; display: block; background: #EEF1F5; }
  .frame { overflow: hidden; border-radius: 1.5mm; background: #EEF1F5; }

  /* 성장 지표 막대 */
  .stat { display: flex; align-items: center; gap: 3mm; padding: 2.4mm 4mm; border-radius: 1mm; margin-bottom: 2mm; color: #fff; }
  .stat .v { font-size: 13pt; font-weight: 800; letter-spacing: -.01em; white-space: nowrap; }
  .stat .l { font-size: 8.5pt; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .stat .src { margin-left: auto; font-size: 6.5pt; opacity: .8; letter-spacing: .08em; text-transform: uppercase; }

  /* 팔레트 띠 */
  .palette { display: flex; width: 100%; }
  .palette .sw { flex: 1; padding: 3mm 2mm; color: #fff; text-align: center; }
  .palette .sw .n { font-size: 7pt; font-weight: 700; line-height: 1.2; }
  .palette .sw .c { font-size: 6pt; opacity: .82; margin-top: .6mm; }
  .palette .sw.dark { color: #14181D; }

  /* 키아이템 카드 */
  .kitem { display: flex; background: #F3F5F8; border-radius: 1.5mm; overflow: hidden; height: 100%; }
  .kitem .side {
    writing-mode: vertical-rl; transform: rotate(180deg);
    padding: 3mm 2mm; color: #fff; font-size: 7.5pt; font-weight: 800;
    letter-spacing: .1em; text-transform: uppercase; text-align: center; flex: 0 0 8mm;
  }
  .kitem .body { flex: 1; padding: 4mm; min-width: 0; display: flex; flex-direction: column; }
  .kitem .top { display: flex; align-items: baseline; gap: 2mm; margin-bottom: 2mm; }
  .kitem .pct { font-size: 17pt; font-weight: 800; letter-spacing: -.02em; }
  .kitem .yoy { font-size: 6pt; color: #8A9099; letter-spacing: .1em; }
  .kitem .grade { margin-left: auto; font-size: 6pt; font-weight: 800; letter-spacing: .08em;
                  text-transform: uppercase; padding: .8mm 2mm; border-radius: 4mm; }
  .kitem .pic { height: 28mm; margin-bottom: 2.5mm; }
  .kitem p { font-size: 7.6pt; line-height: 1.5; color: #40474F; margin: 0 0 2mm; }
  .kitem .spec { margin-top: auto; font-size: 6.8pt; color: #565D63; border-top: .3mm solid #DDE1E7; padding-top: 1.5mm; }

  .chip { display: inline-block; font-size: 7.5pt; font-weight: 700; letter-spacing: .06em;
          text-transform: uppercase; padding: 1.4mm 3.4mm; border-radius: 1mm; margin: 0 1.5mm 1.5mm 0; color: #fff; }

  .quote { border-left: 1mm solid currentColor; padding-left: 5mm; font-size: 11pt; font-weight: 600; line-height: 1.4; }

  .legend { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 6mm; }
  .legend .row { display: flex; gap: 3mm; align-items: flex-start; font-size: 8pt; }
  .legend .key { flex: 0 0 34mm; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
                 padding: 1mm 2.5mm; border-radius: 4mm; text-align: center; font-size: 7pt; }

  table.src { width: 100%; border-collapse: collapse; font-size: 7.4pt; }
  table.src td { padding: 1.6mm 2mm 1.6mm 0; border-bottom: .25mm solid #EEF1F5; vertical-align: top; }
  table.src td.n { width: 7mm; color: #A8AEB5; font-weight: 700; }
  table.src td.u { color: #3B45C8; word-break: break-all; }

  .yr { display: flex; gap: 5mm; padding: 3mm 0; border-top: .3mm solid #E3E7EC; font-size: 8.5pt; }
  .yr b { flex: 0 0 22mm; font-size: 10pt; }

  .note { background: #F3F5F8; border-left: 1mm solid #14181D; padding: 4mm 5mm; font-size: 8pt; line-height: 1.55; }

  @media screen {
    body { padding: 8mm 0; }
    .slide { box-shadow: 0 1mm 4mm rgba(0,0,0,.16); }
  }
`

/** 슬라이드 한 장 */
export function slide(opts: {
  eyebrow?: string
  tag?: string
  body: string
  foot?: string
  page?: number
  bare?: boolean
}): string {
  if (opts.bare) return `<section class="slide">${opts.body}</section>`
  return `<section class="slide">
    <div class="shead">
      <span class="brand">VRINGON</span>
      <span>${esc(opts.eyebrow ?? '')}</span>
      <span class="right">${opts.tag ? `<span class="tagpill">${esc(opts.tag)}</span>` : ''}</span>
    </div>
    <div class="sbody">${opts.body}</div>
    <div class="sfoot">
      <span>${esc(opts.foot ?? 'Generated by the VRINGON Design Agent. Every figure carries the source it came from.')}</span>
      ${opts.page ? `<span class="pageno">${opts.page}</span>` : ''}
    </div>
  </section>`
}

/** 문서를 만들어 숨은 iframe에서 인쇄한다. 팝업 차단에 걸리지 않는다. */
export function printDeck(title: string, inner: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${DECK_CSS}</style></head><body>${inner}</body></html>`

  const old = document.getElementById('vringon-print')
  if (old) old.remove()

  const frame = document.createElement('iframe')
  frame.id = 'vringon-print'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  if (!doc) return
  doc.open()
  doc.write(html)
  doc.close()

  // 이미지가 다 뜨기 전에 인쇄하면 빈 칸으로 나온다. 로드를 기다렸다 부른다.
  const imgs = Array.from(doc.images)
  const ready = Promise.all(imgs.map(img => img.complete
    ? Promise.resolve()
    : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res() })))

  Promise.race([ready, new Promise(res => setTimeout(res, 6000))]).then(() => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
  })
}

/** 인쇄 대신 파일로 받고 싶을 때. 브라우저 인쇄가 막힌 환경을 위한 대비책. */
export function downloadDeck(filename: string, title: string, inner: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${DECK_CSS}</style></head><body>${inner}</body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 2000)
}

/** 배경이 밝으면 글자를 어둡게. 팔레트 칩에 쓴다. */
export function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (0.299 * r + 0.587 * g + 0.114 * b) > 165
}
