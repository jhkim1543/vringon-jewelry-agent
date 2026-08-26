// ── 샘플 6종 순차 재생성 드라이버 ────────────────────────────────────
//   node scripts/rebake-all.mjs
// 프롬프트·조사 체계가 바뀌어 캐시 키가 갈렸을 때 전부 다시 굽는다.
// 순차로 도는 이유 · 여섯을 동시에 돌리면 조사 API 가 서로를 늦춘다.
import { spawnSync } from 'node:child_process'

const SAMPLES = [
  'sample_collection_horse', 'sample_collection_tide',
  'sample_fashion_necklace', 'sample_fashion_earrings',
  'sample_competitor_ring', 'sample_competitor_earrings',
]

for (const s of SAMPLES) {
  console.log(`\n══════ ${s} (${new Date().toTimeString().slice(0, 8)})`)
  const r = spawnSync('npx', ['tsx', 'scripts/make-sample.mts', `.sampleruns/${s}.cfg.json`, '--go'],
    { stdio: 'inherit', shell: true })
  if (r.status !== 0) console.log(`✗ ${s} 실패 (exit ${r.status}) · 다음으로 진행`)
}
console.log('\nREBAKE-ALL-DONE')
