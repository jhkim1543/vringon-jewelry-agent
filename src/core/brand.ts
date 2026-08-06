// ── 브랜드 아이덴티티 · 어떤 에이전트를 쓰든 결과물에 공통으로 실린다 ──
// 에이전트(트렌드·시리즈·무드보드)의 판단이 우선이지만, 로고와 브랜드 규칙은
// 그 위에 항상 덧씌워진다. 그래서 파이프라인이 아니라 별도 저장소에 둔다.

export interface BrandLogo {
  name: string
  dataUrl: string          // 브라우저에만 두고 서버로 보내지 않는다
  placement: 'none' | 'tongue' | 'heel' | 'side' | 'insole' | 'clasp' | 'pendant'
  scale: 'subtle' | 'normal' | 'bold'
}

export interface BrandIdentity {
  brandName: string
  tagline: string
  /** 브랜드를 알아보게 하는 조형 요소. 프롬프트에 그대로 실린다 */
  signatureElements: string[]
  /** 절대 하지 않는 것. 위반 시 카드에 경고가 붙는다 */
  forbidden: string[]
  colorPalette: { name: string; hex: string }[]
  materials: string[]
  toneWords: string[]
  logo: BrandLogo | null
  /** 로고를 이미지에 실제로 그릴지. 끄면 프롬프트에서 로고를 명시적으로 배제한다 */
  applyLogoToImages: boolean
}

export const EMPTY_BRAND: BrandIdentity = {
  brandName: '',
  tagline: '',
  signatureElements: [],
  forbidden: [],
  colorPalette: [],
  materials: [],
  toneWords: [],
  logo: null,
  applyLogoToImages: false,
}

const KEY = 'vringon.brand'

export function loadBrand(): BrandIdentity {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY_BRAND
    return { ...EMPTY_BRAND, ...JSON.parse(raw) }
  } catch { return EMPTY_BRAND }
}

export function saveBrand(b: BrandIdentity) {
  localStorage.setItem(KEY, JSON.stringify(b))
}

export function isBrandConfigured(b: BrandIdentity): boolean {
  return !!b.brandName.trim() &&
    (b.signatureElements.length > 0 || b.colorPalette.length > 0 || b.materials.length > 0)
}

/** 이미지 프롬프트에 덧붙이는 브랜드 구절.
 *  에이전트가 정한 스펙 뒤에 놓여, 스펙을 덮지 않으면서 브랜드 인상을 얹는다. */
export function brandPromptClause(b: BrandIdentity): string {
  const parts: string[] = []
  if (b.signatureElements.length)
    parts.push(`Brand signature details: ${b.signatureElements.join(', ')}`)
  if (b.colorPalette.length)
    parts.push(`Brand palette: ${b.colorPalette.map(c => `${c.name} ${c.hex}`).join(', ')}`)
  if (b.materials.length)
    parts.push(`Preferred materials: ${b.materials.join(', ')}`)
  if (b.toneWords.length)
    parts.push(`Overall impression: ${b.toneWords.join(', ')}`)

  // 로고는 형태를 재현할 수 없으므로 위치와 절제만 지시한다.
  // 실제 로고 삽입은 편집 단계에서 원본 파일로 합성하는 것이 정확하다.
  if (b.applyLogoToImages && b.logo && b.logo.placement !== 'none') {
    const where: Record<string, string> = {
      tongue: 'on the tongue', heel: 'on the heel counter', side: 'on the lateral side panel',
      insole: 'on the insole', clasp: 'on the clasp', pendant: 'on the pendant face',
    }
    const size = b.logo.scale === 'subtle' ? 'very small and understated'
      : b.logo.scale === 'bold' ? 'clearly visible' : 'modest'
    parts.push(`Leave a clean unbranded area ${where[b.logo.placement]} for a ${size} brand mark. Do not invent any logo, text, or lettering.`)
  } else {
    parts.push('No logo, no text, no lettering anywhere on the product.')
  }

  if (b.forbidden.length)
    parts.push(`Avoid: ${b.forbidden.join(', ')}`)

  return parts.join('. ')
}

/** 스펙이 브랜드 금지 규칙을 어겼는지 검사한다. 룰 엔진과 별개로 카드에 표시된다. */
export function checkBrandFit(b: BrandIdentity, fields: Record<string, unknown>): string[] {
  const hits: string[] = []
  const hay = Object.values(fields).map(v => String(v).toLowerCase()).join(' ')
  for (const f of b.forbidden) {
    const t = f.trim().toLowerCase()
    if (t && hay.includes(t)) hits.push(f)
  }
  return hits
}
