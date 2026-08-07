// ── 예시 Run · 처음 열어도 결과가 어떻게 나오는지 볼 수 있게 심어 둔다 ──
// 실제로 파이프라인을 돌려 만든 결과를 JSON으로 떠서 넣는다. API 호출은 하지 않는다.
import type { RunState } from './types'
import { listRuns, saveRun } from './store'

/** 주얼리 전용 · 심어 두는 예시 분석 */
const SAMPLE_IDS = [
  'sample_jewel_labdiamond', 'sample_jewel_hoop', 'sample_jewel_ring',
  // 검증 런에서 승격 · 진주 펜던트(전문가 설정+신호 주입 S3), 랩다이아 스터드(S5·3D 포함)
  'sample_jewel_pearlpendant', 'sample_jewel_studdiamond',
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
