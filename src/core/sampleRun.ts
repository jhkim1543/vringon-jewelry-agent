// ── 예시 Run · 처음 열어도 결과가 어떻게 나오는지 볼 수 있게 심어 둔다 ──
// 실제로 파이프라인을 돌려 만든 결과를 JSON으로 떠서 넣는다. API 호출은 하지 않는다.
import type { RunState } from './types'
import { listRuns, saveRun } from './store'
import { apiUrl, baseUrl } from './api'

/** 주얼리 전용 · 심어 두는 예시 분석 */
// 모드마다 한 건씩. 전부 현재 파이프라인으로 실제로 돌린 결과다.
//   trend     · 풀사이클(3D 포함) · 경쟁사·베스트셀러·도시에가 근거
//   series    · 올린 후프 9장을 실제로 읽어 DNA 를 가르고, 가치 문장과 대조한다
//   moodboard · 올린 트렌드 PDF 만 근거 · 신호마다 쪽 인용이 붙는다
// 모드 계약 검사는 `node scripts/mode-audit.mjs` 가 한다. 샘플을 새로 뜨면 반드시 돌릴 것.
// 3-에이전트 개편 후 샘플 · 새 파이프라인으로 구운 것만 올린다.
// 옛 알고리즘 샘플(트렌드/시리즈/무드보드)은 새 화면이 읽지 못해 뺐다.
// 에이전트마다 두 건씩. 지역·품목·방향·타겟을 서로 멀리 벌려 구웠다 —
// 같은 에이전트라도 입력이 다르면 결과가 갈린다는 것을 보이기 위해서다.
const SAMPLE_IDS = [
  'sample_competitor_ring',
  'sample_competitor_earrings',
  'sample_fashion_necklace',
  'sample_fashion_earrings',
  'sample_collection_horse',
  'sample_collection_tide',
] as const

export async function ensureSampleRuns() {
  // 파일이 더 새로우면 덮어쓴다 · id만 보고 건너뛰면 샘플을 다시 구워도
  // 예전 방문자 화면은 옛 데이터(끊긴 사진 포함)에 머문다.
  const haveAt = new Map(listRuns().map(r => [r.id, r.savedAt]))
  for (const id of SAMPLE_IDS) {
    try {
      const mod = await import(`../samples/${id}.json`)
      // 배포 경로가 하위 폴더면(예: GitHub Pages) 절대경로 /samples/ 가 어긋난다.
      // 저장된 JSON은 그대로 두고, 읽어들일 때만 base를 붙인다.
      // VRINGON 저장소 안으로 옮겨 쓸 때는 샘플 사진 320MB 를 같이 옮기지 않는다 —
      // port-to-vringon 이 경로에 __AGENT_API__ 표식을 남기고, 여기서 조사 서버로 돌린다.
      const base = baseUrl()
      const raw = JSON.stringify(mod.default ?? mod)
        .replaceAll('"__AGENT_API__/samples/', `"${apiUrl('/samples/')}`)
        .replaceAll('"/samples/', `"${base}samples/`)
      const st = JSON.parse(raw) as RunState
      st.sample = true
      const fileAt = Date.parse(st.savedAtISO ?? '') || 0
      const knownAt = haveAt.get(id)
      // 이미 있고 파일이 더 새롭지도 않으면 그대로 둔다 (사용자 편집 보존)
      if (knownAt != null && fileAt <= knownAt) continue
      saveRun({
        id,
        savedAt: fileAt || Date.now(),
        favorite: false,
        title: st.sampleTitle ?? 'Sample run',
        thumb: firstThumb(st),
        state: st,
      })
    } catch {
      // 샘플 파일이 없으면 조용히 넘어간다. 없어도 앱은 동작해야 한다.
    }
  }
}

function firstThumb(st: RunState): string | undefined {
  for (const p of st.pairs ?? []) {
    const v = p.versions[p.versions.length - 1]
    if (v) return v.url
  }
  return undefined
}
