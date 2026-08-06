// ── 디자인 생성 모델 · 사용자에겐 성격으로만 보인다 ──────────────────
// 화면에는 "빠른 모델 / 디테일 모델"로만 노출하고, 어떤 회사 모델인지는 쓰지 않는다.
// 두 모델은 프롬프트를 받아들이는 방식이 달라, 같은 스펙이라도 문장을 다르게 만든다.

export type EngineId = 'fast' | 'detail'

export interface EngineSpec {
  id: EngineId
  label: string
  blurb: string
  /** 1장당 근사 단가 (USD) */
  usdPerImage: number
  /** 1장당 근사 소요 (초) */
  secPerImage: number
  /** 동시 처리 수 */
  concurrency: number
  /** 편집(멀티뷰·컬러웨이)을 지원하는가 */
  supportsEdit: boolean
}

export const ENGINES: Record<EngineId, EngineSpec> = {
  fast: {
    id: 'fast',
    label: 'Fast',
    blurb: 'For volume. Top quality, shorter wait.',
    usdPerImage: 0.045,
    secPerImage: 29,
    concurrency: 4,
    supportsEdit: true,
  },
  detail: {
    id: 'detail',
    label: 'Detailed',
    blurb: 'For the board. The most detail this can do.',
    usdPerImage: 0.190,
    secPerImage: 136,
    concurrency: 2,
    supportsEdit: true,
  },
}

/** 모델 성격에 맞춰 프롬프트를 다듬는다.
 *  빠른 모델은 짧고 명령형이 잘 먹고, 디테일 모델은 재질·마감 서술을 길게 줄수록 좋아진다. */
export function shapePrompt(engine: EngineId, base: {
  subject: string          // 무엇을 그리는가
  spec: string             // 스펙 구절
  view: string             // 시점
  brand: string            // 브랜드 구절
  mode: 'sketch' | 'render'
}): string {
  const { subject, spec, view, brand, mode } = base

  if (engine === 'fast') {
    // 짧게, 핵심 명사 위주. 긴 수식은 오히려 형태를 흐린다.
    // 스케치는 사진이 아니라 도면이어야 한다. 안 그러면 렌더와 구분이 안 된다.
    const look = mode === 'sketch'
      ? 'black and white technical line drawing, pen outline only, no color, no shading, no gradient, no photographic texture, flat white paper, hand-drawn designer sketch'
      : 'photorealistic studio product photograph, full color, real leather and rubber texture, soft light, white background'
    // 이 경로의 모델은 치수선·라벨을 스스로 그려 넣는 성향이 있다. 명시적으로 막는다.
    return [
      subject, view, spec, look, brand,
      'Absolutely no text, no numbers, no measurement lines, no dimension callouts, no arrows, no labels, no logo, no watermark, no human',
    ].filter(Boolean).join('. ')
  }

  // 디테일 모델은 문장으로 서술하고 마감·질감을 명시할수록 결과가 좋아진다.
  const look = mode === 'sketch'
    ? 'Drawn as a designer\'s technical sketch: black ink outline on white paper, single consistent line weight, no colour at all, no shading, no material texture, orthographic projection, the kind of drawing that goes on a spec sheet.'
    : 'Photorealistic studio product photography: seamless white background, soft even key light with a subtle fill, gentle contact shadow, sharp focus across the whole product, real material texture with visible grain and stitching, full colour, centered composition.'
  return [
    `A single ${subject}, shown in ${view}.`,
    spec ? `Construction: ${spec}.` : '',
    look,
    brand,
    'No text, no lettering, no watermark, no human, no props.',
  ].filter(Boolean).join(' ')
}
