/* 세트 DNA 일관성 ────────────────────────────────────────────────────
   컬렉션 에이전트의 약속은 "하나의 Design DNA 를 공유하는 세트" 다.
   그런데 세트가 950 플래티넘이라고 정해 놓아도 개별 품목이 18K 로 나갔다 —
   실측으로 컬렉션 94건 중 22건이 그랬고, 페르소나 세 사람이 각각 짚었다.

   원가·테크팩은 이 도구의 일이 아니라서 걷어냈지만, 이 검사는 디자인 이야기라 남긴다.
   판단 근거는 생성 프롬프트의 첫 두 줄이다 — 거기에 금속·마감·세팅을 명령형으로
   먼저 쓰게 해 두었으므로, 그 줄이 곧 그 디자인이 실제로 쓰는 소재다. */

/** 소재를 가리키는 말 · 아래에서 "가장 먼저 나온 것" 을 그 디자인의 몸체로 본다 */
const METAL_WORDS: Array<[RegExp, string]> = [
  [/plat|pt950|pt900|백금|플래티|플레티|팔라듐|palladium/g, 'platinum'],
  [/18k|k18|\b750\b/g, 'gold18k'],
  [/14k|k14|\b585\b/g, 'gold14k'],
  [/10k|k10|9k|k9|\b417\b|\b375\b/g, 'gold10k'],
  [/925|sterling|스털링/g, 'silver'],
  [/316|스테인|stainless|서지컬|surgical/g, 'steel'],
  [/티타늄|titanium/g, 'titanium'],
  [/brass|bronze|황동|신주|진유/g, 'brass'],
  // 규격 없이 색만 적힌 것 · 위의 어느 것도 없을 때만 쓰인다
  [/실버|silver/g, 'silver'],
  [/골드|gold|금/g, 'gold14k'],
]

/** 도금은 소재가 아니라 표면이다 · 세기 전에 지운다.
 *  안 지우면 "황동에 골드 도금" 이 금으로 읽힌다. */
const stripPlating = (s: string) => s
  .replace(/(골드|실버|로듐|로즈골드|gold|silver|rhodium)\s*(도금|코팅|plated|plating|coating|vermeil|버메일)/g, ' ')
  .replace(/(도금|plated|plating)\s*(골드|실버|gold|silver)/g, ' ')

/** 글에서 가장 먼저 나오는 소재 · 못 읽으면 빈 문자열 */
export function metalKey(text: string): string {
  const s = stripPlating(String(text ?? '').toLowerCase())
  let best: { at: number; key: string } | null = null
  for (const [rx, key] of METAL_WORDS) {
    rx.lastIndex = 0
    const m = rx.exec(s)
    if (m && (!best || m.index < best.at)) best = { at: m.index, key }
  }
  return best?.key ?? ''
}

/** 그 글에 나오는 소재를 전부 · 세트는 두 금속을 함께 쓰기도 한다
 *  ("SV925 베이스, 18K 악센트"). 첫 하나만 보면 악센트를 쓴 품목이 이탈로 잡힌다. */
export function metalKeysIn(text: string): string[] {
  const s = stripPlating(String(text ?? '').toLowerCase())
  const out = new Set<string>()
  for (const [rx, key] of METAL_WORDS) { rx.lastIndex = 0; if (rx.test(s)) out.add(key) }
  return [...out]
}

export interface DnaDrift { field: string; set: string; design: string }

/** 세트가 정한 것과 이 디자인이 어긋난 곳 · 없으면 빈 배열.
 *  prompt 는 생성 프롬프트 전문. 첫 두 줄만 보면 되지만, 줄바꿈이 없을 때를 대비해
 *  앞 240자를 본다 — 하드 제약은 거기에 있게 해 두었다. */
export function dnaDrift(
  prompt: string | undefined,
  set: { metal?: string; stones?: string } | undefined,
): DnaDrift[] {
  if (!prompt || !set) return []
  const head = String(prompt).split('\n').slice(0, 2).join(' ').slice(0, 240) || String(prompt).slice(0, 240)
  const out: DnaDrift[] = []

  const allowed = metalKeysIn(set.metal ?? '')
  const got = metalKey(head)
  if (allowed.length && got && !allowed.includes(got))
    out.push({ field: '금속', set: set.metal ?? '', design: head })

  // 무보석 규칙 · 세트가 "없음" 이라고 했는데 프롬프트가 스톤을 말하는가
  const noStone = /^(no|none)\b|없음|무보석|no gemstone|no stone/i.test((set.stones ?? '').trim())
  const saysStone = /스톤|보석|다이아|사파|루비|에메|큐빅|진주|stone|diamond|sapph|ruby|emerald|pearl|cz/i.test(head)
  const saysNone = /스톤\s*없음|무보석|no stone|no gemstone|stones?:\s*none/i.test(head)
  if (noStone && saysStone && !saysNone)
    out.push({ field: '스톤', set: set.stones ?? '', design: head })

  return out
}
