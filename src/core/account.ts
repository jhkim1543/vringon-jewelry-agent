// ── 계정별 분석 내역 ────────────────────────────────────────────────
// 지금까지 내역은 브라우저 localStorage 하나뿐이라 같은 PC 면 누가 로그인하든 같은 목록이었다.
// 여기서는 호스트(VRINGON)가 알려 준 사용자로 서버에 저장한다.
//
// 화면은 그대로 store.ts(동기)를 읽는다. 이 파일은 그 사이에서
//   · 앱이 열릴 때  서버 목록 → 로컬 캐시 (계정이 바뀌면 이전 계정 것은 지운다)
//   · 저장·삭제·별 → 로컬에 먼저 쓰고 서버로도 보낸다 (화면이 기다리지 않는다)
// 만 한다. 로그인 정보가 없으면(주소를 직접 연 데모) 예전처럼 로컬에만 남는다.
import type { RunRecord } from './store'
import { apiUrl } from './api'
import { isUsableRun } from './store'
import { hostInfo } from './host'

const TOKEN_KEY = 'vringon.hostToken'
const OWNER_KEY = 'vringon.runsOwner'

/** 호스트 토큰 · 첫 진입에 URL 로 받은 뒤 이 탭에서만 들고 있는다 */
export function hostToken(): string | null {
  const fromUrl = hostInfo().token
  if (fromUrl) {
    try { sessionStorage.setItem(TOKEN_KEY, fromUrl) } catch { /* 무시 */ }
    return fromUrl
  }
  try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const tk = hostToken()
  if (tk) h['X-Host-Token'] = tk
  return h
}

export interface Account { id: string; name?: string }

let account: Account | null = null
export function currentAccount(): Account | null { return account }

/** 로그인한 사람인지 서버에 물어본다 · 못 물어보면 null (로컬 전용으로 돈다) */
export async function detectAccount(): Promise<Account | null> {
  if (!hostToken()) return null
  try {
    const r = await fetch(apiUrl('/api/status'), { headers: headers() })
    if (!r.ok) return null
    const j = await r.json()
    account = j?.user ?? null
    return account
  } catch { return null }
}

/**
 * 서버 목록을 로컬 캐시로 당겨 온다.
 * 계정이 바뀌었으면 이전 계정의 기록을 먼저 지운다 — 남의 목록이 보이면 안 된다.
 * 샘플(데모용)은 서버에 올리지 않으므로 로컬 것을 그대로 남긴다.
 */
export async function pullRuns(
  readLocal: () => RunRecord[],
  writeLocal: (rows: RunRecord[]) => void,
): Promise<boolean> {
  const acc = account ?? await detectAccount()
  if (!acc) return false

  let prevOwner: string | null = null
  try { prevOwner = localStorage.getItem(OWNER_KEY) } catch { /* 무시 */ }
  const samples = readLocal().filter(r => r.state?.sample)
  if (prevOwner && prevOwner !== acc.id) writeLocal(samples)   // 계정 전환 · 남의 기록을 걷는다
  try { localStorage.setItem(OWNER_KEY, acc.id) } catch { /* 무시 */ }

  try {
    const r = await fetch(apiUrl('/api/runs'), { headers: headers() })
    if (!r.ok) return false
    const j = await r.json()
    const index: { id: string }[] = j?.runs ?? []
    // 목록에는 본문이 없다 · 본문까지 하나씩 받아 화면이 바로 열리게 채운다
    const full: RunRecord[] = []
    for (const row of index.slice(0, 40)) {
      try {
        const rr = await fetch(apiUrl(`/api/runs/${encodeURIComponent(row.id)}`), { headers: headers() })
        if (!rr.ok) continue
        const rec = await rr.json()
        // 손상된 기록 하나가 화면 전체를 죽이지 않게, 쓸 수 있는 것만 들인다
        if (isUsableRun(rec)) full.push(rec)
      } catch { /* 하나쯤 못 받아도 나머지는 보여 준다 */ }
    }
    const localOnly = readLocal().filter(l => l.state?.sample && !full.some(f => f.id === l.id))
    writeLocal([...full, ...localOnly])
    return true
  } catch { return false }
}

/** 저장 · 화면을 기다리게 하지 않는다 (실패해도 로컬에는 남아 있다) */
export function pushRun(rec: RunRecord) {
  if (!account || rec.state?.sample) return
  fetch(apiUrl('/api/runs'), { method: 'POST', headers: headers(), body: JSON.stringify(rec) })
    .catch(() => undefined)
}

export function pushDelete(id: string) {
  if (!account) return
  fetch(apiUrl(`/api/runs/${encodeURIComponent(id)}`), { method: 'DELETE', headers: headers() })
    .catch(() => undefined)
}

