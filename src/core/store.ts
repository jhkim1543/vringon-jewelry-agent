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

/** 예시 주소를 근거로 달고 저장된 옛 Run 을 읽을 때 걷어낸다.
 *  브라우저에 이미 남은 기록까지 고칠 방법은 이것뿐이다. 지우기만 하고 다른 것으로
 *  바꾸지 않는다 — 무엇이 근거였는지는 이제 알 수 없고, 지어내면 같은 잘못이다. */
const FAKE_REF = /example\.(com|org|net)|supabase:\/\//i
function scrubEvidence(r: RunRecord): RunRecord {
  const designs = r.state?.designs ?? []
  let touched = false
  const fixed = designs.map(d => {
    const refs = d.rationale?.reference_images ?? []
    const keep = refs.filter(x => !FAKE_REF.test(x.source_url ?? ''))
    if (keep.length === refs.length) return d
    touched = true
    return {
      ...d,
      rationale: {
        ...d.rationale,
        reference_images: keep,
        narrative: (d.rationale?.narrative ?? []).filter(n => !/References were used for attributes only/.test(n)),
      },
    }
  })
  // 바뀐 것이 없으면 같은 객체를 돌려준다. 새 객체를 만들면 Library 가 매번 다시 그린다.
  return touched ? { ...r, state: { ...r.state, designs: fixed } } : r
}

export function listRuns(): RunRecord[] {
  // 같은 도메인의 신발 데모와 저장소 키를 공유한다. 주얼리가 아닌 Run이 섞이면
  // 화면이 낯선 스펙을 읽다 죽으므로, 읽을 때 걸러내고 저장소에서도 지운다.
  const all = read<RunRecord[]>(KEY, [])
  const mine = all.filter(r => (r.state?.params?.category ?? 'jewelry') === 'jewelry')
  if (mine.length !== all.length) write(KEY, mine)
  return mine.map(scrubEvidence).sort((a, b) => b.savedAt - a.savedAt)
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
  const cur = read<{ id: string; savedAt: number; state: RunState } | null>(CURRENT, null)
  if (cur && (cur.state?.params?.category ?? 'jewelry') !== 'jewelry') return null
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
  for (const d of st.designs) {
    const im = d.images.find(i => i.view !== 'sketch') ?? d.images[0]
    if (im) return im.url
  }
  return undefined
}
