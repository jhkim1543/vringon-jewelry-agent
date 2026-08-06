// ── 보드 공유 · 링크로 같은 보드를 연다 ─────────────────────────────
// 솔직하게 적어 둔다. 지금 저장소는 브라우저의 localStorage 하나뿐이다.
// 그래서 링크는 "이 기기에서 저 분석의 보드를 연다"까지는 확실히 되지만,
// 다른 사람의 브라우저에는 그 분석이 없으므로 그대로는 열리지 않는다.
//
//  · 같은 기기·같은 브라우저  → 링크만으로 열린다
//  · 다른 기기 / 다른 사람    → 분석 파일을 함께 보내야 한다 (내보내기 사용)
//  · 동시에 같은 화면을 보기  → 서버가 있어야 한다 (아래 주석 참고)
//
// 실시간 공동 열람은 상태를 중계할 서버가 필요하다. 정적 배포에는 그 서버가
// 없으므로 여기서는 흉내내지 않는다. 붙일 자리는 openLiveSession 이다.

export interface ShareTarget { runId: string; view: 'board' | 'run' }

const P_RUN = 'run'
const P_VIEW = 'view'

/** 지금 주소에서 공유 대상 읽기 */
export function readShareTarget(): ShareTarget | null {
  try {
    const q = new URLSearchParams(location.search)
    const runId = q.get(P_RUN)
    if (!runId) return null
    const view = q.get(P_VIEW) === 'run' ? 'run' : 'board'
    return { runId, view }
  } catch { return null }
}

/** 공유 링크 만들기 · base 경로를 유지해야 Pages 배포에서도 열린다 */
export function shareLink(runId: string, view: ShareTarget['view'] = 'board'): string {
  const base = import.meta.env.BASE_URL || '/'
  const url = new URL(base, location.origin)
  url.searchParams.set(P_RUN, runId)
  url.searchParams.set(P_VIEW, view)
  return url.toString()
}

/** 주소창만 바꾼다. 새로고침해도 같은 보드가 열리도록. */
export function pushShareTarget(runId: string, view: ShareTarget['view']) {
  try {
    const url = new URL(location.href)
    url.searchParams.set(P_RUN, runId)
    url.searchParams.set(P_VIEW, view)
    history.replaceState(null, '', url.toString())
  } catch { /* 주소를 못 바꿔도 화면은 계속 돈다 */ }
}

export function clearShareTarget() {
  try {
    const url = new URL(location.href)
    url.searchParams.delete(P_RUN)
    url.searchParams.delete(P_VIEW)
    history.replaceState(null, '', url.toString())
  } catch { /* 무시 */ }
}

/** 클립보드 복사 · 권한이 막힌 환경에서는 예전 방식으로 떨어진다 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch { return false }
  }
}
