/* 돈 쓰는 경로의 문지기 ───────────────────────────────────────────────
   조사·이미지 생성은 호출 한 번마다 값이 나간다. 그런데 이 서버는 공개 주소에 있고,
   지금까지 `/api/runs` 만 사용자를 확인했다 — 나머지는 주소만 알면 누구나 부를 수 있었다.
   실측으로 토큰 없이 `/api/agent/specfrom` 이 응답했다.

   막는 방식은 둘을 함께 쓴다.
     1) 호스트 로그인 · VRINGON 이 준 토큰이 확인되면 통과. 정상 사용자는 이 길로 온다.
     2) 그 사람 몫의 상한 · 확인된 사용자라도 하루에 쓸 수 있는 양을 정해 둔다.
        키가 새거나 계정이 털려도 하루치에서 멈춘다.

   ALLOW_ANON=1 이면 1) 을 건너뛴다. 로그인 붙기 전의 데모·로컬 개발용이고,
   그때도 2) 는 살아 있다 — 열어 두더라도 한도 없이 열지는 않는다. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { resolveUser } from './host-auth.mjs'

/* 설정은 다른 모듈과 같은 자리에서 읽는다 · .env 를 먼저, 진짜 환경변수를 나중에.
   process.env 만 보다가 로컬 .env 의 ALLOW_ANON 이 먹히지 않아 내 측정 스크립트가
   통째로 401 을 맞았다. 서버는 EB 환경변수로 오고 로컬은 .env 로 온다 — 둘 다 봐야 한다. */
function loadEnv() {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const out = {}
  for (const f of ['.env.local', '.env']) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return out
}
const env = { ...loadEnv(), ...process.env }

/** 하루 상한 · 사람마다. 실측(경쟁사 1회 ≈ 검색 488회)을 기준으로 잡았다. */
export const DAILY = {
  searches: Number(env.CAP_SEARCHES_PER_DAY || 3000),   // 경쟁사 기준 약 6회 실행
  images: Number(env.CAP_IMAGES_PER_DAY || 200),        // 디자인 40장 실행 5회
  calls: Number(env.CAP_CALLS_PER_DAY || 1500),
}
const ANON_OK = env.ALLOW_ANON === '1'

const fileOf = (root) => {
  const d = env.SPEND_DIR || join(root, '.cache')
  mkdirSync(d, { recursive: true })
  return join(d, 'quota.json')
}
const today = () => new Date().toISOString().slice(0, 10)

function readQuota(root) {
  try {
    const q = JSON.parse(readFileSync(fileOf(root), 'utf8'))
    return q.date === today() ? q : { date: today(), users: {} }
  } catch { return { date: today(), users: {} } }
}
const writeQuota = (root, q) => { try { writeFileSync(fileOf(root), JSON.stringify(q)) } catch { /* 장부 실패가 조사를 막지 않는다 */ } }

/** 지금까지 쓴 양 · 사람 단위 */
export function used(root, id) {
  const q = readQuota(root)
  return q.users[id] ?? { searches: 0, images: 0, calls: 0 }
}

/** 쓴 만큼 적는다 */
export function spend(root, id, { searches = 0, images = 0, calls = 1 } = {}) {
  const q = readQuota(root)
  const u = q.users[id] ??= { searches: 0, images: 0, calls: 0 }
  u.searches += searches; u.images += images; u.calls += calls
  writeQuota(root, q)
}

/** 이 요청을 받아도 되는가.
 *  통과면 { ok: true, id }, 막으면 { ok: false, status, error } 를 준다.
 *  막는 이유를 그대로 적는다 — "권한 없음" 만 던지면 부른 쪽이 무엇을 고쳐야 할지 모른다. */
export async function guard(req, url, root, { images = 0 } = {}) {
  let id = ''
  try {
    const u = await resolveUser(req, url)
    if (u?.id) id = String(u.id)
  } catch { /* 확인 실패는 아래에서 익명으로 다룬다 */ }

  if (!id) {
    if (!ANON_OK) {
      return {
        ok: false, status: 401,
        error: '로그인이 필요합니다. VRINGON 에서 열면 토큰이 함께 전달됩니다.',
      }
    }
    // 익명 허용 모드에서도 한도는 건다 · 주소를 아는 모두가 한 사람 몫을 나눠 쓴다
    id = 'anon'
  }

  const u = used(root, id)
  if (u.calls >= DAILY.calls)
    return { ok: false, status: 429, error: `오늘 호출 한도(${DAILY.calls})를 다 썼습니다.`, id }
  if (u.searches >= DAILY.searches)
    return { ok: false, status: 429, error: `오늘 웹검색 한도(${DAILY.searches}회)를 다 썼습니다.`, id }
  if (images && u.images + images > DAILY.images)
    return { ok: false, status: 429, error: `오늘 이미지 생성 한도(${DAILY.images}장)를 다 썼습니다.`, id }

  return { ok: true, id }
}

/** 화면·상태에 보여 줄 남은 양 */
export function quotaStatus(root, id) {
  const u = used(root, id || 'anon')
  return {
    anonAllowed: ANON_OK,
    daily: DAILY,
    used: u,
    left: {
      searches: Math.max(0, DAILY.searches - u.searches),
      images: Math.max(0, DAILY.images - u.images),
      calls: Math.max(0, DAILY.calls - u.calls),
    },
  }
}
