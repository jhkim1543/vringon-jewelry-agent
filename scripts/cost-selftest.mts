/* 원가 엔진 자체 검사 · API 를 부르지 않는다.
   목표 가격 표기는 사람이 자유롭게 쓰는 칸이라, 읽기 규칙이 조용히 틀리면
   "목표 안에 듭니다" 가 거짓말이 된다. 여기서 표기별로 못을 박아 둔다.
   실행: npx tsx scripts/cost-selftest.mts */
import {
  checkTarget, currencyCode, dimText, estimateCost, marketBand, metalKey, parsePriceTarget, stoneText,
  type MakeSpec,
} from '../src/core/cost'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { fail++; console.log(`✕ ${name}\n   나온 것: ${JSON.stringify(got)}\n   맞는 것: ${JSON.stringify(want)}`) }
  else console.log(`✓ ${name}`)
}
const band = (t: string) => {
  const r = parsePriceTarget(t)
  return r ? [Math.round(r.lo), r.hi === Infinity ? 'inf' : Math.round(r.hi)] : null
}

console.log('── 목표 가격 읽기 ──')
eq('12만원대',      band('12만원대'), [89, 96])
eq('30만원 이하',   band('30만원 이하'), [0, 222])
eq('$50-80',        band('$50-80'), [50, 80])
eq('15만~25만원',   band('15만~25만원'), [111, 185])
eq('120000원',      band('120000원'), [80, 98])
eq('50유로 이상',   band('50유로 이상'), [54, 'inf'])
eq('빈 값은 null',  band(''), null)

console.log('\n── 금속 읽기 ──')
// 실측으로 걸린 것들 · 백금·도금은 '금' 을 품고 있어서 순서를 잘못 두면 금값으로 계산된다.
// 데모 샘플 backfill 에서 "백금·팔라듐 톤" 이 14K 금(g당 $64)으로 계산되고 있었다.
eq('백금은 플래티넘', metalKey('백금·팔라듐 톤 냉색 중립'), 'platinum950')
eq('팔라듐도 플래티넘', metalKey('palladium silver'), 'platinum950')
eq('골드 도금 황동은 황동', metalKey('황동에 24K 골드 도금 2μm'), 'brass')
eq('도금만 적히면 소재 불명', metalKey('골드 도금'), '')
eq('925 는 실버', metalKey('925 sterling silver'), 'silver925')
eq('실버라는 말도 실버', metalKey('실버, 로듐 마감'), 'silver925')
eq('18K 는 18K', metalKey('18K 화이트 골드'), 'gold18k')
eq('캐럿 없는 골드는 14K 로', metalKey('옐로 골드'), 'gold14k')
eq('스테인리스는 스틸', metalKey('재활용 스테인리스 스틸 316L'), 'steel316')
eq('서지컬 스틸도 스틸', metalKey('surgical steel'), 'steel316')
eq('티타늄은 티타늄', metalKey('티타늄 0.9mm 포스트'), 'titanium')
eq('먼저 나온 소재가 몸체 · 316L 이 앞',
  metalKey('316L stainless steel 중심 실버 톤'), 'steel316')
eq('먼저 나온 소재가 몸체 · 925 가 앞',
  metalKey('메인 925 실버, 포인트 14K yellow gold 약 10~15%'), 'silver925')
eq('섞여도 앞이 몸체', metalKey('316L 스테인리스 스틸, 리사이클 실버, 티타늄'), 'steel316')
eq('규격 없이 색만 적히면 그 색으로', metalKey('새틴 실버 본체와 옐로 골드 악센트 혼용'), 'silver925')
eq('기재 없음은 빈 값', metalKey('기재 없음'), '')
eq('못 읽으면 빈 값', metalKey('알 수 없는 소재'), '')

console.log('\n── 원가 계산 ──')
const ring: MakeSpec = {
  dims: [{ name: '밴드 폭', mm: '2.0~2.2' }],
  metal: '925 sterling silver', plating: '',
  stones: [], findings: [{ name: '클래스프', spec: '없음(반지)' }],
  weight_g: { min: 3, max: 4 }, process: ['주조'], note: '',
}
const c = estimateCost(ring)
// 금속 3~4g × 1.25 × 1.1 = 4.125~5.5 · 주조 9~11.7 · 연마 5~6.5
eq('해당 없는 부속은 값을 안 매긴다', c.lines.some(l => /부속|조립/.test(l.label)), false)
eq('원가 하한', Math.round(c.low * 10) / 10, 18.1)
eq('중량이 없으면 계산하지 않는다',
  estimateCost({ ...ring, weight_g: { min: 0, max: 0 } }).ok, false)
eq('금속을 못 읽으면 계산하지 않는다',
  estimateCost({ ...ring, metal: '알 수 없는 소재' }).ok, false)
eq('천연석은 견적으로 넘긴다',
  estimateCost({ ...ring, stones: [{ type: '천연 다이아몬드', cut: '라운드', mm: '3mm', count: 1 }] }).quotes.length, 1)

console.log('\n── 표가 스스로 앞뒤가 맞는가 ──')
// 공방 오너와 컨설턴트가 같은 것을 잡았다: "금속 $722 인데 합계 $557~922".
// 줄에 중간값을 적고 합계만 범위로 내면 이런 표가 나온다 — 그러면 표 전체를 못 믿는다.
{
  const sumLo = c.lines.reduce((a, l) => a + l.lo, 0)
  const sumHi = c.lines.reduce((a, l) => a + l.hi, 0)
  eq('줄의 합 = 전체 하한', Math.round(sumLo * 100) / 100, Math.round(c.low * 100) / 100)
  eq('줄의 합 = 전체 상한', Math.round(sumHi * 100) / 100, Math.round(c.high * 100) / 100)
  eq('어떤 줄도 전체 하한을 넘지 않는다', c.lines.every(l => l.lo <= c.low + 1e-9), true)
}

console.log('\n── 현장 지적으로 넣은 것 ──')
{
  const withStone = estimateCost({ ...ring, stones: [{ type: '랩 다이아몬드', cut: '라운드', mm: '1.1mm', count: 6 }] })
  const line = withStone.lines.find(l => l.label.startsWith('스톤 ·'))
  eq('작은 알에 최저 단가가 적용된다', !!line && line.lo / 6 >= 4, true)

  const flush = estimateCost({ ...ring, stones: [{ type: 'CZ', cut: '플러시', mm: '2mm', count: 4 }] })
  eq('플러시도 프롱보다 비싸게', !!flush.lines.find(l => l.how.includes('베젤·파베·채널')), true)

  const finish = estimateCost({ ...ring, plating: '고운 무광 새틴 마감' })
  eq('표면 마감은 도금 공임이 아니다', finish.lines.some(l => l.label === '도금'), false)

  const real = estimateCost({ ...ring, plating: '로듐 도금 0.15μm' })
  eq('진짜 도금에는 매긴다', real.lines.some(l => l.label === '도금'), true)

  // "랩 그로운 사파이어" 가 천연으로 잡혀 견적으로 넘어가고 있었다 (인쇄본 실측에서 발견)
  const grown = estimateCost({ ...ring, stones: [{ type: '랩 그로운 사파이어 블루', cut: '라운드', mm: '1.1mm', count: 14 }] })
  eq('랩 그로운은 합성석으로 값이 매겨진다', grown.quotes.length, 0)
  eq('랩 그로운에 원가 줄이 선다', grown.lines.some(l => l.label.startsWith('스톤 ·')), true)

  const many = estimateCost({ ...ring, stones: [
    { type: '천연 사파이어 블루', cut: '라운드', mm: '1.1mm', count: 14 },
    { type: '천연 사파이어 핑크', cut: '라운드', mm: '1.1mm', count: 14 },
    { type: '천연 사파이어 아쿠아', cut: '라운드', mm: '1.1mm', count: 14 },
  ] })
  eq('천연석 견적은 한 줄로 묶인다', many.quotes.length, 1)

  const enamel = estimateCost({
    ...ring, stones: [{ type: 'CZ', cut: '베젤', mm: '2mm', count: 2 }], process: ['에나멜 소성'],
  })
  eq('에나멜은 견적으로 넘긴다', enamel.quotes.some(q => q.includes('에나멜')), true)
}

console.log('\n── 표기 ──')
// 덱 실측에서 "1.2 이상 mm" 와 "청록 사파이어 ·  · 2.3 · 1" 이 그대로 인쇄됐다
eq('숫자로 끝나면 mm 를 붙인다', dimText('2.0~2.2'), '2.0~2.2 mm')
eq('말로 끝나면 붙이지 않는다', dimText('1.2 이상'), '1.2 이상')
eq('이미 단위가 있으면 그대로', dimText('16.5 mm'), '16.5 mm')
eq('빈 값은 빈 값', dimText(''), '')
eq('빈 칸은 구분자까지 지운다',
  stoneText({ type: '청록 사파이어', cut: '', mm: '2.3', count: 1 }), '청록 사파이어 · 2.3 mm · 1')
eq('다 있으면 다 붙인다',
  stoneText({ type: 'CZ', cut: '라운드', mm: '1.2mm', count: 20 }), 'CZ · 라운드 · 1.2mm · 20')

console.log('\n── 통화 읽기 ──')
// 조사 모델은 통화 칸에 코드만 넣지 않는다. 코드만 받다가 실측으로 표본 41건 중
// 31건("원" 31 · "€" 6 · "$" 6)을 버렸고, 남은 비싼 것들만으로 밴드가 왜곡됐다.
eq('원은 KRW', currencyCode('원'), 'KRW')
eq('₩도 KRW', currencyCode('₩'), 'KRW')
eq('€는 EUR', currencyCode('€'), 'EUR')
eq('£는 GBP', currencyCode('£'), 'GBP')
eq('값이 섞여 와도 읽는다', currencyCode('12,000 원'), 'KRW')
eq('모르면 빈 값 · 지어내지 않는다', currencyCode('알 수 없음'), '')

console.log('\n── 시장 가격대 ──')
{
  const mk = (n: number, price: number, cur: string) =>
    Array.from({ length: n }, () => ({ price, currency: cur }))
  eq('표본 5개 미만이면 내지 않는다', marketBand(mk(4, 100, 'USD')), null)
  const m = marketBand([...mk(5, 100, 'USD'), ...mk(5, 135000, '원')])
  eq('기호 통화도 표본에 든다', m?.n, 10)
  eq('통화를 모르는 것만 제외로 센다', marketBand([...mk(6, 100, 'USD'), ...mk(2, 100, '???')])?.skipped, 2)
}

console.log('\n── 목표 대비 판정 ──')
// 원가 18.1~23.7 → DTC 3.2~4.2배 = 58~99달러
eq('목표 안',   checkTarget(c, '$60-100').verdict, 'inside')
eq('목표 초과', checkTarget(c, '3만원 이하').verdict, 'over')
eq('목표 미달', checkTarget(c, '50만원대').verdict, 'under')
eq('목표가 없으면 판정하지 않는다', checkTarget(c, '').verdict, 'unknown')

console.log('\n' + '─'.repeat(46))
console.log(fail === 0 ? '통과 · 어긋난 것 0건' : `실패 · ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
