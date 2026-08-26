// ── 호스트(VRINGON) 사용자 확인 ──────────────────────────────────────
// 이 앱은 VRINGON QA 의 Planning 메뉴에서 새 탭으로 열린다. 그때 호스트가 실어 보낸
// 액세스 토큰을 그대로 VRINGON API 에 되물어 "누구인지" 를 확인한다.
//   GET {VRINGON_API}/user/info   ·  Authorization: Bearer <token>
//   → { status, message, body: { userId, email, nickName, ... } }
//
// 토큰을 우리가 해석하지 않는다(서명 키가 없다). 발급처에 물어보는 것이 유일하게
// 정직한 방법이고, 위조 토큰은 여기서 그대로 걸러진다.
//
// 확인된 결과만 짧게 캐시한다 — 화면을 넘길 때마다 남의 서버를 두드리지 않기 위해서다.
// 캐시에도 토큰 원문은 두지 않는다(해시만).
import { createHash } from 'node:crypto'

const API = (process.env.VRINGON_API ?? 'https://qa-api.vringon.com').replace(/\/$/, '')
const TTL = 5 * 60_000
const cache = new Map()          // tokenHash → { user, at }

const hash = (s) => createHash('sha256').update(String(s)).digest('hex')

/** 요청에서 호스트 토큰 꺼내기 · 헤더가 정석, 첫 진입만 쿼리를 본다 */
function tokenOf(req, url) {
  const h = req.headers['x-host-token']
  if (typeof h === 'string' && h) return h
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7)
  const q = url?.searchParams?.get('token')
  return q || null
}

/**
 * 이 요청을 보낸 사람이 누구인지 · 확인 못 하면 null.
 * null 이면 호출부는 저장을 거부한다(익명으로 남기면 다시 "모두의 목록" 이 된다).
 */
export async function resolveUser(req, url) {
  const token = tokenOf(req, url)
  if (!token) return null
  const key = hash(token)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.user

  try {
    const r = await fetch(`${API}/user/info`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const j = await r.json()
    const b = j?.body
    if (!b?.userId) return null
    const user = { id: String(b.userId), name: b.nickName || String(b.email ?? '').split('@')[0] }
    cache.set(key, { user, at: Date.now() })
    // 캐시가 무한히 자라지 않게 · 오래된 것부터 걷는다
    if (cache.size > 500) {
      for (const [k, v] of cache) if (Date.now() - v.at > TTL) cache.delete(k)
    }
    return user
  } catch {
    return null                  // 호스트 API 가 답이 없으면 익명으로 본다
  }
}

/** 상태 화면용 · 어느 호스트에 물어보는지만 알린다 */
export function hostAuthStatus() {
  return { api: API }
}
