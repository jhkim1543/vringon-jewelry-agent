// ── 계정별 분석 내역 저장소 ─────────────────────────────────────────
// 지금까지 내역은 브라우저 localStorage 하나뿐이라, 같은 PC 면 누가 로그인하든
// 같은 목록이 보였다. 여기서는 호스트(VRINGON)가 알려 준 사용자별로 갈라 둔다.
//
// 저장 구조:  .cache/runs/<userKey>/<runId>.json   +  <userKey>/index.json
//   userKey  = 사용자 식별자의 해시 (이메일·id 를 파일명으로 쓰지 않는다)
//   index    = 목록 화면이 쓰는 가벼운 요약 (제목·썸네일·시각)
//   본문     = 실행 상태 전체 (분석 결과 화면이 쓰는 것)
//
// 사용자 확인은 host-auth 가 한다. 확인이 안 되면 저장하지 않고 401 을 준다 —
// 익명으로 남기면 다시 "모두의 목록" 이 되기 때문이다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveUser } from './host-auth.mjs'

// 저장 위치 · RUNS_DIR 가 있으면 그쪽에 남긴다.
// EB 는 배포할 때마다 앱 폴더(/var/app/current)를 통째로 갈아치우므로, 그 안에 두면
// 재배포 한 번에 모두의 분석 내역이 사라진다. 앱 폴더 밖을 가리키게 하는 것이 요점이다.
const BASE_DIR = process.env.RUNS_DIR || ''
const keyOf = (userId) => createHash('sha256').update(String(userId)).digest('hex').slice(0, 24)
const dirOf = (root, userId) => {
  const d = BASE_DIR
    ? join(BASE_DIR, keyOf(userId))
    : join(root, '.cache', 'runs', keyOf(userId))
  mkdirSync(d, { recursive: true })
  return d
}
const safeId = (id) => String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)

function readIndex(dir) {
  const f = join(dir, 'index.json')
  if (!existsSync(f)) return []
  try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return [] }
}
function writeIndex(dir, rows) {
  writeFileSync(join(dir, 'index.json'), JSON.stringify(rows))
}

async function readBody(req, limit = 3e7) {
  const chunks = []
  let n = 0
  for await (const c of req) {
    n += c.length
    if (n > limit) throw new Error('본문이 너무 큽니다')
    chunks.push(c)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}
const json = (res, code, obj) => {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(obj))
}

/** /api/runs/* · 처리했으면 true */
export async function handleRuns(req, res, url, ROOT) {
  const path = url.pathname
  if (!path.startsWith('/api/runs')) return false

  const user = await resolveUser(req, url)
  if (!user) {
    // 로그인 없이 열린 경우 · 클라이언트는 이 응답을 보고 localStorage 로 되돌아간다
    json(res, 401, { error: 'no user', anonymous: true })
    return true
  }
  const dir = dirOf(ROOT, user.id)

  // 목록 · 요약만 준다 (본문까지 주면 수십 MB 가 된다)
  if (path === '/api/runs' && req.method === 'GET') {
    json(res, 200, { user: { id: user.id, name: user.name }, runs: readIndex(dir) })
    return true
  }

  // 하나 읽기
  if (path.startsWith('/api/runs/') && req.method === 'GET') {
    const id = safeId(path.slice('/api/runs/'.length))
    const f = join(dir, `${id}.json`)
    if (!id || !existsSync(f)) { json(res, 404, { error: 'not found' }); return true }
    json(res, 200, JSON.parse(readFileSync(f, 'utf8')))
    return true
  }

  // 저장(덮어쓰기) · 목록 요약도 같이 갱신한다
  if (path === '/api/runs' && req.method === 'POST') {
    const body = await readBody(req)
    const id = safeId(body.id)
    if (!id || !body.state) { json(res, 400, { error: 'id/state 없음' }); return true }
    const rec = {
      id, savedAt: body.savedAt ?? Date.now(),
      title: String(body.title ?? '').slice(0, 200), thumb: body.thumb ?? null, state: body.state,
    }
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(rec))
    const rows = readIndex(dir).filter(r => r.id !== id)
    rows.unshift({ id, savedAt: rec.savedAt, title: rec.title, thumb: rec.thumb })
    writeIndex(dir, rows)
    json(res, 200, { ok: true, id })
    return true
  }


  // 지우기
  if (path.startsWith('/api/runs/') && req.method === 'DELETE') {
    const id = safeId(path.slice('/api/runs/'.length))
    rmSync(join(dir, `${id}.json`), { force: true })
    writeIndex(dir, readIndex(dir).filter(r => r.id !== id))
    json(res, 200, { ok: true })
    return true
  }

  json(res, 404, { error: 'not found' })
  return true
}

/** 운영 점검용 · 사용자 수와 각자의 분석 수 (내용은 보지 않는다) */
export function runsStats(ROOT) {
  const base = BASE_DIR || join(ROOT, '.cache', 'runs')
  if (!existsSync(base)) return { users: 0, runs: 0 }
  const users = readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory())
  let runs = 0
  for (const u of users) runs += readIndex(join(base, u.name)).length
  return { users: users.length, runs }
}
