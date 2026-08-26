// ── 품평 보드 협업 서버 ──────────────────────────────────────────────
// Miro 식 보드의 뒷단이다. 링크를 가진 사람은 누구든 같은 보드에 들어와
// 카드를 옮기고, 메모·텍스트·이미지·핀(댓글)을 붙이고, 서로의 커서를 본다.
//
// 구조
//  · 문서: .cache/boards/<id>.json — { rev, snodes, unodes, pos, updatedAt }
//    snodes = 실행 결과 카드(주인이 열 때 밀어 넣는다 · 방문자는 이걸로 그린다)
//    unodes = 사람이 붙인 것 (note/text/image/pin·댓글 스레드 포함)
//    pos    = 노드 위치 덮어쓰기 (결과 카드 포함 · 옮긴 자리가 남는다)
//  · 실시간: SSE 한 줄 (/api/board/events) 로 op 와 커서를 중계한다.
//    커서는 저장하지 않는다 — 지나가는 것이다.
//  · 충돌: 노드 단위 마지막 쓰기 승리. 품평 보드 규모(수십 노드)에는 이걸로 충분하고,
//    CRDT 는 이 규모에서 비용만 크다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const docs = new Map()            // id → doc (메모리 사본)
const subs = new Map()            // id → Set<res> (SSE 구독자)

const dirOf = (root) => {
  const d = join(root, '.cache', 'boards')
  mkdirSync(d, { recursive: true })
  return d
}
const fileOf = (root, id) => join(dirOf(root), `${id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)

function loadDoc(root, id) {
  if (docs.has(id)) return docs.get(id)
  const f = fileOf(root, id)
  const doc = existsSync(f)
    ? JSON.parse(readFileSync(f, 'utf8'))
    : { rev: 0, snodes: {}, unodes: {}, pos: {}, updatedAt: 0 }
  docs.set(id, doc)
  return doc
}
function saveDoc(root, id, doc) {
  doc.updatedAt = Date.now()
  writeFileSync(fileOf(root, id), JSON.stringify(doc))
}

function broadcast(id, payload, exceptRes = null) {
  const set = subs.get(id)
  if (!set) return
  const line = `data: ${JSON.stringify(payload)}\n\n`
  for (const res of set) {
    if (res === exceptRes) continue
    try { res.write(line) } catch { set.delete(res) }
  }
}

function applyOps(doc, ops) {
  for (const op of ops) {
    if (op.t === 'snode' && op.node?.id) doc.snodes[op.node.id] = op.node
    else if (op.t === 'unode' && op.node?.id) doc.unodes[op.node.id] = op.node
    else if (op.t === 'udel' && op.id) delete doc.unodes[op.id]
    else if (op.t === 'pos' && op.id && op.xy) doc.pos[op.id] = op.xy
  }
  doc.rev++
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}
const json = (res, code, obj) => {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(obj))
}

/** /api/board/* 전부 · 처리했으면 true */
export async function handleBoard(req, res, url, ROOT) {
  const path = url.pathname

  // 문서 읽기 · 방문자의 첫 진입
  if (path === '/api/board/doc' && req.method === 'GET') {
    const id = url.searchParams.get('id')
    if (!id) return json(res, 400, { error: 'id 없음' })
    const doc = loadDoc(ROOT, id)
    return json(res, 200, { doc })
  }

  // 편집 op · 적용하고 다른 구독자에게 중계
  if (path === '/api/board/op' && req.method === 'POST') {
    const { id, clientId, ops } = await readBody(req)
    if (!id || !Array.isArray(ops)) return json(res, 400, { error: 'id/ops 없음' })
    const doc = loadDoc(ROOT, id)
    applyOps(doc, ops)
    saveDoc(ROOT, id, doc)
    broadcast(id, { type: 'ops', clientId, ops, rev: doc.rev })
    return json(res, 200, { ok: true, rev: doc.rev })
  }

  // 커서 · 저장 없이 중계만
  if (path === '/api/board/cursor' && req.method === 'POST') {
    const { id, clientId, name, color, x, y, gone } = await readBody(req)
    if (!id || !clientId) return json(res, 400, { error: 'id/clientId 없음' })
    broadcast(id, { type: 'cursor', clientId, name, color, x, y, gone: !!gone })
    return json(res, 200, { ok: true })
  }

  // 실시간 구독 (SSE)
  if (path === '/api/board/events' && req.method === 'GET') {
    const id = url.searchParams.get('id')
    if (!id) return json(res, 400, { error: 'id 없음' })
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.write(': hello\n\n')
    if (!subs.has(id)) subs.set(id, new Set())
    subs.get(id).add(res)
    const ping = setInterval(() => { try { res.write(': ping\n\n') } catch { /* 끊김 */ } }, 25_000)
    req.on('close', () => { clearInterval(ping); subs.get(id)?.delete(res) })
    return true
  }

  // 이미지 올리기 · dataURL 을 받아 파일로 굳히고 주소를 준다
  if (path === '/api/board/image' && req.method === 'POST') {
    const { id, dataUrl } = await readBody(req)
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/.exec(dataUrl ?? '')
    if (!id || !m) return json(res, 400, { error: '이미지 형식이 아님' })
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length > 6_000_000) return json(res, 400, { error: '6MB 를 넘습니다' })
    const ext = m[1].split('/')[1].replace('jpeg', 'jpg')
    const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 20)}.${ext}`
    const dir = join(dirOf(ROOT), 'assets')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, name), buf)
    return json(res, 200, { url: `/api/board/asset/${name}` })
  }

  // 이미지 서빙
  if (path.startsWith('/api/board/asset/') && req.method === 'GET') {
    const name = path.slice('/api/board/asset/'.length).replace(/[^a-zA-Z0-9._-]/g, '')
    const f = join(dirOf(ROOT), 'assets', name)
    if (!existsSync(f)) { res.statusCode = 404; return res.end('없음') }
    const ext = name.split('.').pop()
    res.setHeader('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.end(readFileSync(f))
  }

  return false
}
