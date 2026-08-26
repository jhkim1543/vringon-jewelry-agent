// ── 호스트(VRINGON)에서 넘어온 값 ─────────────────────────────────
// Planning 메뉴가 이 앱을 열 때 URL 에 실어 보내는 것들: 화면 언어·테마·사용자.
// 넘어온 게 있으면 이 앱의 자체 토글을 감추고 호스트를 따른다 —
// 언어·테마는 VRINGON 한 곳에서만 고르게 하기 위함이다.
// 아무것도 안 넘어오면(주소를 직접 열었을 때) 예전처럼 이 앱이 스스로 정한다.
import type { Lang } from './i18n'

export interface HostInfo {
  /** 호스트가 언어·테마를 정해 주는가 (=Planning 으로 열렸는가) */
  embedded: boolean
  lang?: Lang
  theme?: 'light' | 'dark'
  /** 로그인한 사용자 · 분석 내역을 이 사람 것으로 저장한다 */
  user?: { id: string; name?: string }
  /** 호스트 토큰 · 서버가 사용자 확인에 쓴다 (화면에는 쓰지 않는다) */
  token?: string
}

let cached: HostInfo | null = null

export function hostInfo(): HostInfo {
  if (cached) return cached
  let info: HostInfo = { embedded: false }
  try {
    const q = new URLSearchParams(location.search)
    const lang = q.get('lang')
    const theme = q.get('theme')
    const uid = q.get('uid')
    const token = q.get('token')
    const name = q.get('uname')
    info = {
      embedded: q.get('embed') === '1' || !!(lang || theme || uid),
      lang: lang === 'ko' || lang === 'en' || lang === 'ja' ? lang : undefined,
      theme: theme === 'light' || theme === 'dark' ? theme : undefined,
      user: uid ? { id: uid, name: name ?? undefined } : undefined,
      token: token ?? undefined,
    }
    // 토큰·사용자 정보를 주소창에 남기지 않는다 (공유·기록으로 새어 나가는 걸 막는다)
    if (token || uid) {
      const clean = new URL(location.href)
      for (const k of ['token', 'uid', 'uname']) clean.searchParams.delete(k)
      history.replaceState(null, '', clean.toString())
    }
  } catch { /* 주소를 못 읽으면 독립 실행으로 본다 */ }
  cached = info
  return info
}
