/* 제작 사양·원가 측정 ────────────────────────────────────────────────
   페르소나 QA 의 지적을 고쳤다고 말하려면, 고친 것이 실제로 나오는지 재야 한다.
   프롬프트를 바꿨다고 결과가 바뀐다는 보장은 없다 — 이번 QA 에서 모델이
   뒤쪽 지시를 흘린다는 것을 실측으로 확인했다.

   재는 것 (페르소나 공통 문제 번호)
    ① 원가   · spec.weight_g 와 metal 로 원가가 계산되는가
    ③ 테크팩 · dims·findings·process 가 비어 있지 않은가
    ⑤ 일치   · 프롬프트 첫 두 줄의 금속·부속이 spec 과 같은가
    ⑥ 부속   · 잠금·백·베일이 품목에 맞게 들어갔는가
   그리고 사용자가 적은 제약(금속·중량·가격)을 지켰는가.

   실행: npx tsx scripts/spec-probe.mts            (기본 6건)
         npx tsx scripts/spec-probe.mts --n 12     (건수 지정) */
import { writeFileSync, mkdirSync } from 'node:fs'
import { estimateCost, metalKey } from '../src/core/cost'

const BASE = 'http://localhost:5188'
const N = Number(process.argv[process.argv.indexOf('--n') + 1]) || 6

const post = async (path, body) => {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(180_000),
  })
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

/* 제약을 일부러 세게 준다 · 지키는지 보려면 지키기 어려워야 한다 */
const CASES = [
  { item: '반지', en: 'ring', brief: '스털링 실버 925 로만. 금속 중량 4g 이하. 소매가 12만원대.', want: { metal: 'silver925', maxW: 4 } },
  { item: '귀걸이', en: 'pair of earrings', brief: '14K 골드. 한 짝 2g 이하. 라푸세트 백 필수.', want: { metal: 'gold14k', maxW: 2 } },
  { item: '목걸이', en: 'necklace', brief: '실버 925 에 로듐 도금. 체인 포함 8g 이하. 랍스터 클래스프.', want: { metal: 'silver925', maxW: 8 } },
  { item: '펜던트', en: 'pendant necklace', brief: '18K 옐로골드, 랩다이아 3mm 한 알. 펜던트 자체 3g 이하.', want: { metal: 'gold18k', maxW: 3 } },
  { item: '브레이슬릿', en: 'bracelet', brief: '황동에 금도금 2미크론. 15g 이하. 원가 2만원 이하.', want: { metal: 'brass', maxW: 15 } },
  { item: '반지', en: 'ring', brief: '925 실버, 큐빅 파베 세팅 20알 내외. 5g 이하.', want: { metal: 'silver925', maxW: 5 } },
]

const DNA = {
  silhouette: '가는 밴드가 한 바퀴를 돌다 끝에서 살짝 어긋난다',
  motif: '어긋난 이음매', surface: '무광 브러시드', stone: '없음',
  avoid: ['하트', '무한대 기호', '십자가'],
}

const head2 = (p) => String(p).split('\n').slice(0, 2).join(' ')

const rows = []
for (let i = 0; i < Math.min(N, CASES.length); i++) {
  const c = CASES[i]
  process.stdout.write(`[${i + 1}/${Math.min(N, CASES.length)}] ${c.item} · ${c.brief.slice(0, 28)}… `)
  try {
    const d = await post('/api/agent/prompts', {
      mode: 'competitor', refId: `probe-${i}`, variant: 'base', dna: DNA,
      trendCombo: ['무광 표면', '가는 밴드'], itemEn: c.en, itemKo: c.item,
      target: '26-29, 30-34 · Women', country: 'Korea', langName: 'Korean (한국어)',
      brief: c.brief,
    })
    const spec = d.spec
    const cost = estimateCost(spec)
    const h2 = head2(d.final_prompt)

    // ⑤ 프롬프트 첫 두 줄이 사양의 금속·부속을 실제로 담고 있는가
    const metalInHead = spec?.metal
      ? h2.replace(/\s/g, '').includes(String(spec.metal).replace(/\s/g, '').slice(0, 3))
        || metalKey(h2) === metalKey(spec.metal)
      : false
    const findingNames = (spec?.findings ?? []).map(f => f.name)
    const findingInHead = findingNames.length
      ? findingNames.some(n => h2.includes(String(n).slice(0, 2)))
      : null

    // 사용자 제약 준수
    const gotMetal = metalKey(spec?.metal ?? '')
    const wMax = Number(spec?.weight_g?.max) || 0
    rows.push({
      item: c.item, brief: c.brief,
      spec, cost: { ok: cost.ok, low: cost.low, high: cost.high, blocked: cost.blocked, quotes: cost.quotes },
      head2: h2,
      checks: {
        costOk: cost.ok,
        dims: (spec?.dims ?? []).length,
        findings: findingNames.length,
        process: (spec?.process ?? []).length,
        metalMatchesHead: metalInHead,
        findingInHead,
        metalHonored: gotMetal === c.want.metal,
        weightHonored: wMax > 0 && wMax <= c.want.maxW,
        gotMetal, wMax, wantMetal: c.want.metal, wantMaxW: c.want.maxW,
      },
    })
    console.log(cost.ok ? `원가 $${cost.low.toFixed(1)}~${cost.high.toFixed(1)}` : `원가 실패: ${cost.blocked}`)
  } catch (e) {
    rows.push({ item: c.item, brief: c.brief, error: String(e.message).slice(0, 200) })
    console.log('실패 · ' + String(e.message).slice(0, 90))
  }
}

mkdirSync('.personaqa', { recursive: true })
writeFileSync('.personaqa/spec-probe.json', JSON.stringify(rows, null, 1))

// ── 집계 ────────────────────────────────────────────────────────────
const ok = rows.filter(r => !r.error)
const pct = (f) => ok.length ? `${ok.filter(f).length}/${ok.length}` : '0/0'
console.log('\n' + '─'.repeat(62))
console.log(`측정 ${ok.length}건 (실패 ${rows.length - ok.length}건)`)
console.log(`① 원가 계산됨            ${pct(r => r.checks.costOk)}`)
console.log(`③ 치수 3개 이상          ${pct(r => r.checks.dims >= 3)}`)
console.log(`③ 공정 적힘              ${pct(r => r.checks.process >= 2)}`)
console.log(`⑥ 부속 적힘              ${pct(r => r.checks.findings >= 1)}`)
console.log(`⑤ 첫 두 줄에 금속 일치   ${pct(r => r.checks.metalMatchesHead)}`)
console.log(`⑤ 첫 두 줄에 부속 언급   ${pct(r => r.checks.findingInHead !== false)}`)
console.log(`   사용자 금속 제약 준수  ${pct(r => r.checks.metalHonored)}`)
console.log(`   사용자 중량 제약 준수  ${pct(r => r.checks.weightHonored)}`)
for (const r of ok) {
  const k = r.checks
  const bad = [
    !k.metalHonored && `금속 ${k.gotMetal || '?'}≠${k.wantMetal}`,
    !k.weightHonored && `중량 ${k.wMax}g>${k.wantMaxW}g`,
    !k.metalMatchesHead && '첫줄 금속 불일치',
    k.findings < 1 && '부속 없음',
  ].filter(Boolean)
  if (bad.length) console.log(`   ✕ ${r.item} · ${bad.join(' · ')}`)
}
console.log('\n자세한 것은 .personaqa/spec-probe.json')
