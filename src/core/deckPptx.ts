// ── 덱 PPTX 내보내기 ─────────────────────────────────────────────────
// 화면·PDF 는 agentDeck 의 HTML 덱이 정본이고, 이 파일은 같은 데이터를
// PowerPoint 로 옮긴다. 픽셀 복제가 아니라 같은 템플릿 언어(아이보리 럭셔리 /
// 종이색 에디토리얼)의 PPT 판이다 — 받은 사람이 글자·사진을 자유로 고칠 수 있어야
// PPT 로 주는 의미가 있다.
// 글꼴: 한글은 Pretendard 로 지정한다. 없는 기기에서는 PowerPoint 가 맑은 고딕으로
// 대체한다 — 임베드는 pptxgenjs 가 지원하지 않는다.
// pptxgenjs 는 package.json 의 exports 때문에 브라우저 번들러가 Node 모듈(https 등)을
// 끌고 들어가려다 실패한다(VRINGON dev 서버가 실제로 이걸로 죽었다). 번들에 넣지 않고,
// 우리 서버가 내주는 파일을 누를 때 받아 온다 — 외부 CDN 이 아니라 같은 서버다.
import type { RunState } from './types'
import { CONFIDENCE_LABEL, ITEM_KO, regionsLabel, regionsOf } from './types'
import { shotUrl } from './agents'
import { apiUrl } from './api'
import { t } from './i18n'

// 16:9 인치
const W = 13.333
const H = 7.5

const LUX = { bg: 'F7F5F1', ink: '191713', sub: '6E685C', accent: '4652B8', line: 'E5E0D4', card: 'FFFFFF' }
const PAPER = { bg: 'F4F1EA', ink: '1C1B18', sub: '55524A', accent: '4A4A98', line: 'D8D3C6' }
const SANS = 'Pretendard'
const SERIF = 'Georgia'

/** 브라우저에서 쓸 PptxGenJS · 번들러가 따라가지 못하게 주소를 런타임에 만든다 */
interface PptxDeck {
  defineLayout(o: unknown): void
  layout: string
  title: string
  addSlide(): PptxSlide
  writeFile(o: { fileName: string }): Promise<unknown>
}
type PptxCtor = new () => PptxDeck
type PptxSlide = {
  background: unknown
  addText(v: unknown, o: unknown): void
  addShape(k: string, o: unknown): void
  addImage(o: unknown): void
}
let ctor: PptxCtor | null = null
async function loadPptx(): Promise<PptxCtor> {
  if (ctor) return ctor
  const url = apiUrl('/vendor/pptxgen.es.js')
  const mod = await import(/* @vite-ignore */ url) as { default: PptxCtor }
  ctor = mod.default
  return ctor
}


/** 사진을 dataURL 로 · 실패하면 null (칸은 "이미지 확인 필요"로 남긴다) */
async function imgData(remote?: string, shot?: string, page?: string): Promise<string | null> {
  const src = shot || shotUrl(remote, page)
  if (!src) return null
  try {
    const r = await fetch(src)
    if (!r.ok) return null
    const blob = await r.blob()
    if (!blob.type.startsWith('image/')) return null
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader()
      fr.onload = () => res(String(fr.result))
      fr.onerror = rej
      fr.readAsDataURL(blob)
    })
  } catch { return null }
}

async function newDeck(title: string): Promise<PptxDeck> {
  const Ctor = await loadPptx()
  const p = new Ctor()
  p.defineLayout({ name: 'W169', width: W, height: H })
  p.layout = 'W169'
  p.title = title
  return p
}

interface LuxSlideItem { name: string; sub: string; badge: string; data: string | null }

/** 럭셔리 격자 한 장 · 히어로 1 + 5칸 (이후 장은 6칸) */
function luxSlide(p: PptxDeck, o: {
  eyebrow: string; brand: string; sub: string; items: LuxSlideItem[]
  foot: string; page: number; hero: boolean
}) {
  const s = p.addSlide()
  s.background = { color: LUX.bg }
  s.addText(o.eyebrow, { x: 0.6, y: 0.35, w: 6, h: 0.3, fontFace: SANS, fontSize: 10, color: LUX.accent, charSpacing: 4, bold: true })
  s.addText(o.brand, { x: 0.6, y: 0.7, w: 9, h: 0.85, fontFace: SERIF, fontSize: 34, color: LUX.ink })
  s.addText(o.sub, { x: 0.6, y: 1.55, w: 11.5, h: 0.3, fontFace: SANS, fontSize: 10, color: LUX.sub })

  const top = 2.05
  const gridH = 4.55
  const cell = (x: number, y: number, w: number, h: number, it: LuxSlideItem, no: number) => {
    s.addShape('rect', { x, y, w, h, fill: { color: LUX.card }, line: { color: LUX.line, width: 0.75 } })
    if (it.data) s.addImage({ data: it.data, x: x + 0.08, y: y + 0.08, w: w - 0.16, h: h - 0.75, sizing: { type: 'contain', w: w - 0.16, h: h - 0.75 } })
    else s.addText(t('image needs checking'), { x, y: y + (h - 0.75) / 2 - 0.15, w, h: 0.3, align: 'center', fontFace: SANS, fontSize: 9, color: 'A29B8B' })
    s.addText([
      { text: `${String(no).padStart(2, '0')}  `, options: { color: LUX.accent, bold: true } },
      { text: it.badge, options: { color: LUX.accent, fontSize: 7, charSpacing: 2 } },
    ], { x: x + 0.1, y: y + h - 0.66, w: w - 0.2, h: 0.22, fontFace: SANS, fontSize: 9 })
    s.addText(it.name.slice(0, 48), { x: x + 0.1, y: y + h - 0.46, w: w - 0.2, h: 0.26, fontFace: SERIF, fontSize: 10, color: LUX.ink })
    s.addText(it.sub.slice(0, 40), { x: x + 0.1, y: y + h - 0.22, w: w - 0.2, h: 0.2, fontFace: SANS, fontSize: 8, color: LUX.sub })
  }

  if (o.hero) {
    const heroW = 4.9
    if (o.items[0]) cell(0.6, top, heroW, gridH, o.items[0], 1)
    const gx = 0.6 + heroW + 0.3
    const gw = (W - gx - 0.6 - 0.25) / 2
    const gh = (gridH - 0.25) / 2 + 0.6
    o.items.slice(1, 5).forEach((it, i) => {
      cell(gx + (i % 2) * (gw + 0.25), top + Math.floor(i / 2) * (gridH / 2 + 0.05), gw, gridH / 2 - 0.1, it, i + 2)
    })
    void gh
  } else {
    const gw = (W - 1.2 - 0.5) / 3
    o.items.slice(0, 6).forEach((it, i) => {
      cell(0.6 + (i % 3) * (gw + 0.25), top + Math.floor(i / 3) * (gridH / 2 + 0.05), gw, gridH / 2 - 0.1, it, o.page * 100 + i)
    })
  }

  s.addShape('line', { x: 0.6, y: H - 0.62, w: W - 1.2, h: 0, line: { color: LUX.line, width: 1 } })
  s.addText(o.foot, { x: 0.6, y: H - 0.52, w: 10, h: 0.3, fontFace: SANS, fontSize: 8, color: LUX.sub, charSpacing: 2 })
  s.addText(String(o.page).padStart(2, '0'), { x: W - 1.3, y: H - 0.52, w: 0.7, h: 0.3, align: 'right', fontFace: SANS, fontSize: 9, color: LUX.accent, bold: true })
}

/** 종이색 제목 슬라이드 공통 머리 */
function paperHead(s: PptxSlide, eyebrow: string) {
  s.background = { color: PAPER.bg }
  s.addText(eyebrow, { x: 0.7, y: 0.4, w: 11, h: 0.3, fontFace: SANS, fontSize: 9, color: PAPER.sub, charSpacing: 4 })
}

/** RunState 하나에서 모든 덱을 한 파일로 · 화면과 같은 순서 */
export async function downloadAllPptx(st: RunState) {
  const p = await newDeck(`VRINGON · ${new Date().toISOString().slice(0, 10)}`)
  const item = ITEM_KO[st.params.itemType] ?? st.params.itemType

  // ── 경쟁사·편집샵 · 럭셔리 격자 ─────────────────────────────────────
  const luxGroups: { eyebrow: string; brand: string; sub: string; foot: string; items: { name: string; sub: string; badge: string; imageUrl?: string; shot?: string; page?: string }[] }[] = []
  for (const c of st.crawl ?? []) {
    luxGroups.push({
      eyebrow: 'COMPETITOR PRODUCT REPORT', brand: c.brand,
      sub: `${t('Representative and best sellers')} · ${item} · ${regionsLabel(st.params)}`,
      foot: `SOURCE  ${c.brand}`,
      items: c.items.map(x => ({
        name: x.name, sub: x.price ? `${x.price.toLocaleString()} ${x.currency}` : t('price unconfirmed'),
        badge: (x.group ?? '').toUpperCase(), imageUrl: x.imageUrl, shot: x.shot, page: x.productUrl,
      })),
    })
  }
  for (const sh of st.shops ?? []) {
    if (!sh.items.length) continue
    luxGroups.push({
      eyebrow: 'SELECT SHOP REPORT', brand: sh.name, sub: sh.note.slice(0, 90), foot: `SOURCE  ${sh.url}`,
      items: sh.items.map(x => ({
        name: `${x.brand} · ${x.name}`, sub: x.price ? `${x.price.toLocaleString()} ${x.currency}` : t('price unconfirmed'),
        badge: x.rankBasis === 'official_best' ? 'BEST' : 'EXPOSURE',
        imageUrl: x.imageUrl, shot: x.shot, page: x.productUrl,
      })),
    })
  }
  for (const l of st.runway?.looks ?? []) {
    void l // 런웨이는 지역 묶음이 큰 의미라 아래에서 지역별로 만든다
  }
  if (st.runway) {
    const byRegion = new Map<string, NonNullable<RunState['runway']>['looks']>()
    for (const l of st.runway.looks) {
      const k = l.region ?? regionsOf(st.params)[0] ?? ''
      byRegion.set(k, [...(byRegion.get(k) ?? []), l])
    }
    for (const [region, looks] of byRegion) {
      luxGroups.push({
        eyebrow: 'RUNWAY REPORT', brand: region || 'RUNWAY',
        sub: `${st.runway.season_now} / ${st.runway.season_next}`,
        foot: 'BASIS  RUNWAY · COLLECTION COVERAGE',
        items: looks.map(l => ({
          name: `${l.brand} · ${l.collection}`, sub: l.season, badge: 'LOOK',
          imageUrl: l.image_url, shot: l.shot, page: l.source_url,
        })),
      })
    }
  }

  let pageNo = 0
  for (const g of luxGroups) {
    // 사진을 먼저 받아 둔다 (병렬 6개씩)
    const withData: LuxSlideItem[] = []
    for (let i = 0; i < g.items.length; i += 6) {
      const chunk = g.items.slice(i, i + 6)
      const datas = await Promise.all(chunk.map(x => imgData(x.imageUrl, x.shot, x.page)))
      chunk.forEach((x, k) => withData.push({ name: x.name, sub: x.sub, badge: x.badge, data: datas[k] }))
    }
    for (let i = 0; i < withData.length; i += 6) {
      pageNo++
      luxSlide(p, {
        eyebrow: g.eyebrow, brand: g.brand, sub: g.sub, foot: g.foot,
        items: withData.slice(i, i + 6), page: pageNo, hero: i === 0,
      })
    }
  }

  // ── 트렌드 리포트 · 종이색 ─────────────────────────────────────────
  const r = st.trendReport
  const eyebrowText = `VRINGON  |  ${regionsOf(st.params).join(' · ').toUpperCase()} · ${item}`
  if (r) {
    const cover = p.addSlide()
    paperHead(cover, eyebrowText)
    cover.addText(r.headline.slice(0, 90), { x: 0.7, y: 1.0, w: 7.2, h: 1.7, fontFace: SANS, fontSize: 24, bold: true, color: PAPER.ink, lineSpacingMultiple: 1.1 })
    cover.addText(r.summary, { x: 0.7, y: 2.8, w: 7.0, h: 2.4, fontFace: SANS, fontSize: 11, color: PAPER.sub, lineSpacingMultiple: 1.35 })
    r.elements.slice(0, 3).forEach((el, i) => {
      const y = 5.2 + i * 0.68
      cover.addShape('line', { x: 0.7, y, w: 7.0, h: 0, line: { color: PAPER.line, width: 0.75 } })
      cover.addText(String(i + 1).padStart(2, '0'), { x: 0.7, y: y + 0.06, w: 0.7, h: 0.5, fontFace: SERIF, fontSize: 18, color: PAPER.accent })
      cover.addText(el.axis, { x: 1.5, y: y + 0.08, w: 2.4, h: 0.3, fontFace: SANS, fontSize: 12, bold: true, color: PAPER.ink })
      cover.addText(el.trends.slice(0, 2).map(x => x.label).join(' · ').slice(0, 60), { x: 3.9, y: y + 0.1, w: 5.6, h: 0.3, fontFace: SANS, fontSize: 9, color: PAPER.sub })
    })
    // 오른쪽 사진 2×2 · 실제 수집 사진
    const pool = [
      ...(st.crawl ?? []).flatMap(c => c.items), ...(st.shops ?? []).flatMap(s2 => s2.items),
    ].filter(x => x.imageUrl || x.shot).slice(0, 4)
    const datas = await Promise.all(pool.map(x => imgData(x.imageUrl, x.shot, x.productUrl)))
    datas.forEach((d, i) => {
      const x = 8.2 + (i % 2) * 2.45
      const y = 1.0 + Math.floor(i / 2) * 2.55
      cover.addShape('rect', { x, y, w: 2.3, h: 2.4, fill: { color: 'FFFFFF' }, line: { color: PAPER.line, width: 0.75 } })
      if (d) cover.addImage({ data: d, x: x + 0.08, y: y + 0.08, w: 2.14, h: 2.24, sizing: { type: 'contain', w: 2.14, h: 2.24 } })
    })

    for (const el of r.elements) {
      const s = p.addSlide()
      paperHead(s, eyebrowText)
      s.addText('TREND AXIS', { x: 0.7, y: 0.85, w: 4, h: 0.28, fontFace: SANS, fontSize: 9, color: PAPER.sub, charSpacing: 4 })
      s.addText(el.axis, { x: 0.7, y: 1.15, w: 8, h: 0.6, fontFace: SANS, fontSize: 22, bold: true, color: PAPER.ink })
      el.trends.slice(0, 5).forEach((tr, i) => {
        const y = 2.0 + i * 1.04
        s.addShape('line', { x: 0.7, y, w: W - 1.4, h: 0, line: { color: PAPER.line, width: 0.75 } })
        s.addText(String(i + 1).padStart(2, '0'), { x: 0.7, y: y + 0.08, w: 0.7, h: 0.5, fontFace: SERIF, fontSize: 15, color: PAPER.accent })
        s.addText(tr.label, { x: 1.5, y: y + 0.08, w: 10.5, h: 0.3, fontFace: SANS, fontSize: 12.5, bold: true, color: PAPER.ink })
        s.addText(tr.evidence.slice(0, 220), { x: 1.5, y: y + 0.38, w: 11.0, h: 0.55, fontFace: SANS, fontSize: 9.5, color: PAPER.sub, lineSpacingMultiple: 1.2 })
      })
    }
  }

  // ── 다음 시즌 예측 ─────────────────────────────────────────────────
  const fc = st.forecast
  if (fc) {
    for (let i = 0; i < fc.predictions.length; i += 5) {
      const s = p.addSlide()
      paperHead(s, eyebrowText)
      s.addText(`NEXT SEASON OUTLOOK · ${t('Forecast, not fact')}`, { x: 0.7, y: 0.85, w: 9, h: 0.28, fontFace: SANS, fontSize: 9, color: PAPER.sub, charSpacing: 3 })
      s.addText(fc.horizon, { x: 0.7, y: 1.15, w: 8, h: 0.6, fontFace: SANS, fontSize: 22, bold: true, color: PAPER.ink })
      if (i === 0) s.addText(fc.thesis, { x: 0.7, y: 1.8, w: 12, h: 0.75, fontFace: SANS, fontSize: 10, color: PAPER.sub, lineSpacingMultiple: 1.25 })
      fc.predictions.slice(i, i + 5).forEach((pr, k) => {
        const y = (i === 0 ? 2.7 : 2.0) + k * 0.92
        s.addShape('line', { x: 0.7, y, w: W - 1.4, h: 0, line: { color: PAPER.line, width: 0.75 } })
        s.addText([
          { text: `${pr.axis} · ${pr.call}  `, options: { bold: true, color: PAPER.ink } },
          { text: t(CONFIDENCE_LABEL[pr.confidence]), options: { fontSize: 8, color: PAPER.accent } },
        ], { x: 0.7, y: y + 0.06, w: 12, h: 0.3, fontFace: SANS, fontSize: 11.5 })
        s.addText(`${pr.why}  ·  ${t('Watch')}: ${pr.watch}`.slice(0, 240), { x: 0.7, y: y + 0.36, w: 12, h: 0.5, fontFace: SANS, fontSize: 9, color: PAPER.sub })
      })
    }
  }

  await p.writeFile({ fileName: `vringon-report-${new Date().toISOString().slice(0, 10)}.pptx` })
}
