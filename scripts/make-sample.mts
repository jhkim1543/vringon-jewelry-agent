// ── 데모 샘플 생성 · 브라우저 없이 3-에이전트 파이프라인을 그대로 돌린다 ──
//
//   npx tsx scripts/make-sample.mts .sampleruns/<이름>.cfg.json --go
//
// 설정 파일: { "name": "sample_competitor_ring", "sampleTitle": "...", "params": RunParams }
//
// 서버(5191)가 떠 있어야 한다. **브라우저 패널에 묶인 서버는 패널이 숨겨지면 죽는다** —
// 반드시 별도 프로세스(cmd /c "npx vite --port 5191 --strictPort")로 띄울 것.
//
// 끝나면:
//  1) /api/dev/save-sample 로 생성 이미지를 public/samples/ 에 굳히고 URL 을 /samples/ 로 바꾼다
//  2) 레퍼런스·크롤 사진(원격)은 /api/shot 프록시로 내려받아 shot 필드에 로컬 사본을 단다
//     — 정적 배포(Pages)에서는 프록시가 없어서, 이걸 안 하면 사진이 전부 빈 칸이 된다
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { Agent, fetch as undiciFetch } from 'undici'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'http://localhost:5191'

// 헤더 대기 300초 함정 · 조사 호출은 그보다 오래 걸린다
const agent = new Agent({ headersTimeout: 50 * 60_000, bodyTimeout: 50 * 60_000, connectTimeout: 30_000 })
const realFetch = ((u: string, i: RequestInit = {}) =>
  undiciFetch(u as never, { ...i, dispatcher: agent } as never)) as unknown as typeof fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const abs = url.startsWith('/') ? BASE + url : url
  return realFetch(abs, init)
}) as typeof fetch

const cfgPath = process.argv[2]
const go = process.argv.includes('--go')
if (!cfgPath || !go) {
  console.log('쓰는 법: npx tsx scripts/make-sample.mts .sampleruns/<이름>.cfg.json --go')
  process.exit(2)
}
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))

// 서버 확인 · 죽은 서버로 돌리면 전부 실패 폴백이 된다 (예전에 실제로 그랬다)
const ping = await realFetch(`${BASE}/api/status`).catch(() => null)
if (!ping || !ping.ok) {
  console.error('서버(5191)가 응답하지 않습니다. cmd /c "npx vite --port 5191 --strictPort" 로 먼저 띄우세요.')
  process.exit(1)
}

const { runPipeline } = await import('../src/core/pipeline')
const { freshState } = await import('../src/core/types')
import type { PipelineEvent, RunState } from '../src/core/types'

const st: RunState = freshState(cfg.params)
const t0 = Date.now()
const el = () => `${String(Math.floor((Date.now() - t0) / 60000)).padStart(2, '0')}:${String(Math.floor((Date.now() - t0) / 1000) % 60).padStart(2, '0')}`

function apply(e: PipelineEvent) {
  switch (e.kind) {
    case 'log': st.logs.push({ stage: e.stage, text: e.text, t: Date.now() }); break
    case 'stage-start': st.stageStatus[e.stage] = 'running'; break
    case 'stage-done': st.stageStatus[e.stage] = 'done'; break
    case 'crawl': st.crawl = e.crawl; break
    case 'shops': st.shops = e.shops; break
    case 'runway': st.runway = e.runway; break
    case 'adoption': st.adoption = e.signals; break
    case 'trend-report': st.trendReport = e.report; break
    case 'forecast': st.forecast = e.forecast; break
    case 'insight': st.insight = e.insight; break
    case 'sets': st.sets = e.sets; break
    case 'set-art': st.sets = (st.sets ?? []).map(s => s.name === e.setName ? { ...s, art: e.art, lineup: e.lineup } : s); break
    case 'references': st.references = e.references; break
    case 'pair': st.pairs = [...st.pairs.filter(x => x.id !== e.pair.id), e.pair]; break
    case 'pair-update': st.pairs = st.pairs.map(x => x.id === e.pair.id ? e.pair : x); break
    case 'searches': st.searches += e.n; break
    case 'failed': st.failedNote = e.note; break
    case 'done': st.finished = true; break
  }
}

await new Promise<void>(resolve => {
  runPipeline(cfg.params, e => {
    apply(e)
    if (e.kind === 'log') console.log(`  ${el()} [${e.stage}] ${e.text}`)
    if (e.kind === 'stage-start') console.log(`══ ${el()} ${e.stage} 시작`)
    if (e.kind === 'done') resolve()
  })
})

// ── 원격 사진 굳히기 · 레퍼런스와 덱에 실릴 크롤 사진 ────────────────
const outDir = join(ROOT, 'public', 'samples')
mkdirSync(outDir, { recursive: true })
let baked = 0
// 직링크가 없으면 상품 페이지의 og:image 로 폴백한다 · 조사 모델은 직링크를 좀처럼 주지 않는다
async function bake(remote?: string, page?: string): Promise<string | undefined> {
  const okRemote = !!remote && /^https?:\/\//.test(remote)
  const okPage = !!page && /^https:\/\//.test(page)
  if (!okRemote && !okPage) return undefined
  const h = createHash('sha256').update(`${remote ?? ''}|${page ?? ''}`).digest('hex').slice(0, 20)
  const file = join(outDir, `shot_${h}.jpg`)
  const rel = `/samples/shot_${h}.jpg`
  if (existsSync(file)) return rel
  try {
    const q = [okRemote ? `u=${encodeURIComponent(remote!)}` : '', okPage ? `p=${encodeURIComponent(page!)}` : '']
      .filter(Boolean).join('&')
    const r = await realFetch(`${BASE}/api/shot?${q}`)
    if (!r.ok) return undefined
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 2000) return undefined
    writeFileSync(file, buf)
    baked++
    return rel
  } catch { return undefined }
}

for (const ref of st.references) ref.shot = await bake(ref.imageUrl, ref.sourceUrl)
for (const c of st.crawl ?? []) for (const it of c.items) it.shot = await bake(it.imageUrl, it.productUrl)
for (const s of st.shops ?? []) for (const it of s.items) it.shot = await bake(it.imageUrl, it.productUrl)
for (const l of st.runway?.looks ?? []) l.shot = await bake(l.image_url, l.source_url)
console.log(`원격 사진 ${baked}장 굳힘`)

// ── 저장 · 서버가 생성 이미지를 복사하고 URL 을 /samples/ 로 바꾼다 ──
st.sample = true
st.sampleTitle = cfg.sampleTitle
st.savedAtISO = new Date().toISOString()
const save = await realFetch(`${BASE}/api/dev/save-sample`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: cfg.name, state: st }),
})
const sj = await save.json() as { ok?: boolean; file?: string; copied?: number; error?: string }
if (!sj.ok) { console.error('저장 실패:', sj.error); process.exit(1) }
console.log(`저장 완료 · ${sj.file} (복사 ${sj.copied})`)
console.log(`디자인 ${st.pairs.filter(p => p.versions.length).length}/${st.pairs.length} · 검색 ${st.searches}회`)
