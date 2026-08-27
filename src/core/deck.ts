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
  body { font: 10pt/1.55 Pretendard, "Pretendard Variable", -apple-system, "Segoe UI", "Malgun Gothic", sans-serif; color: #14181D; }
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
  /* 사진이 있으면 크게 쓰고, 없으면 칸 자체가 사라져 글이 그 자리를 채운다 */
  .kitem .pic { height: 34mm; margin-bottom: 2.5mm; }
  .kitem p { font-size: 7.6pt; line-height: 1.5; color: #40474F; margin: 0 0 2mm; }
  .kitem .spec { font-size: 6.8pt; color: #565D63; border-top: .3mm solid #DDE1E7; padding-top: 1.5mm; }
  /* 근거 한 줄 · 어디서 봤는지, 어떻게 셌는지. 카드 아래를 채우는 내용이기도 하다 */
  .kitem .kref { margin-top: 1.5mm; font-size: 6.2pt; line-height: 1.45; color: #8A9099; }
  .kitem .kref:last-child { margin-top: auto; padding-top: 1.5mm; }

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

  /* ══ 트렌드 리포트 템플릿 · 따뜻한 종이색 에디토리얼 ═══════════════
     왼쪽 번호 포인트 + 오른쪽 사진 격자. 사진은 자르지 않는다(contain) —
     세로로 긴 제품 사진이 cover 로 잘려 나가던 것이 실제 불만이었다. */
  .tpl-trend { background: #F4F1EA; color: #1C1B18; }
  .tpl-trend .tt-wrap { position: absolute; inset: 0; padding: 14mm 16mm 12mm; display: flex; flex-direction: column; }
  .tpl-trend .tt-eyebrow { font-size: 8pt; letter-spacing: .3em; text-transform: uppercase; color: #6B675C;
    display: flex; gap: 4mm; align-items: center; }
  .tpl-trend .tt-eyebrow .b { font-weight: 800; color: #1C1B18; }
  .tpl-trend .tt-eyebrow .sep { width: .3mm; height: 3.6mm; background: #C9C4B6; }
  .tpl-trend .tt-cols { display: flex; gap: 12mm; flex: 1; min-height: 0; margin-top: 8mm; }
  .tpl-trend .tt-left { flex: 0 0 46%; min-width: 0; display: flex; flex-direction: column; }
  .tpl-trend .tt-title { font-size: 30pt; line-height: 1.08; font-weight: 800; letter-spacing: -.02em; margin: 0; }
  .tpl-trend .tt-sub { font-size: 9.5pt; color: #55524A; margin: 4mm 0 0; line-height: 1.6; }
  .tpl-trend .tt-points { margin-top: 7mm; }
  .tpl-trend .pt { display: flex; gap: 5mm; padding: 4mm 0; border-top: .3mm solid #D8D3C6; align-items: baseline; }
  .tpl-trend .pt .no { font-family: Didot, "Bodoni MT", Georgia, Pretendard, sans-serif; font-size: 19pt; color: #4A4A98; flex: 0 0 12mm; line-height: 1; }
  .tpl-trend .pt .pt-t { font-size: 10.5pt; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .tpl-trend .pt .pt-d { font-size: 8pt; color: #55524A; margin-top: 1mm; line-height: 1.5; }
  .tpl-trend .tt-right { flex: 1; min-width: 0; display: grid; grid-template-columns: 1fr 1fr;
    grid-auto-rows: 1fr; gap: 4mm; align-content: stretch; }
  .tpl-trend .tt-cell { background: #FFFFFF; border: .3mm solid #E2DED2; border-radius: 1mm;
    display: flex; flex-direction: column; overflow: hidden; }
  .tpl-trend .tt-cell .im { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 2mm; }
  .tpl-trend .tt-cell img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .tpl-trend .tt-cap { font-size: 7pt; color: #55524A; text-align: center; padding: 0 2mm 2mm; letter-spacing: .02em; }
  .tpl-trend .tt-foot { border-top: .35mm solid #C9C4B6; margin-top: 6mm; padding-top: 3mm;
    display: flex; gap: 5mm; font-size: 7.5pt; color: #6B675C; align-items: baseline; }
  .tpl-trend .tt-foot .k { font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #1C1B18; }
  .tpl-trend .tt-axis { font-size: 8pt; letter-spacing: .26em; text-transform: uppercase; color: #6B675C; margin-bottom: 4mm; }
  .tpl-trend .tr-row { display: flex; gap: 6mm; padding: 4mm 0; border-top: .3mm solid #D8D3C6; }
  .tpl-trend .tr-row .no { font-family: Didot, "Bodoni MT", Georgia, Pretendard, sans-serif; font-size: 16pt; color: #4A4A98; flex: 0 0 10mm; line-height: 1.1; }
  .tpl-trend .tr-row .im2 { flex: 0 0 34mm; height: 26mm; background: #fff; border: .3mm solid #E2DED2;
    border-radius: 1mm; display: flex; align-items: center; justify-content: center; padding: 1.5mm; }
  .tpl-trend .tr-row .im2 img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .tpl-trend .tr-row .bd { flex: 1; min-width: 0; }
  .tpl-trend .tr-row .lb { font-size: 10.5pt; font-weight: 800; }
  .tpl-trend .tr-row .ev { font-size: 8pt; color: #55524A; line-height: 1.55; margin-top: 1mm; }
  .tpl-trend .tr-row .mn { font-size: 6.8pt; color: #8B867A; margin-top: 1mm; letter-spacing: .06em; }

  /* ══ 경쟁사·편집샵 리포트 템플릿 · 아이보리 럭셔리 ═════════════════ */
  .tpl-lux { background: #F7F5F1; color: #191713; }
  .tpl-lux .lx-wrap { position: absolute; inset: 0; padding: 12mm 14mm 10mm; display: flex; flex-direction: column; }
  .tpl-lux .lx-top { display: flex; align-items: baseline; gap: 5mm; }
  .tpl-lux .lx-eyebrow { font-size: 7.5pt; letter-spacing: .3em; text-transform: uppercase; color: #4652B8; font-weight: 700;
    border-bottom: .5mm solid #4652B8; padding-bottom: 1.2mm; }
  .tpl-lux .lx-meta { margin-left: auto; font-size: 7.5pt; letter-spacing: .12em; color: #6E685C; text-transform: uppercase;
    display: flex; gap: 4mm; }
  .tpl-lux .lx-meta .sep { color: #C9C2B2; }
  .tpl-lux .lx-brand { font-family: Didot, "Bodoni MT", Georgia, Pretendard, sans-serif; font-size: 34pt; letter-spacing: .04em;
    margin: 6mm 0 0; line-height: 1; font-weight: 500; }
  .tpl-lux .lx-sub { font-size: 8.5pt; color: #6E685C; margin-top: 2.5mm; letter-spacing: .04em; }
  .tpl-lux .lx-cols { display: flex; gap: 8mm; flex: 1; min-height: 0; margin-top: 6mm; }
  .tpl-lux .lx-hero { flex: 0 0 40%; background: #FFFFFF; border: .3mm solid #E5E0D4; display: flex; flex-direction: column; }
  .tpl-lux .lx-hero .im { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 5mm; }
  .tpl-lux .lx-hero img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .tpl-lux .lx-hero .cap { padding: 0 5mm 4mm; }
  .tpl-lux .lx-grid { flex: 1; min-width: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; grid-auto-rows: 1fr; }
  .tpl-lux .lx-card { background: #FFFFFF; border: .3mm solid #E5E0D4; display: flex; flex-direction: column; min-height: 0; }
  .tpl-lux .lx-card .im { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 2.5mm; }
  .tpl-lux .lx-card img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .tpl-lux .lx-card .im.miss { background: #EFECE4; color: #A29B8B; font-size: 7.5pt; letter-spacing: .08em; flex-direction: column; gap: 1.5mm; }
  .tpl-lux .lx-card .cap { padding: 0 3mm 2.5mm; }
  .tpl-lux .caphead { display: flex; align-items: center; gap: 2.5mm; }
  .tpl-lux .caphead .no { font-size: 8pt; color: #4652B8; font-weight: 700; letter-spacing: .08em; }
  .tpl-lux .badge { margin-left: auto; font-size: 5.8pt; letter-spacing: .14em; text-transform: uppercase;
    border: .3mm solid #4652B8; color: #4652B8; padding: .7mm 2.2mm; border-radius: .8mm; font-weight: 700; white-space: nowrap; }
  .tpl-lux .badge.fill { background: #4652B8; color: #FFFFFF; }
  .tpl-lux .badge.mute { border-color: #B9B2A2; color: #8E887A; }
  .tpl-lux .nm { font-family: Didot, "Bodoni MT", Georgia, Pretendard, sans-serif; font-size: 10pt; margin-top: 1mm; line-height: 1.25; }
  .tpl-lux .lx-hero .nm { font-size: 13pt; }
  .tpl-lux .pr { font-size: 7.5pt; color: #6E685C; margin-top: .8mm; letter-spacing: .03em; }
  .tpl-lux .lx-foot { border-top: .35mm solid #D9D3C4; margin-top: 5mm; padding-top: 2.5mm;
    display: flex; gap: 6mm; font-size: 7pt; color: #8E887A; letter-spacing: .1em; text-transform: uppercase; }
  .tpl-lux .lx-foot .k { color: #191713; font-weight: 700; }
  .tpl-lux .lx-foot .pg { margin-left: auto; color: #4652B8; font-weight: 700; }

  /* ── 테크팩 · 왼쪽 사진, 오른쪽 사양·원가 ─────────────────────────── */
    border-top: .2mm solid #E3DFD4; padding-top: 2mm; }
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

/** 못 뜬 사진과 그 때문에 비어 버린 칸을 접는다.
 *  깨진 아이콘도 보기 싫지만, 더 나쁜 건 사진이 있어야 할 자리가 통째로 흰 여백으로 남는 것이다.
 *  링크가 죽는 일은 흔하므로(핫링크 차단·소멸) 인쇄 직전에 한 번 훑어 정리한다. */
function tidyDeck(doc: Document) {
  for (const im of Array.from(doc.images)) {
    // 다 받고서 실패한 것만 지운다. `!complete` 까지 실패로 치면 아직 받는 중인 사진이
    // 전부 날아간다 — 로딩 대기가 시간 초과로 끝났을 때 리포트의 사진이 통째로 사라졌다.
    if (im.complete && im.naturalWidth === 0) (im.closest('.frame') ?? im).remove()
  }
  // 안이 빈 칸은 자리를 차지하지 않게 접는다. 여러 겹으로 감싼 경우가 있어 몇 번 돈다.
  for (let pass = 0; pass < 4; pass++) {
    let removed = 0
    for (const el of Array.from(doc.querySelectorAll('.sbody div, .sbody span'))) {
      if (el.children.length === 0 && !el.textContent?.trim() && !el.querySelector('img')) {
        el.remove(); removed++
      }
    }
    if (!removed) break
  }
}

const TIDY_SCRIPT = `<script>
addEventListener('load', function () {
  var run = function () {
    Array.prototype.forEach.call(document.images, function (im) {
      if (im.complete && im.naturalWidth === 0) { var f = im.closest('.frame') || im; f.remove() }
    })
    for (var p = 0; p < 4; p++) {
      var gone = 0
      Array.prototype.forEach.call(document.querySelectorAll('.sbody div, .sbody span'), function (el) {
        if (!el.children.length && !(el.textContent || '').trim() && !el.querySelector('img')) { el.remove(); gone++ }
      })
      if (!gone) break
    }
  }
  setTimeout(run, 1200)
})
<\/script>`

/** 문서를 만들어 숨은 iframe에서 인쇄한다. 팝업 차단에 걸리지 않는다. */
export function printDeck(title: string, inner: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
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
    tidyDeck(doc)                       // 못 뜬 사진과 빈 칸을 걷어낸 뒤에 인쇄한다
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
  })
}

/** 인쇄 대신 파일로 받고 싶을 때. 브라우저 인쇄가 막힌 환경을 위한 대비책. */
export function downloadDeck(filename: string, title: string, inner: string) {
  // 내려받은 파일은 나중에 열린다. 그때 링크가 죽어 있을 수 있으므로 정리 스크립트를 함께 넣는다.
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>${DECK_CSS}</style></head><body>${inner}${TIDY_SCRIPT}</body></html>`
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
