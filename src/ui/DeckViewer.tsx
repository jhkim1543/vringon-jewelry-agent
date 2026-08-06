// ── 덱 뷰어 · 만들어 둔 PDF 슬라이드를 화면에서 넘겨 본다 ────────────
// 인쇄용 덱과 같은 HTML을 그대로 쓴다. 뷰어용 마크업을 따로 만들면
// 화면에서 본 것과 내려받은 PDF가 달라진다.
//
// 슬라이드는 297mm 고정폭이라 카드 안에 그대로 넣으면 넘친다.
// 컨테이너 폭에 맞춰 scale 로 줄이고, 높이는 비율대로 잡는다.
import { useEffect, useRef, useState } from 'react'
import { DECK_CSS, esc } from '../core/deck'
import { t } from '../core/i18n'

const MM = 96 / 25.4          // 1mm 를 CSS 픽셀로
const SLIDE_W = 297 * MM      // ≈ 1122.5
const SLIDE_H = 210 * MM      // ≈ 793.7

const VIEWER_CSS = `
  html, body { background: #FFFFFF; overflow: hidden; }
  .slide { display: none; margin: 0 !important; box-shadow: none; }
  .slide.on { display: block; }
`

export function DeckViewer({ html, title, onPrint, onSave, height }: {
  html: string
  title: string
  onPrint: () => void
  onSave: () => void
  height?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [scale, setScale] = useState(0.5)
  const [full, setFull] = useState(false)

  // 덱은 "/samples/..." 같은 절대 경로를 들고 있다. GitHub Pages 는 하위 경로에
  // 올라가므로 그대로 두면 iframe 안에서 전부 404 가 나고 깨진 이미지만 남는다.
  const BASE = import.meta.env.BASE_URL || '/'
  const fixed = BASE === '/' ? html
    : html.replace(/(src|href)="\/(samples|brand|assets)\//g, `$1="${BASE}$2/`)

  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<base href="${location.origin}${BASE}">
<style>${DECK_CSS}${VIEWER_CSS}</style></head><body>${fixed}</body></html>`

  // 슬라이드 수를 센다. srcdoc 은 부모와 같은 출처라 내용을 읽을 수 있다.
  const onLoad = () => {
    const d = frame.current?.contentDocument
    if (!d) return
    const n = d.querySelectorAll('.slide').length
    setTotal(n)
    setPage(p => Math.min(p, Math.max(0, n - 1)))
  }

  // 현재 장만 보이게 한다
  useEffect(() => {
    const d = frame.current?.contentDocument
    if (!d) return
    const slides = d.querySelectorAll('.slide')
    slides.forEach((s, i) => s.classList.toggle('on', i === page))
  }, [page, total, doc])

  // 카드 폭에 맞춰 축소율을 다시 계산한다
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => {
      const w = el.clientWidth
      if (w > 2) setScale(w / SLIDE_W)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [full])

  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false)
      if (e.key === 'ArrowRight') setPage(p => Math.min(total - 1, p + 1))
      if (e.key === 'ArrowLeft') setPage(p => Math.max(0, p - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full, total])

  // transform: scale 은 레이아웃 높이를 줄이지 않는다. 그대로 두면 슬라이드
  // 아래로 원본 높이만큼(약 790px) 흰 여백이 남는다. 높이를 직접 잡아 준다.
  const stage = (
    <div className="dv-stage" ref={box} style={{ height: Math.round(SLIDE_H * scale) }}>
      <div className="dv-scaler" style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})` }}>
        <iframe ref={frame} title={title} srcDoc={doc} onLoad={onLoad}
          style={{ width: SLIDE_W, height: SLIDE_H, border: 0 }} />
      </div>
    </div>
  )

  const nav = (
    <div className="dv-nav">
      <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} aria-label={t('Prev')}>‹</button>
      <span className="dv-count">{total ? page + 1 : '–'} / {total || '–'}</span>
      <button onClick={() => setPage(p => Math.min(total - 1, p + 1))} disabled={page >= total - 1} aria-label={t('Next')}>›</button>
    </div>
  )

  // 스테이지는 한 번에 하나만 그린다. 둘을 동시에 두면 iframe이 두 개 생겨
  // ref가 나중 것을 가리키고 카드 쪽 페이지 넘김이 멈춘다.
  if (full) {
    return (
      <div className="dv-modal" onClick={() => setFull(false)}>
        <div className="dv-modal-box" onClick={e => e.stopPropagation()}>
          <div className="dv-modal-head">
            <span>{title}</span>
            <div className="dv-modal-acts">
              <button className="btn btn-ghost btn-sm" onClick={onSave}>{t('Save as file')}</button>
              <button className="btn btn-primary btn-sm" onClick={onPrint}>{t('Download PDF')}</button>
              <button className="dv-x" onClick={() => setFull(false)} aria-label={t('Close')}>✕</button>
            </div>
          </div>
          {stage}
          {nav}
        </div>
      </div>
    )
  }

  return (
    <div className="dv">
      <div className="dv-frame">
        {stage}
        {/* 좌우 중앙 화살표 · 하단 내비가 화면 밖에 있을 때도 넘길 수 있어야 한다 */}
        <button className="dv-side prev" onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0} aria-label={t('Prev')}>‹</button>
        <button className="dv-side next" onClick={() => setPage(p => Math.min(total - 1, p + 1))}
          disabled={page >= total - 1} aria-label={t('Next')}>›</button>
        <button className="dv-full" onClick={() => setFull(true)} title={t('Open full size')}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 3.8H4.4v4.6M15 3.8h4.6v4.6M9 20.2H4.4v-4.6M15 20.2h4.6v-4.6" />
          </svg>
        </button>
      </div>
      {nav}
    </div>
  )
}
