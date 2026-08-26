// ── API 주소 한 곳 ──────────────────────────────────────────────────
// 이 앱은 두 자리에서 돈다.
//   1) 자기 서버에서 그대로     → /api/… (같은 출처)
//   2) VRINGON 안의 한 화면으로  → 조사·이미지·보드는 여전히 별도 서버에 있다.
//      그 서버 주소를 빌드 때 넣어 주면 절대 주소로 부른다.
//
// VITE_AGENT_API 가 있으면 그쪽으로, 없으면 지금 있는 서버로 부른다.
// 절대 주소로 부를 때는 쿠키가 아니라 헤더(X-Host-Token)로 사용자를 밝히므로
// credentials 는 쓰지 않는다.
const BASE = ((import.meta as { env?: { VITE_AGENT_API?: string } }).env?.VITE_AGENT_API ?? '').replace(/\/$/, '')

/** '/api/…' 를 실제로 부를 주소로 */
export function apiUrl(path: string): string {
  if (!BASE) return path
  return path.startsWith('/') ? BASE + path : `${BASE}/${path}`
}

/** 조사 사진·생성 이미지처럼 서버가 주는 경로를 화면에 걸 때 */
export function assetUrl(path: string | undefined): string {
  if (!path) return ''
  if (/^(https?:|data:|blob:)/.test(path)) return path
  return apiUrl(path)
}

/** 별도 서버로 부르는가 (=VRINGON 안에서 도는가) */
export const isRemoteApi = () => !!BASE

/** 정적 배포의 base 경로 · 타입 선언에 기대지 않고 읽는다
 *  (이 코드는 VRINGON 저장소 안에서도 컴파일된다 — 거기엔 우리 vite-env.d.ts 가 없다) */
export function baseUrl(): string {
  return (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/'
}

/** 덱 iframe 의 <base> · 자산이 있는 곳을 가리켜야 안쪽 상대 경로가 산다 */
export function assetBase(): string {
  return BASE ? `${BASE}/` : `${location.origin}${baseUrl()}`
}
