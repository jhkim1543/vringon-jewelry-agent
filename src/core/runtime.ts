// ── 실행 환경 판별 ──────────────────────────────────────────────────
// 이 앱은 두 가지 방식으로 열린다.
//   1) 로컬 dev 서버 · 리서치와 이미지 생성이 실제로 돈다 (키가 Node 쪽에만 있다)
//   2) 정적 배포(GitHub Pages) · API가 없다. 저장된 샘플 Run과 보드만 볼 수 있다
// 두 번째에서 실행 버튼을 그냥 눌리게 두면 아무 일도 안 일어난 것처럼 보인다.
// 그래서 시작할 때 한 번 확인하고, 없으면 화면에 분명히 적는다.

export type Runtime =
  | { kind: 'live'; keyPresent: boolean; cachedImages: number }
  | { kind: 'static'; reason: string }

let cached: Promise<Runtime> | null = null

export function detectRuntime(): Promise<Runtime> {
  if (cached) return cached
  cached = (async (): Promise<Runtime> => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/status`, { signal: AbortSignal.timeout(4000) })
      if (!r.ok) return { kind: 'static', reason: `API returned ${r.status}` }
      const j = await r.json()
      return { kind: 'live', keyPresent: !!j.keyPresent, cachedImages: j.cachedImages ?? 0 }
    } catch {
      return { kind: 'static', reason: 'No API server on this host' }
    }
  })()
  return cached
}
