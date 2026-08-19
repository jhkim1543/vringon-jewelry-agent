// 데모 샘플 만들기 · 브라우저 없이 파이프라인을 그대로 돌린다.
//
// 왜 헤드리스인가: 브라우저 창이 화면에 없으면 크롬이 네트워크 I/O 를 정지시켜
// (ERR_NETWORK_IO_SUSPENDED) 몇 분씩 걸리는 조사 요청이 끊긴다. 실행을 두 번 날렸다.
// 파이프라인은 순수 TS 라 Node 에서 그대로 돈다. 상대 주소 fetch 만 채워 주면 된다.
//
//   npx tsx scripts/make-sample.mts <설정.json> [--go]
//
// 설정 파일은 { name, sampleTitle, params } 이고 params 는 RunParams 그대로다.
import { readFileSync, writeFileSync } from 'node:fs'
import { runPipeline } from '../src/core/pipeline.ts'
import type { PipelineEvent, RunParams, RunState, Stage } from '../src/core/types.ts'

const BASE = process.env.VRINGON_BASE ?? 'http://localhost:5191'
const cfgFile = process.argv[2]
const GO = process.argv.includes('--go')
if (!cfgFile) { console.error('설정 파일을 주세요'); process.exit(1) }

// 상대 주소를 서버로 보낸다. 이미지 생성은 몇 분씩 걸리므로 타임아웃을 크게 잡는다.
const { Agent, fetch: undiciFetch } = await import('undici')
// 헤더 대기 300초에서 끊기는 함정 · 조사는 그보다 오래 걸린다
const agent = new Agent({ headersTimeout: 50 * 60_000, bodyTimeout: 50 * 60_000, connectTimeout: 30_000 })
const realFetch = ((u: string, i: RequestInit = {}) => undiciFetch(u as never, { ...i, dispatcher: agent } as never)) as unknown as typeof fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const abs = url.startsWith('/') ? BASE + url : url
  return realFetch(abs, { signal: AbortSignal.timeout(50 * 60_000), ...init })
}) as typeof fetch

const cfg = JSON.parse(readFileSync(cfgFile, 'utf8')) as { name: string; sampleTitle: string; params: RunParams }
const STAGES: Stage[] = ['S1', 'S2', 'S3', 'S4', 'S5']

const st: RunState = {
  params: cfg.params,
  stageStatus: Object.fromEntries(STAGES.map(s => [s, 'idle'])) as RunState['stageStatus'],
  logs: [], signals: [], competitors: [], bestsellers: [], directions: [],
  seriesDna: null, dnaConflict: null, reportBias: null, trendReport: null,
  dossier: null, dossierPending: false, reportPending: false,
  designs: [], checkpoints: [], finished: false,
  sample: true, sampleTitle: cfg.sampleTitle,
}

// App.tsx 의 리듀서와 같은 규칙이다. 여기서 갈라지면 샘플이 화면과 다른 상태가 된다.
function apply(e: PipelineEvent) {
  switch (e.kind) {
    case 'log': st.logs.push({ stage: e.stage, text: e.text, t: Date.now() }); break
    case 'stage-start': st.stageStatus[e.stage] = 'running'; break
    case 'stage-done': st.stageStatus[e.stage] = 'done'; break
    case 'signals': st.signals = e.signals; break
    case 'competitors': st.competitors = e.items; break
    case 'bestsellers': st.bestsellers = e.items; break
    case 'report-art': st.reportArt = { cover: e.cover, sections: e.sections }; break
    case 'md-rationale': st.mdPickRationale = e.text; break
    case 'directions': st.directions = e.items; break
    case 'series-dna': st.seriesDna = e.dna; break
    case 'dna-conflict': st.dnaConflict = { brandClaim: e.brandClaim, observed: e.observed }; break
    case 'report-bias': st.reportBias = e.bias; break
    case 'trend-report': st.trendReport = e.report; st.reportPending = false; break
    case 'report-pending': st.reportPending = e.on; break
    case 'dossier': st.dossier = e.dossier; st.dossierPending = false; break
    case 'dossier-pending': st.dossierPending = e.on; break
    case 'design': st.designs.push(e.design); break
    case 'design-update':
      st.designs = st.designs.map(d => d.spec.design_id === e.design.spec.design_id ? e.design : d); break
    case 'checkpoint': st.checkpoints.push(e.label); break
    case 'done': st.finished = true; break
  }
}

const t0 = Date.now()
const el = () => `${String(Math.floor((Date.now() - t0) / 60000)).padStart(2, '0')}:${String(Math.floor((Date.now() - t0) / 1000) % 60).padStart(2, '0')}`

await new Promise<void>(resolve => {
  const handle = runPipeline(cfg.params, e => {
    apply(e)
    if (e.kind === 'log') console.log(`  ${el()} [${e.stage}] ${e.text}`)
    if (e.kind === 'stage-start') console.log(`══ ${el()} ${e.stage} 시작`)
    if (e.kind === 'gate') {
      // DNA 충돌 게이트는 선택을 넘겨야 풀린다 · 샘플은 판독한 대로(아카이브) 간다.
      // resume 만 부르면 handle 은 기다리지 않는데 이벤트가 안 오는 게 아니라
      // 게이트가 안 풀려서 프로세스가 미해결 await 로 끝난다(exit 13).
      if (e.reason === 'dna') { console.log('  DNA 충돌 게이트 · 아카이브 기준으로 진행'); handle.resolveDna('archive') }
      else console.log('  승인 게이트 · 자동 통과')
      handle.resume()
    }
    if (e.kind === 'done') resolve()
  })
})

st.savedAtISO = new Date().toISOString()
const designs = st.designs.length
const rejected = st.designs.filter(d => d.rejected).length
const withRecipe = st.designs.filter(d => d.recipe).length
const withMd = st.designs.filter(d => d.mdReview).length
const withRefs = st.designs.filter(d => d.rationale?.reference_images?.length).length
const qa = st.designs.flatMap(d => d.qa ?? [])
console.log('─'.repeat(58))
console.log(`완료 ${el()} · designs=${designs} (reject ${rejected}) · recipe=${withRecipe} · MD=${withMd} · refs=${withRefs}`)
console.log(`QA pass=${qa.filter(q => q.status === 'pass').length} fail=${qa.filter(q => q.status === 'fail').length} unknown=${qa.filter(q => q.status === 'unknown').length}`)
console.log(`images=${st.designs.reduce((n, d) => n + d.images.length, 0)} · 3D=${st.designs.filter(d => d.model).length}`)

writeFileSync(`${cfg.name}.state.json`, JSON.stringify(st, null, 1))
console.log(`상태를 ${cfg.name}.state.json 에 남겼습니다.`)

if (!GO) { console.log('미리보기입니다. 저장하려면 --go 를 붙이세요.'); process.exit(0) }
const r = await realFetch(`${BASE}/api/dev/save-sample`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: cfg.name, state: st }),
})
const j = await r.json()
console.log(j.error ? `저장 실패 · ${j.error}` : `저장 완료 · ${j.file} (이미지 ${j.images}, 복사 ${j.copied})`)
