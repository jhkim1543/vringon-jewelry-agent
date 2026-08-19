// ── S1 샘플 데이터 · 모드·카테고리별 신호/경쟁사/디렉션/DNA (데모용) ──
import type { Category, CompetitorProduct, SeriesDna, Signal } from './types'

// 예시 신호에는 출처를 붙이지 않는다. 지어낸 주소는 근거처럼 보이지만 아무것도 가리키지 않고,
// isCollectedSignal 이 이것을 수집된 근거로 오판하게 만든다. 빈 배열이 정확한 값이다.
const SRC = (_n: number): string[] => []

export const SIGNALS: Record<Category, Signal[]> = {
  jewelry: [
    { signal_id: 'sg_101', attribute: 'bold_band', label: 'Bold band', axis: 'Form', observed_count: 8, sources: SRC(4), price_bands: ['contemporary'], confidence: 'high', direction: 'rising', first_seen: '2026-01', dedup_group: 'dg_101', oem_group: null, sales_proxy_score: 0.74, proxy_confidence: 'high' },
    { signal_id: 'sg_105', attribute: 'bezel_setting', label: 'Bezel setting', axis: 'Setting', observed_count: 6, sources: SRC(3), price_bands: ['contemporary', 'premium'], confidence: 'high', direction: 'rising', first_seen: '2025-12', dedup_group: 'dg_104', oem_group: null, sales_proxy_score: 0.66, proxy_confidence: 'medium' },
    { signal_id: 'sg_109', attribute: 'mixed_metal', label: 'Mixed metal', axis: 'Metal and colour', observed_count: 4, sources: SRC(2), price_bands: ['premium'], confidence: 'medium', direction: 'rising', first_seen: '2026-02', dedup_group: 'dg_108', oem_group: 'oem_5', sales_proxy_score: 0.58, proxy_confidence: 'medium' },
    { signal_id: 'sg_113', attribute: 'matte_finish', label: 'Matte finish', axis: 'Form', observed_count: 5, sources: SRC(3), price_bands: ['contemporary'], confidence: 'medium', direction: 'stable', first_seen: '2025-11', dedup_group: 'dg_111', oem_group: null, sales_proxy_score: 0.52, proxy_confidence: 'medium' },
    { signal_id: 'sg_118', attribute: 'layering_chain', label: 'Layering chain', axis: 'Layering', observed_count: 5, sources: SRC(2), price_bands: ['mass', 'contemporary'], confidence: 'medium', direction: 'rising', first_seen: '2026-03', dedup_group: 'dg_114', oem_group: null, sales_proxy_score: 0.49, proxy_confidence: 'low' },
    { signal_id: 'sg_121', attribute: 'organic_form', label: 'Organic form', axis: 'Form', observed_count: 3, sources: SRC(2), price_bands: ['premium'], confidence: 'low', direction: 'rising', first_seen: '2026-04', dedup_group: 'dg_117', oem_group: null, sales_proxy_score: 0.46, proxy_confidence: 'low' },
  ],
}

export const COMPETITORS: Record<Category, CompetitorProduct[]> = {
  jewelry: [
    { product_id: 'cp_j01', brand: 'Brand A', name: 'Bold band ring', price_krw: 148000, sales_proxy_score: 0.74, proxy_signals: ['restock:4', 'colorway_expansion:1'], observation_count: 8, observation_window: '2026-01-01~2026-06-30', confidence: 'high', in_band: true },
    { product_id: 'cp_j02', brand: 'Brand B', name: 'Bezel solitaire', price_krw: 220000, sales_proxy_score: 0.66, proxy_signals: ['sold_out_days:18', 'rank_entry:3'], observation_count: 5, observation_window: '2026-01-01~2026-06-30', confidence: 'medium', in_band: true },
    { product_id: 'cp_j03', brand: 'Brand C', name: 'Mixed-metal ear cuff', price_krw: 96000, sales_proxy_score: 0.58, proxy_signals: ['restock:2'], observation_count: 4, observation_window: '2026-02-01~2026-06-30', confidence: 'medium', in_band: true },
    { product_id: 'cp_j04', brand: 'Brand D', name: 'Pave chain bracelet', price_krw: 340000, sales_proxy_score: null, proxy_signals: [], observation_count: 1, observation_window: '2026-05-20, single pass', confidence: 'none', in_band: true },
  ],
}

// 방향(Direction)은 더 이상 상수가 아니다 · pipeline.ts 의 buildDirections() 가 이번 실행에서 수집한 신호로 만든다.

export const SERIES_DNA: Record<Category, SeriesDna> = {
  jewelry: {
    invariant: [
      { element: 'signature_bezel_edge', label: 'Signature bezel edge', observed_in: 7, of: 8, confidence: 'high', must_inherit: true },
      { element: 'band_width_ratio_0.18', label: 'Band width ratio 0.18', observed_in: 8, of: 8, confidence: 'high', must_inherit: true },
    ],
    variable: [
      { element: 'stone_color', label: 'Stone colour', observed_in: 8, of: 8, confidence: 'high', variation_range: ['clear', 'champagne', 'smoky'] },
      { element: 'finish', label: 'Finish', observed_in: 8, of: 8, confidence: 'medium', variation_range: ['polished', 'matte'] },
    ],
    ambiguous: [
      { element: 'prong_count', label: 'Prong count', observed_in: 4, of: 4, confidence: 'low', observed: [4, 4, 6, 4], note: 'needs a call' },
    ],
  },
}

// 시리즈 잠금은 더 이상 상수가 아니다. 판독이 스펙 필드로 짚어 낸 것만 잠근다
// (server/uploads-api.mjs 의 spec_locks). 판독이 못 짚으면 아무것도 잠그지 않는다.

export const DNA_CONFLICT: Record<Category, { brandClaim: string; observed: string }> = {
  jewelry: { brandClaim: '"minimal and restrained"', observed: '9 stones on average, pave setting in 6 of 8' },
}


