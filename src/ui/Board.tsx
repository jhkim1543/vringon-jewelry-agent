// ── 품평 보드 · Miro 식 협업 캔버스 ──────────────────────────────────
// 분석 탭이 "근거를 읽는 곳"이라면 보드는 "함께 굴리는 곳"이다.
//  · 결과 카드는 16:9 슬라이드(레퍼런스 → 방향 → 생성 이미지 스포트라이트)
//  · 링크를 가진 사람은 누구나 들어와 카드를 옮기고 메모·텍스트·이미지·핀(댓글)을 붙인다
//  · 서로의 커서가 이름표를 달고 실시간으로 보인다 (SSE · board-api)
//  · 발표 모드는 캔버스 위에서부터 순서대로 카드를 한 장씩 확대한다
// 서버가 없으면(정적 배포) 이 브라우저 안에서만 동작하고, 그렇게 말해 준다.
import { t, tf } from '../core/i18n'
import { apiUrl } from '../core/api'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, ViewportPortal, useReactFlow, applyNodeChanges,
} from '@xyflow/react'
import type { Node, NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { RunState } from '../core/types'
import { MODE_LABEL } from '../core/types'
import type { BoardNode, SlidePayload } from '../core/boardModel'
import { buildBoardModel } from '../core/boardModel'
import { shotUrl } from '../core/agents'
import { pushShareTarget, shareLink } from '../core/share'
import type { BoardDoc, BoardOp, CursorMsg, LiveBoard, UserNode } from '../core/boardLive'
import { joinBoard, myColor, myName, setMyName } from '../core/boardLive'

const CARD_W = 720
const CARD_H = 405           // 16:9
const GAP = 48

// ══ 슬라이드 렌더러 · 카드와 발표 화면이 같은 것을 그린다 ═════════════
function Img({ remote, page, shot, className }: { remote?: string; page?: string; shot?: string; className?: string }) {
  const src = shot || (remote?.startsWith('/') || remote?.startsWith('data:') ? remote : shotUrl(remote, page))
  if (!src) return <div className={`sl-ph ${className ?? ''}`}>{t('No photo')}</div>
  return <img className={className} src={src} alt=""
    onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
}

/** 발표용 레퍼런스 이미지 · 크롤 썸네일은 발표 크기로 키우면 뭉개져서,
 *  같은 제품의 AI 재현 스튜디오 컷을 서버에 청해 바꿔 끼운다(캐시라 재과금 없음).
 *  서버가 없거나(정적 배포) 실패하면 원본 그대로 두고, 배지는 재현이 실제로 떴을 때만 붙는다. */
function PresentRefImg({ remote, shot }: { remote?: string; shot?: string }) {
  const [ai, setAi] = useState<string | null>(null)
  const askSrc = shot || remote
  useEffect(() => {
    if (!askSrc) return
    let dead = false
    fetch(apiUrl('/api/image/refshot'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ src: askSrc }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!dead && j?.url) setAi(j.url) })
      .catch(() => undefined)
    return () => { dead = true }
  }, [askSrc])
  return (
    <span className="pr-wrap">
      {ai ? <img src={ai} alt="" /> : <Img remote={remote} shot={shot} />}
      {ai && <i className="pr-ai">{t('AI render')}</i>}
    </span>
  )
}

/** 디자인 방향 다섯 줄 · 축마다 짧은 아이콘과 첫 구절만 */
// Record<string,string> 주석을 붙이면 i18n 감사가 SVG 경로를 문구로 오인한다 · as const 로 둔다
const AXIS_GLYPH = {
  preserve: 'M8 2l5 6-5 6-5-6z',                            // 다이아
  transform: 'M3 8a5 5 0 1 1 1.5 3.5M3 8V4.5M3 8h3.5',      // 회전
  replace: 'M3 5h8m0 0-2.5-2.5M11 5 8.5 7.5M13 11H5m0 0 2.5-2.5M5 11l2.5 2.5', // 교환
  combine: 'M8 3v10M3 8h10',                                 // 더하기
  complement: 'M8 2a6 6 0 0 0 0 12z',                        // 반달
  avoid: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM4 12 12 4',    // 금지
} as const
/** 첫 문장을 칸 폭(두 줄)에 맞게 요약한다 · 말줄임표는 붙이지 않는다 —
 *  "…"는 기계 티가 나고 읽다 만 느낌을 준다. 낱말·구두점 경계에서 끊는다. */
function firstClause(s?: string, max = 34): string {
  if (!s) return ''
  const cut = s.split(/(?<=[.다요!?])\s/)[0] ?? s
  if (cut.length <= max) return cut
  const head = cut.slice(0, max)
  const brk = Math.max(head.lastIndexOf(' '), head.lastIndexOf('·'), head.lastIndexOf(','))
  return head.slice(0, Math.max(16, brk)).replace(/[,·\s]+$/, '')
}

export function SlideView({ slide, present = false }: { slide: SlidePayload; present?: boolean }) {
  const [showPrompt, setShowPrompt] = useState(false)
  if (slide.type === 'cover') {
    return (
      <div className="sl sl-cover">
        {slide.imageUrl && <Img remote={slide.imageUrl} className="sl-cover-bg" />}
        <div className="sl-cover-txt">
          <h1>{slide.title}</h1>
          <p className="sl-sub">{slide.subtitle}</p>
          <ul>{slide.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      </div>
    )
  }
  if (slide.type === 'refs') {
    return (
      <div className="sl sl-refs">
        <header>{slide.heading}</header>
        <div className="sl-refrow">
          {slide.cells.map(c => (
            <div className="sl-refcell" key={c.slot}>
              <span className="n">#{c.slot}</span>
              {present ? <PresentRefImg remote={c.imageUrl} shot={c.shot} /> : <Img remote={c.imageUrl} shot={c.shot} />}
              <b>{c.title}</b>
              <span className="s">{c.subtitle}</span>
              <span className="p">{c.price ? `${c.price.toLocaleString()} ${c.currency ?? ''}` : t('price unconfirmed')}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (slide.type === 'design') {
    // 이미지 스포트라이트 카드 · 좌 레퍼런스, 중간 방향 다섯 줄, 우측을 생성 이미지가 채운다
    const { pair, ref, target } = slide
    const out = pair.versions[pair.versions.length - 1]
    const d = pair.direction
    const rows: { k: string; label: string }[] = d ? [
      { k: 'preserve', label: firstClause(d.preserve) },
      { k: 'transform', label: firstClause(d.transform) },
      { k: 'replace', label: firstClause(d.replace) },
      { k: 'combine', label: firstClause(d.combine) },
      ...(d.complement ? [{ k: 'complement', label: firstClause(d.complement) }] : []),
      { k: 'avoid', label: firstClause(d.avoid) },
    ].filter(r => r.label) : []
    return (
      <div className="sl sl-spot">
        <header className="sp-head">
          <span className="sp-target">{target}</span>
          <b>{pair.id} · {pair.title}</b>
          {pair.score != null && <span className="sp-score">{pair.score}</span>}
        </header>
        <div className="sp-cols">
          <aside className="sp-ref">
            <span className="sp-lbl">REFERENCE</span>
            <span className="sp-refname">{pair.setName ?? (ref ? `${t('Ref')} #${ref.slot}` : '')}</span>
            {ref && <div className="sp-refim"><Img remote={ref.imageUrl} shot={ref.shot} /></div>}
            {ref && <span className="sp-refsub">{ref.title}</span>}
          </aside>
          <div className="sp-dir">
            <span className="sp-lbl">DESIGN DIRECTION</span>
            {rows.map(r => (
              <div className="sp-row" key={r.k}>
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                  <path d={AXIS_GLYPH[r.k as keyof typeof AXIS_GLYPH]} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
                <span>{r.label}</span>
              </div>
            ))}
            <button className="sp-full" onClick={e => { e.stopPropagation(); setShowPrompt(v => !v) }}>
              {showPrompt ? t('Hide prompt') : t('Full prompt')} ↗
            </button>
          </div>
          <figure className="sp-out">
            {out ? <img src={out.url} alt="" /> : <div className="sl-ph">{pair.error ? t('generation failed') : t('pending')}</div>}
            {pair.versions.length > 1 && <span className="cap">v{pair.versions.length}</span>}
          </figure>
        </div>
        {showPrompt && (
          <div className="sp-prompt" onClick={e => e.stopPropagation()}>
            <button className="sp-x" onClick={() => setShowPrompt(false)} aria-label={t('Close')}>✕</button>
            <pre>{pair.prompt}</pre>
          </div>
        )}
      </div>
    )
  }
  // set 카드
  return (
    <div className="sl sl-set">
      <header><b>{slide.name}</b><span>{slide.kind}</span><em>{slide.concept}</em></header>
      <div className="sl-3col">
        <div className="sl-setleft">
          {slide.conceptImg && <img src={slide.conceptImg} alt="" />}
          <div className="sl-palette">{slide.palette.slice(0, 6).map((c, i) => <span key={i}>{c}</span>)}</div>
          <div className="sl-meta">{slide.metal} · {slide.surface} · {slide.stones}</div>
          <div className="sl-meta">{t('Motif')}: {slide.motif}</div>
        </div>
        <div className="sl-setitems">
          {slide.items.map(it => (
            <div className="sl-item" key={it.item}>
              {it.imageUrl ? <img src={it.imageUrl} alt="" /> : <div className="sl-ph" />}
              <b>{it.item}</b>
              <span>{it.feature}</span>
            </div>
          ))}
        </div>
      </div>
      <footer>
        <span className="sl-dna">{slide.dna.slice(0, 3).join(' · ')}</span>
        <span className="sl-story">{slide.story.slice(0, 160)}</span>
      </footer>
    </div>
  )
}

// ══ ReactFlow 노드들 ═════════════════════════════════════════════════
function SlideNode({ data }: { data: { n: BoardNode } }) {
  return (
    <div className={`slidecard tone-${data.n.tone ?? 'neutral'}`} style={{ width: CARD_W, height: CARD_H }}>
      <SlideView slide={data.n.slide} />
    </div>
  )
}

interface UNodeData extends Record<string, unknown> { u: UserNode; onChange: (u: UserNode) => void; onDelete: (id: string) => void; onOpenPin: (id: string) => void }

function NoteNode({ data }: { data: UNodeData }) {
  const { u } = data
  const [editing, setEditing] = useState(!u.text)
  // 말줄임 대신 글자 크기가 내려간다 · 짧으면 13px, 길수록 11px 까지
  const fs = (u.text?.length ?? 0) > 220 ? 11 : (u.text?.length ?? 0) > 120 ? 12 : 13
  return (
    <div className="bnote" style={{ background: u.color ?? '#F3E4B4', fontSize: fs }} onDoubleClick={() => setEditing(true)}>
      {editing ? (
        <textarea autoFocus defaultValue={u.text ?? ''} className="nodrag"
          onBlur={e => { setEditing(false); data.onChange({ ...u, text: e.target.value }) }} />
      ) : (
        <p>{u.text || t('Double-click to write')}</p>
      )}
      <span className="bnote-by">{u.author}</span>
      <button className="bx nodrag" onClick={() => data.onDelete(u.id)} aria-label={t('Delete')}>✕</button>
    </div>
  )
}

function TextNode({ data }: { data: UNodeData }) {
  const { u } = data
  const [editing, setEditing] = useState(!u.text)
  return (
    <div className="btext" onDoubleClick={() => setEditing(true)}>
      {editing ? (
        <textarea autoFocus defaultValue={u.text ?? ''} className="nodrag"
          onBlur={e => { setEditing(false); data.onChange({ ...u, text: e.target.value }) }} />
      ) : (
        <p>{u.text || t('Double-click to write')}</p>
      )}
      <button className="bx nodrag" onClick={() => data.onDelete(u.id)} aria-label={t('Delete')}>✕</button>
    </div>
  )
}

function ImageNode({ data }: { data: UNodeData }) {
  const { u } = data
  return (
    <div className="bimg">
      {u.url && <img src={u.url} alt="" draggable={false} />}
      <span className="bnote-by">{u.author}</span>
      <button className="bx nodrag" onClick={() => data.onDelete(u.id)} aria-label={t('Delete')}>✕</button>
    </div>
  )
}

function FrameNode({ data }: { data: UNodeData }) {
  const { u } = data
  const [editing, setEditing] = useState(false)
  return (
    <div className="bframe" style={{ width: u.w ?? 920, height: u.h ?? 580 }}>
      {editing ? (
        <input autoFocus className="bframe-t nodrag" defaultValue={u.title ?? ''}
          onBlur={e => { setEditing(false); data.onChange({ ...u, title: e.target.value }) }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      ) : (
        <span className="bframe-t" onDoubleClick={() => setEditing(true)}>{u.title || t('Frame')}</span>
      )}
      <button className="bx nodrag" onClick={() => data.onDelete(u.id)} aria-label={t('Delete')}>✕</button>
    </div>
  )
}

function ShapeNode({ data }: { data: UNodeData }) {
  const { u } = data
  return (
    <div className="bshape" style={{ width: u.w ?? 260, height: u.h ?? 170 }}>
      <button className="bx nodrag" onClick={() => data.onDelete(u.id)} aria-label={t('Delete')}>✕</button>
    </div>
  )
}

function PinNode({ data }: { data: UNodeData }) {
  // 구글 문서식 · 핀은 단 사람의 아바타 원이고, 누르면 오른쪽 레일에 스레드가 열린다.
  // 글자·말풍선을 마커에 얹지 않는다 — 예전 title/개수 배지가 "핀에 글씨가 써지는" 혼란을 만들었다.
  const { u } = data
  const who = (u.thread?.[0]?.author ?? u.author ?? '?').slice(0, 1).toUpperCase()
  return (
    <button className="bpin nodrag" style={{ background: u.color ?? '#5A63C8' }}
      onClick={() => data.onOpenPin(u.id)} aria-label={t('Comments')}>
      <span>{who}</span>
    </button>
  )
}

const nodeTypes = {
  slide: SlideNode, note: NoteNode, text: TextNode, image: ImageNode,
  pin: PinNode, frame: FrameNode, shape: ShapeNode,
}

// ── 문서 적용 · 서버의 applyOps 와 같은 규칙 ─────────────────────────
function applyOpsLocal(doc: BoardDoc, ops: BoardOp[]) {
  for (const op of ops) {
    if (op.t === 'snode') doc.snodes[op.node.id] = op.node
    else if (op.t === 'unode') doc.unodes[op.node.id] = op.node
    else if (op.t === 'udel') delete doc.unodes[op.id]
    else if (op.t === 'pos') doc.pos[op.id] = op.xy
  }
}

function BoardInner({ st, runId }: { st: RunState | null; runId: string }) {
  const rf = useReactFlow()
  const model = useMemo(() => st ? buildBoardModel(st) : null, [st])

  // ── 실시간 연결 · undefined = 연결 시도 중 ─────────────────────────
  const [live, setLive] = useState<LiveBoard | null | undefined>(undefined)
  const docRef = useRef<BoardDoc>({ rev: 0, snodes: {}, unodes: {}, pos: {}, updatedAt: 0 })
  const [tick, setTick] = useState(0)
  const bump = () => setTick(v => v + 1)
  const [cursors, setCursors] = useState<Record<string, CursorMsg & { at: number }>>({})
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const h = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(h)
  }, [toast])
  const [openPin, setOpenPin] = useState<string | null>(null)
  // 핀 모드 · 켜면 커서가 핀이 되고, 캔버스를 찍은 자리에 컴포저가 뜬다.
  // 핀은 첫 댓글이 보내질 때 비로소 만들어진다 — 빈 핀이 남지 않는다.
  const [pinMode, setPinMode] = useState(false)
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null)
  const [nameOpen, setNameOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState(myName())

  useEffect(() => {
    let dead = false
    let lb: LiveBoard | null = null
    joinBoard(runId,
      ops => { applyOpsLocal(docRef.current, ops); bump() },
      c => setCursors(prev => {
        if (c.gone) { const { [c.clientId]: _drop, ...rest } = prev; return rest }
        return { ...prev, [c.clientId]: { ...c, at: Date.now() } }
      }),
    ).then(joined => {
      if (dead) { joined?.close(); return }
      lb = joined
      if (joined) docRef.current = joined.doc
      setLive(joined)
      // 결과 카드를 문서에 밀어 넣는다 · 방문자는 이걸로 그린다 (바뀐 것만)
      if (joined && model) {
        const ops: BoardOp[] = []
        for (const n of model.nodes) {
          if (JSON.stringify(joined.doc.snodes[n.id]) !== JSON.stringify(n)) {
            joined.doc.snodes[n.id] = n
            ops.push({ t: 'snode', node: n })
          }
        }
        if (ops.length) joined.send(ops)
      }
      bump()
    })
    return () => { dead = true; lb?.close() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, model])

  // 오래 조용한 커서는 걷는다
  useEffect(() => {
    const iv = setInterval(() => {
      setCursors(prev => {
        const now = Date.now()
        const next = Object.fromEntries(Object.entries(prev).filter(([, c]) => now - c.at < 6000))
        return Object.keys(next).length === Object.keys(prev).length ? prev : next
      })
    }, 2000)
    return () => clearInterval(iv)
  }, [])

  // ── 편집 보내기 · 문서에 먼저 적용하고(낙관) 서버로 ────────────────
  const commit = useCallback((ops: BoardOp[]) => {
    applyOpsLocal(docRef.current, ops)
    bump()
    live?.send(ops)
  }, [live])

  // ── 화면 노드 만들기 · 결과 카드 + 사람이 붙인 것 + 위치 덮어쓰기 ───
  const slideNodes: BoardNode[] = useMemo(() => {
    if (model) return model.nodes
    return Object.values(docRef.current.snodes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, tick, live])

  const unodeData = useCallback((u: UserNode): UNodeData => ({
    u,
    onChange: (nu) => commit([{ t: 'unode', node: nu }]),
    onDelete: (id) => { commit([{ t: 'udel', id }]); setOpenPin(p => p === id ? null : p) },
    onOpenPin: (id) => setOpenPin(id),
  }), [commit])

  const builtNodes: Node[] = useMemo(() => {
    const pos = docRef.current.pos
    const out: Node[] = slideNodes.map((n, i) => ({
      id: n.id, type: 'slide',
      position: pos[n.id] ?? { x: (n.column ?? i % 3) * (CARD_W + GAP), y: (n.row ?? Math.floor(i / 3)) * (CARD_H + GAP) },
      data: { n }, draggable: true,
    }))
    for (const u of Object.values(docRef.current.unodes)) {
      out.push({
        id: u.id, type: u.kind,
        position: pos[u.id] ?? { x: u.x, y: u.y },
        data: unodeData(u), draggable: true,
        // 프레임·도형은 카드 뒤에 깔린다
        zIndex: u.kind === 'pin' ? 30 : (u.kind === 'frame' || u.kind === 'shape') ? 0 : 20,
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideNodes, tick, unodeData])

  const [nodes, setNodes] = useState<Node[]>(builtNodes)
  useEffect(() => { setNodes(builtNodes) }, [builtNodes])
  const onNodesChange = useCallback((ch: NodeChange[]) => setNodes(ns => applyNodeChanges(ch, ns)), [])
  const onNodeDragStop = useCallback((_e: unknown, n: Node) => {
    commit([{ t: 'pos', id: n.id, xy: { x: Math.round(n.position.x), y: Math.round(n.position.y) } }])
  }, [commit])

  useEffect(() => {
    const tm = setTimeout(() => rf.fitView({ duration: 300, padding: 0.1 }), 150)
    return () => clearTimeout(tm)
  }, [rf, model, live])

  // ── 커서 보내기 · 8Hz 로 죽인다 ────────────────────────────────────
  const lastCur = useRef(0)
  const onMove = useCallback((e: React.PointerEvent) => {
    if (!live) return
    const now = Date.now()
    if (now - lastCur.current < 120) return
    lastCur.current = now
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    live.sendCursor(Math.round(p.x), Math.round(p.y))
  }, [live, rf])
  const onLeave = useCallback(() => { live?.sendCursor(0, 0, true) }, [live])

  // ── 붙이기 · 화면 가운데의 캔버스 좌표에 놓는다 ────────────────────
  const centerFlow = () => rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
  const nid = (k: string) => `${k}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const addNote = () => {
    const c = centerFlow()
    commit([{ t: 'unode', node: { id: nid('note'), kind: 'note', x: c.x, y: c.y, text: '', author: myName(), color: '#FBE89C' } }])
  }
  const addText = () => {
    const c = centerFlow()
    commit([{ t: 'unode', node: { id: nid('text'), kind: 'text', x: c.x, y: c.y, text: '', author: myName() } }])
  }
  const addFrame = () => {
    const c = centerFlow()
    commit([{ t: 'unode', node: { id: nid('frame'), kind: 'frame', x: c.x - 460, y: c.y - 290, w: 920, h: 580, title: '', author: myName() } }])
  }
  const addShape = () => {
    const c = centerFlow()
    commit([{ t: 'unode', node: { id: nid('shape'), kind: 'shape', x: c.x - 130, y: c.y - 85, w: 260, h: 170, author: myName() } }])
  }
  // 핀 모드에서 캔버스를 찍으면 · 그 자리에 컴포저를 열고 커서는 보통으로 돌린다
  const onPaneClick = useCallback((e: React.MouseEvent) => {
    if (!pinMode) { setOpenPin(null); return }
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setDraft({ x: Math.round(p.x), y: Math.round(p.y) })
    setPinMode(false)
  }, [pinMode, rf])

  useEffect(() => {
    if (!draft && !pinMode) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDraft(null); setPinMode(false) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [draft, pinMode])

  // 코멘트 레일 목록 · 첫 댓글이 달린 핀들, 오래된 것부터 쌓인다
  const pinList = useMemo(() =>
    Object.values(docRef.current.unodes)
      .filter(u => u.kind === 'pin' && (u.thread?.length ?? 0) > 0)
      .sort((a, b) => (a.thread![0].at ?? 0) - (b.thread![0].at ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, model])
  const fileRef = useRef<HTMLInputElement>(null)
  const addImage = async (f: File) => {
    if (!live) return
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result)); r.onerror = rej
      r.readAsDataURL(f)
    })
    try {
      const url = await live.uploadImage(dataUrl)
      const c = centerFlow()
      commit([{ t: 'unode', node: { id: nid('img'), kind: 'image', x: c.x, y: c.y, url, author: myName() } }])
    } catch { /* 실패는 조용히 · 6MB 초과 등 */ }
  }

  const share = async () => {
    pushShareTarget(runId, 'board')
    const link = shareLink(runId, 'board')
    // HTTP 배포(EB 기본 도메인)에는 navigator.clipboard 가 아예 없다 —
    // 조용히 실패하던 자리라 execCommand 폴백과 복사 알림을 함께 둔다.
    let ok = false
    try { await navigator.clipboard.writeText(link); ok = true } catch { /* 아래 폴백 */ }
    if (!ok) {
      const ta = document.createElement('textarea')
      ta.value = link
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select()
      try { ok = document.execCommand('copy') } catch { ok = false }
      ta.remove()
    }
    // 복사가 끝내 안 되면 링크 자체를 보여 준다 — 거짓 성공 알림은 띄우지 않는다
    setToast(ok ? t('Link copied. Anyone who opens it joins this board.') : link)
  }

  // ── 발표 모드 · 캔버스 위에서 아래로, 왼쪽에서 오른쪽으로 ───────────
  const presentOrder = useMemo(() => {
    const pos = docRef.current.pos
    const entries: { id: string; y: number; x: number; slide?: SlidePayload; u?: UserNode }[] = []
    slideNodes.forEach((n, i) => {
      const p = pos[n.id] ?? { x: (n.column ?? i % 3) * (CARD_W + GAP), y: (n.row ?? Math.floor(i / 3)) * (CARD_H + GAP) }
      entries.push({ id: n.id, x: p.x, y: p.y, slide: n.slide })
    })
    for (const u of Object.values(docRef.current.unodes)) {
      if (u.kind === 'pin') continue           // 핀은 주석이다 · 발표에 끼우지 않는다
      const p = pos[u.id] ?? { x: u.x, y: u.y }
      entries.push({ id: u.id, x: p.x, y: p.y, u })
    }
    return entries.sort((a, b) => (a.y - b.y) || (a.x - b.x))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideNodes, tick])

  const [present, setPresent] = useState(false)
  const [idx, setIdx] = useState(0)
  const goTo = useCallback((i: number) => setIdx(Math.max(0, Math.min(presentOrder.length - 1, i))), [presentOrder.length])
  useEffect(() => {
    if (!present) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null
      if (e.key === ' ' && el?.closest('button')) return
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goTo(idx + 1) }
      if (e.key === 'ArrowLeft') goTo(idx - 1)
      if (e.key === 'Home') goTo(0)
      if (e.key === 'End') goTo(presentOrder.length - 1)
      if (e.key === 'Escape') setPresent(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [present, idx, goTo, presentOrder.length])

  const cur = presentOrder[idx]
  const pinOpenNode = openPin ? docRef.current.unodes[openPin] : null

  const modeLabel = st ? t(MODE_LABEL[st.params.mode]) : t('Shared board')

  return (
    <div className={`board${pinMode ? ' pin-mode' : ''}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="boardbar">
        <div className="bb-row bb-top">
          <span className="bb-title">{t('Review board')}</span>
          <span className="bb-sub">{modeLabel} · {tf('{n} cards', { n: builtNodes.length })}</span>
          {live === null && <span className="bb-off">{t('local only')}</span>}
          <span className="bb-gap" />
          {live !== null && (
            <div className="bb-me">
              {/* 구글 드라이브식 · 내 아바타를 눌러야 내 이름을 고친다. 남의 이름은 만질 수 없다. */}
              <button className="bb-ava" style={{ background: myColor() }} title={t('Your name on this board')}
                onClick={() => { setNameDraft(myName()); setNameOpen(v => !v) }}>
                {myName().slice(0, 1).toUpperCase()}
              </button>
              {nameOpen && (
                <div className="bb-namepop">
                  <span className="hint">{t('Your name on this board')}</span>
                  <input className="input" autoFocus value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    onBlur={() => { setMyName(nameDraft); setNameDraft(myName()); setNameOpen(false) }} />
                </div>
              )}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={share}>{t('Share')}</button>
          <button className="btn btn-primary btn-sm" disabled={!presentOrder.length}
            onClick={() => { setIdx(0); setPresent(true) }}>{t('Present')}</button>
        </div>
        {live === null && (
          <div className="bb-row"><span className="hint">{t('Realtime collaboration needs the local server. On the static demo the board stays in this browser.')}</span></div>
        )}
      </div>

      {/* 공유 알림 · 누르면 닫힌다 */}
      {toast && <div className="board-toast" onClick={() => setToast(null)}>{toast}</div>}

      <ReactFlow
        nodes={nodes} edges={[]}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView minZoom={0.05} maxZoom={2.5}
        zoomOnScroll zoomOnPinch panOnScroll={false} preventScrolling
        proOptions={{ hideAttribution: true }}
      >
        {/* 다른 사람 커서 · 캔버스 좌표에 붙는다 */}
        <ViewportPortal>
          {Object.values(cursors).map(c => (
            <div className="bcursor" key={c.clientId}
              style={{ transform: `translate(${c.x}px, ${c.y}px)` }}>
              <svg viewBox="0 0 16 16" width="15" height="15"><path d="M2 1l5 13 2-5.5L14.5 7z" fill={c.color} stroke="#fff" strokeWidth="1" /></svg>
              <span style={{ background: c.color }}>{c.name}</span>
            </div>
          ))}
          {/* 방금 찍은 핀 자리 · 첫 댓글을 보내면 그때 핀이 만들어진다 */}
          {draft && (
            <div className="pin-draft" style={{ transform: `translate(${draft.x}px, ${draft.y}px)` }}
              onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
              <span className="bpin" style={{ background: myColor() }}>{myName().slice(0, 1).toUpperCase()}</span>
              <div className="pin-composer">
                <PinInput autoFocus placeholder={t('Leave a comment')} onSend={text => {
                  commit([{ t: 'unode', node: {
                    id: nid('pin'), kind: 'pin', x: draft.x, y: draft.y,
                    author: myName(), color: myColor(),
                    thread: [{ id: nid('c'), author: myName(), text, at: Date.now() }],
                  } }])
                  setDraft(null)
                }} />
                <button className="bx" onClick={() => setDraft(null)} aria-label={t('Close')}>✕</button>
              </div>
            </div>
          )}
        </ViewportPortal>
      </ReactFlow>

      {/* ── 붙이기 툴바 · 보드 하단 중앙에 뜬다 ─────────────────────
          아이콘만, 이름은 title 로. 프레임·도형은 카드 뒤에 깔리는 틀이고,
          핀은 자리에 다는 댓글이다. Show Pin 토글로 핀만 걷어 볼 수 있다. */}
      {live !== null && (
        <div className="btoolbar" role="toolbar" aria-label={t('Board tools')}>
          <button className="bt-btn" title={t('Frame')} onClick={addFrame}>
            <svg viewBox="0 0 20 20" width="17" height="17"><path d="M5.5 2v16M14.5 2v16M2 5.5h16M2 14.5h16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          <button className="bt-btn" title={t('Shape')} onClick={addShape}>
            <svg viewBox="0 0 20 20" width="17" height="17"><rect x="3" y="4.5" width="14" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          <button className="bt-btn" title={t('Note')} onClick={addNote}>
            <svg viewBox="0 0 20 20" width="17" height="17"><path d="M4 3h12v9l-4 5H4z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 17v-5h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          </button>
          <button className="bt-btn" title={t('Text')} onClick={addText}>
            <svg viewBox="0 0 20 20" width="17" height="17"><path d="M4 5V3.5h12V5M10 3.5v13M7.5 16.5h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          <button className="bt-btn" title={t('Image')} onClick={() => fileRef.current?.click()}>
            <svg viewBox="0 0 20 20" width="17" height="17"><rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="7" cy="8" r="1.4" fill="currentColor" /><path d="M4 14.5 8.5 10l3 3 2-2 2.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
          </button>
          {/* 압정 · 켜면 커서가 핀이 되고 찍은 자리에 댓글을 단다 */}
          <button className={`bt-btn${pinMode ? ' on' : ''}`} title={t('Comment pin')} aria-pressed={pinMode}
            onClick={() => { setPinMode(v => !v); setDraft(null) }}>
            <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
              <path d="M12.2 2.4 17.6 7.8 15 8.7a2.6 2.6 0 0 0-1.6 1.6l-1 2.9-6.6-6.6 2.9-1a2.6 2.6 0 0 0 1.6-1.6z"
                fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M8.5 11.5 3.2 16.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) addImage(f); e.target.value = '' }} />
        </div>
      )}

      {/* 코멘트 레일 · 댓글이 쌓이면 오른쪽에 계속 붙는다. 핀을 누르면 그 핀의 스레드(대댓글)로 들어간다. */}
      {(pinList.length > 0 || pinOpenNode) && !present && (
        <aside className="pinrail">
          {!pinOpenNode ? (
            <>
              <header><b>{tf('{n} Comments', { n: pinList.length })}</b></header>
              <div className="pr-list">
                {pinList.map(u => {
                  const c0 = u.thread![0]
                  return (
                    <button className="pr-item" key={u.id} onClick={() => setOpenPin(u.id)}>
                      <span className="bb-ava" style={{ background: u.color ?? '#5A63C8' }}>{c0.author.slice(0, 1).toUpperCase()}</span>
                      <span className="pr-body">
                        <b>{c0.author}</b>
                        <p>{c0.text}</p>
                        <i>{fmtAgo(c0.at)}</i>
                        {u.thread!.length > 1 && <em>{tf('{n} replies', { n: u.thread!.length - 1 })}</em>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <header>
                <button className="bx" onClick={() => setOpenPin(null)} aria-label={t('Back')}>‹</button>
                <b>{t('Reply')}</b>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  commit([{ t: 'udel', id: pinOpenNode.id }]); setOpenPin(null)
                }}>{t('Delete pin')}</button>
              </header>
              <div className="pr-list pr-thread">
                {(pinOpenNode.thread ?? []).map((c, i) => (
                  <div className={`pr-item${i === 0 ? ' root' : ''}`} key={c.id}>
                    <span className="bb-ava" style={{ background: pinOpenNode.color ?? '#5A63C8' }}>{c.author.slice(0, 1).toUpperCase()}</span>
                    <span className="pr-body"><b>{c.author}</b><p>{c.text}</p><i>{fmtAgo(c.at)}</i></span>
                  </div>
                ))}
                {(pinOpenNode.thread ?? []).length < 2 && <p className="hint">{t('No replies yet. Leave one!')}</p>}
              </div>
              <PinInput placeholder={t('Leave a comment')} onSend={(text) => {
                const u = docRef.current.unodes[pinOpenNode.id]
                if (!u) return
                const thread = [...(u.thread ?? []), { id: nid('c'), author: myName(), text, at: Date.now() }]
                commit([{ t: 'unode', node: { ...u, thread } }])
              }} />
            </>
          )}
        </aside>
      )}

      {present && cur && (
        <div className="present" role="dialog" aria-label={t('Presentation')}>
          {/* 우측 상단 닫기 · Esc 와 같은 일 */}
          <button className="present-x" onClick={() => setPresent(false)} aria-label={t('Close')}>✕</button>
          <div className="present-stage">
            {cur.slide && <SlideView slide={cur.slide} present />}
            {cur.u?.kind === 'note' && <div className="present-note" style={{ background: cur.u.color ?? '#FBE89C' }}><p>{cur.u.text}</p><span>{cur.u.author}</span></div>}
            {cur.u?.kind === 'text' && <div className="present-text"><p>{cur.u.text}</p></div>}
            {cur.u?.kind === 'image' && cur.u.url && <img className="present-img" src={cur.u.url} alt="" />}
          </div>
          <button className="present-nav left" disabled={idx === 0} onClick={() => goTo(idx - 1)} aria-label={t('Previous')}>‹</button>
          <button className="present-nav right" disabled={idx === presentOrder.length - 1} onClick={() => goTo(idx + 1)} aria-label={t('Next')}>›</button>
          <div className="present-foot">
            <span className="pf-page">{idx + 1} / {presentOrder.length}</span>
            <div className="pf-thumbs">
              {presentOrder.map((n, i) => (
                <button key={n.id} className={i === idx ? 'on' : ''}
                  onClick={() => goTo(i)}>{i + 1}</button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setPresent(false)}>{t('Exit')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function PinInput({ onSend, placeholder, autoFocus }: { onSend: (text: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const [v, setV] = useState('')
  const send = () => { const s = v.trim(); if (!s) return; onSend(s); setV('') }
  return (
    <div className="pin-input">
      <input className="input" value={v} placeholder={placeholder ?? t('Write a comment')} autoFocus={autoFocus}
        onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') send() }} />
      <button className="pin-send" onClick={send} aria-label={t('Send')} disabled={!v.trim()}>
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
          <path d="M2.5 10 17 3 12.5 17l-3-5.5z M9.5 11.5 17 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

/** 방금·몇 분 전 식의 상대 시각 · 하루가 넘으면 날짜로 */
function fmtAgo(at?: number): string {
  if (!at) return ''
  const d = Math.max(0, Date.now() - at)
  if (d < 60_000) return t('Just now')
  const m = Math.floor(d / 60_000)
  if (m < 60) return tf('{n} min ago', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return tf('{n} hr ago', { n: h })
  return new Date(at).toLocaleDateString()
}

export default function Board({ st, runId }: { st: RunState | null; runId: string }) {
  return <ReactFlowProvider><BoardInner st={st} runId={runId} /></ReactFlowProvider>
}
