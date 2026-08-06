// ── Run 저장소 · 실행 이력과 즐겨찾기를 라이브러리처럼 다룬다 ──────────
// 진행 중인 Run도 계속 저장한다. 새로고침이나 렌더 오류로 화면이 날아가도
// 결과를 잃지 않게 하기 위한 것이다.
import type { RunState } from './types'

export interface RunRecord {
  id: string
  savedAt: number
  favorite: boolean
  title: string
  /** 목록 썸네일 · 첫 디자인 이미지 */
  thumb?: string
  state: RunState
}

const KEY = 'vringon.runs'
const CURRENT = 'vringon.currentRun'
const MAX = 40

function read<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k)
    return raw ? JSON.parse(raw) as T : fallback
  } catch { return fallback }
}

function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)) }
  catch { /* 용량 초과 시 조용히 넘긴다. 저장 실패가 실행을 막으면 안 된다 */ }
}

export function listRuns(): RunRecord[] {
  return read<RunRecord[]>(KEY, []).sort((a, b) => b.savedAt - a.savedAt)
}

export function getRun(id: string): RunRecord | undefined {
  return listRuns().find(r => r.id === id)
}

export function saveRun(rec: RunRecord) {
  const all = read<RunRecord[]>(KEY, []).filter(r => r.id !== rec.id)
  all.unshift(rec)
  // 즐겨찾기는 지우지 않고, 나머지만 오래된 순으로 정리한다
  const favs = all.filter(r => r.favorite)
  const rest = all.filter(r => !r.favorite).slice(0, MAX - favs.length)
  write(KEY, [...favs, ...rest])
}

export function deleteRun(id: string) {
  write(KEY, read<RunRecord[]>(KEY, []).filter(r => r.id !== id))
}

export function toggleFavorite(id: string): boolean {
  const all = read<RunRecord[]>(KEY, [])
  const r = all.find(x => x.id === id)
  if (!r) return false
  r.favorite = !r.favorite
  write(KEY, all)
  return r.favorite
}

// ── 진행 중 Run · 새로고침 복구용 ───────────────────────────────────
export function saveCurrent(id: string, st: RunState) {
  write(CURRENT, { id, savedAt: Date.now(), state: st })
}
export function loadCurrent(): { id: string; savedAt: number; state: RunState } | null {
  return read<{ id: string; savedAt: number; state: RunState } | null>(CURRENT, null)
}
export function clearCurrent() {
  try { localStorage.removeItem(CURRENT) } catch { /* 무시 */ }
}

export function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/** 목록에 보여줄 한 줄 제목 · 화면에서 길게 늘어지지 않게 짧게 만든다 */
export function makeTitle(st: RunState, labels: { mode: string; category: string; type: string }): string {
  return `${labels.type} · ${labels.mode}`
}

export function firstImage(st: RunState): string | undefined {
  for (const d of st.designs) {
    const im = d.images.find(i => i.view !== 'sketch') ?? d.images[0]
    if (im) return im.url
  }
  return undefined
}
