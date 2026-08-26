/* 프로덕션 서버 — EB(또는 아무 Node 호스트)에서 dist/ 정적 서빙 + /api 를 한 프로세스로 낸다.
   dev 는 Vite 플러그인(openai-api.mjs)이 같은 handleApi 를 쓰므로 라우트 로직은 한 곳뿐이다.
   실행:  node server/prod.mjs   (PORT 환경변수, 기본 8080 — EB nginx 가 8080 으로 프록시한다) */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApi } from './openai-api.mjs'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const PORT = Number(process.env.PORT || 8080)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.map': 'application/json', '.txt': 'text/plain',
  '.pdf': 'application/pdf', '.glb': 'model/gltf-binary',
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x')
  // dist 밖으로 나가는 경로는 전부 index.html 로 — SPA 라우팅 겸 경로 탈출 차단
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.)+/, '')
  let file = join(DIST, rel || 'index.html')
  try {
    const s = await stat(file)
    if (s.isDirectory()) file = join(file, 'index.html')
    await stat(file)
  } catch {
    file = join(DIST, 'index.html')
  }
  const body = await readFile(file)
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
  // 해시 붙은 번들만 오래 캐시, html 은 항상 재검증
  const cache = /assets[\\/].+-[\w-]{8,}\./.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache'
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache })
  res.end(body)
}

createServer((req, res) => {
  const run = req.url?.startsWith('/api/') ? handleApi(req, res) : serveStatic(req, res)
  run.catch(err => {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: String(err?.message ?? err) }))
  })
}).listen(PORT, () => {
  console.log(`vringon-jewelry prod server :${PORT} (dist=${DIST})`)
})
