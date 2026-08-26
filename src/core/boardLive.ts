// ── 보드 실시간 클라이언트 ───────────────────────────────────────────
// 서버(board-api)와 이야기하는 얇은 계층. 문서를 받아 오고, 내 편집을 보내고,
// 남의 편집·커서를 SSE 로 받는다. 서버가 없으면(정적 배포) null 을 돌려주고
// 보드는 이 브라우저 안에서만 동작한다 — 흉내내지 않는다.
import type { BoardNode } from './boardModel'
import { apiUrl } from './api'

export interface BoardComment { id: string; author: string; text: string; at: number }

/** 사람이 붙이는 것들 · 결과 카드(snode)와 달리 지울 수 있다.
 *  frame 은 Figma 의 프레임처럼 카드들을 묶어 보이는 큰 틀(제목 있는 영역)이고,
 *  shape 는 강조용 단순 사각형이다. 둘 다 카드 뒤(z 낮음)에 깔린다. */
export interface UserNode {
  id: string
  kind: 'note' | 'text' | 'image' | 'pin' | 'frame' | 'shape'
  x: number
  y: number
  w?: number
  h?: number
  title?: string               // frame 전용
  text?: string
  color?: string
  url?: string                 // image 전용
  author?: string
  thread?: BoardComment[]      // pin 전용 · 댓글 스레드
}

export interface BoardDoc {
  rev: number
  snodes: Record<string, BoardNode>
  unodes: Record<string, UserNode>
  pos: Record<string, { x: number; y: number }>
  updatedAt: number
}

export type BoardOp =
  | { t: 'snode'; node: BoardNode }
  | { t: 'unode'; node: UserNode }
  | { t: 'udel'; id: string }
  | { t: 'pos'; id: string; xy: { x: number; y: number } }

export interface CursorMsg { clientId: string; name: string; color: string; x: number; y: number; gone?: boolean }

export interface LiveBoard {
  doc: BoardDoc
  clientId: string
  send(ops: BoardOp[]): void
  sendCursor(x: number, y: number, gone?: boolean): void
  uploadImage(dataUrl: string): Promise<string>
  close(): void
}

// ── 내 이름과 색 · 링크로 들어온 사람도 바로 이름이 생긴다 (수정 가능) ──
const PALETTE = ['#E4573D', '#2E8B6A', '#3D6DE4', '#B0662E', '#8B3DAE', '#C22F63', '#2E93A6']
export function myName(): string {
  let n = localStorage.getItem('vg-board-name')
  if (!n) {
    n = `게스트-${100 + Math.floor(Math.random() * 900)}`
    localStorage.setItem('vg-board-name', n)
  }
  return n
}
export function setMyName(n: string) { localStorage.setItem('vg-board-name', n.trim() || myName()) }
export function myColor(): string {
  const n = myName()
  let h = 0
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

function newClientId(): string {
  return `c-${Math.random().toString(36).slice(2, 10)}`
}

/** 접속 · 실패(정적 배포·서버 다운)면 null */
export async function joinBoard(
  id: string,
  onOps: (ops: BoardOp[]) => void,
  onCursor: (c: CursorMsg) => void,
): Promise<LiveBoard | null> {
  let doc: BoardDoc
  try {
    const r = await fetch(apiUrl(`/api/board/doc?id=${encodeURIComponent(id)}`))
    if (!r.ok) return null
    doc = (await r.json()).doc
  } catch { return null }

  const clientId = newClientId()
  const es = new EventSource(apiUrl(`/api/board/events?id=${encodeURIComponent(id)}`))
  es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.clientId === clientId) return          // 내 것의 메아리
      if (msg.type === 'ops') onOps(msg.ops)
      else if (msg.type === 'cursor') onCursor(msg)
    } catch { /* 한 줄 깨져도 스트림은 계속 */ }
  }

  const post = (path: string, body: unknown) =>
    fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  return {
    doc, clientId,
    send(ops) { post('/api/board/op', { id, clientId, ops }).catch(() => undefined) },
    sendCursor(x, y, gone) {
      post('/api/board/cursor', { id, clientId, name: myName(), color: myColor(), x, y, gone }).catch(() => undefined)
    },
    async uploadImage(dataUrl) {
      const r = await post('/api/board/image', { id, dataUrl })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error ?? 'upload failed')
      return j.url as string
    },
    close() { try { es.close() } catch { /* 이미 닫힘 */ } },
  }
}
