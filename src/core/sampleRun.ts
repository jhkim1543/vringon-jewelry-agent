// ── 예시 Run · 처음 열어도 결과가 어떻게 나오는지 볼 수 있게 심어 둔다 ──
// 실제로 파이프라인을 돌려 만든 결과를 JSON으로 떠서 넣는다. API 호출은 하지 않는다.
import type { RunState } from './types'
import { listRuns, saveRun } from './store'

/** 주얼리 전용 · 심어 두는 예시 분석 */
// 모드마다 한 건씩. 전부 현재 파이프라인으로 실제로 돌린 결과다.
//   trend     · 풀사이클(3D 포함) · 경쟁사·베스트셀러·도시에가 근거
//   series    · 올린 후프 9장을 실제로 읽어 DNA 를 가르고, 가치 문장과 대조한다
//   moodboard · 올린 트렌드 PDF 만 근거 · 신호마다 쪽 인용이 붙는다
// 모드 계약 검사는 `node scripts/mode-audit.mjs` 가 한다. 샘플을 새로 뜨면 반드시 돌릴 것.
const SAMPLE_IDS = [
  'sample_trend_vermeilhoop',
  'sample_series_silverhoop',
  'sample_moodboard_hoop',
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
      const base = import.meta.env.BASE_URL || '/'
      const raw = JSON.stringify(mod.default ?? mod).replaceAll('"/samples/', `"${base}samples/`)
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
  for (const d of st.designs) {
    const im = d.images.find(i => i.view !== 'sketch') ?? d.images[0]
    if (im) return im.url
  }
  return undefined
}
