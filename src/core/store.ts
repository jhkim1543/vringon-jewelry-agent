// ── Run 저장소 · 실행 이력과 즐겨찾기를 라이브러리처럼 다룬다 ──────────
// 진행 중인 Run도 계속 저장한다. 새로고침이나 렌더 오류로 화면이 날아가도
// 결과를 잃지 않게 하기 위한 것이다.
import type { RunParams, RunState } from './types'
import { pushDelete, pushFavorite, pushRun } from './account'

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

/** 옛 알고리즘(스펙·룰 파이프라인) 저장본은 새 화면이 읽지 못한다.
 *  algo 표식이 없는 기록은 목록에서 거른다 — 지우지는 않는다, 되돌릴 수 없으므로.
 *  params 도 함께 본다: 서버에서 받아 온 기록이 손상돼 있으면 화면 전체가 죽는다
 *  (실측: params 없는 기록 하나로 "Cannot read properties of undefined (reading 'mode')"). */
export function isUsableRun(r: unknown): r is RunRecord {
  const rec = r as RunRecord | undefined
  return !!rec && typeof rec.id === 'string'
    && rec.state?.algo === 2 && !!rec.state?.params?.mode && Array.isArray(rec.state?.pairs)
}
function isCurrentAlgo(r: RunRecord): boolean {
  return isUsableRun(r)
}

export function listRuns(): RunRecord[] {
  // 같은 도메인의 신발 데모와 저장소 키를 공유한다. 주얼리가 아닌 Run이 섞이면
  // 화면이 낯선 스펙을 읽다 죽으므로, 읽을 때 걸러내고 저장소에서도 지운다.
  const all = read<RunRecord[]>(KEY, [])
  return all.filter(isCurrentAlgo).map(r => r).sort((a, b) => b.savedAt - a.savedAt)
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
  pushRun(rec)                      // 로그인 상태면 계정에도 남는다
}

export function deleteRun(id: string) {
  write(KEY, read<RunRecord[]>(KEY, []).filter(r => r.id !== id))
  pushDelete(id)
}

export function toggleFavorite(id: string): boolean {
  const all = read<RunRecord[]>(KEY, [])
  const r = all.find(x => x.id === id)
  if (!r) return false
  r.favorite = !r.favorite
  write(KEY, all)
  pushFavorite(id, r.favorite)
  return r.favorite
}

/** 계정 동기화가 쓰는 통로 · 화면은 여전히 위의 동기 함수만 쓴다 */
export function readAllRuns(): RunRecord[] { return read<RunRecord[]>(KEY, []) }
export function writeAllRuns(rows: RunRecord[]) { write(KEY, rows) }

// ── 진행 중 Run · 새로고침 복구용 ───────────────────────────────────
export function saveCurrent(id: string, st: RunState) {
  write(CURRENT, { id, savedAt: Date.now(), state: st })
}
export function loadCurrent(): { id: string; savedAt: number; state: RunState } | null {
  const cur = read<{ id: string; savedAt: number; state: RunState } | null>(CURRENT, null)
  if (cur && cur.state?.algo !== 2) return null
  return cur
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
  for (const p of st.pairs) {
    const v = p.versions[p.versions.length - 1]
    if (v) return v.url
  }
  // 디자인이 아직 없으면 컬렉션 라인업이나 콘셉트 아트라도
  for (const set of st.sets ?? []) {
    if (set.lineup) return set.lineup.url
    const art = set.art && Object.values(set.art)[0]
    if (art) return art.url
  }
  return undefined
}

// ── 지난 실행 설정 · 다음 실행의 출발점 ─────────────────────────────
// 매번 같은 값을 다시 채우게 하면 그것만으로 진입 장벽이 된다.
// 결과가 아니라 "무엇을 어떻게 돌렸는지"만 담는다(업로드 파일은 제외 — 그건 그 실행의 자료다).
const LAST_KEY = 'vringon.lastrun'

export function saveLastParams(p: RunParams) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(p)) } catch { /* 저장 실패가 실행을 막지 않는다 */ }
}

export function loadLastParams(): RunParams | null {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as RunParams
    // 옛 알고리즘의 설정은 필드가 다르다 · algo 표식 없으면 버린다
    return p.algo === 2 ? p : null
  } catch { return null }
}
