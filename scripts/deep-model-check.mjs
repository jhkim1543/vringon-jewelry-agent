/* 딥리서치 모델 규칙 검사 · API 를 부르지 않는다.
   코드 기본값을 바꿔 놨는데도 EB 환경변수가 덮어써서 운영이 계속 gpt-5-pro 로
   돌고 있었다. 설정 하나로 되돌아오지 않는지 여기서 못을 박는다.
   실행: node scripts/deep-model-check.mjs */
import { DEEP_MODEL_DEFAULT, resolveDeepModel } from '../server/research-api.mjs'

let fail = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { fail++; console.log(`✕ ${name}\n   나온 것: ${JSON.stringify(got)}\n   맞는 것: ${JSON.stringify(want)}`) }
  else console.log(`✓ ${name}`)
}

eq('기본값은 pro 가 아니다', /pro/i.test(DEEP_MODEL_DEFAULT), false)
eq('설정이 비면 기본값', resolveDeepModel('').model, DEEP_MODEL_DEFAULT)
eq('설정이 없어도 기본값', resolveDeepModel(undefined).model, DEEP_MODEL_DEFAULT)

for (const banned of ['gpt-5-pro', 'GPT-5-PRO', 'gpt-5.2-pro', 'o3-pro', 'gpt-5-pro-2026-01']) {
  const r = resolveDeepModel(banned)
  eq(`${banned} 는 막힌다`, r.model, DEEP_MODEL_DEFAULT)
  eq(`${banned} 는 이유를 남긴다`, r.note.includes(banned), true)
}

// 이름에 pro 가 들어가도 낱말이 아니면 막지 않는다 (앞으로 나올 이름을 미리 막지 않기 위해)
for (const ok of ['gpt-5.2', 'gpt-5', 'gpt-5.6-terra', 'o3-deep-research', 'gpt-5-probe-x']) {
  eq(`${ok} 는 통과`, resolveDeepModel(ok).model, ok)
}

console.log('\n' + '─'.repeat(46))
console.log(fail === 0 ? '통과 · 어긋난 것 0건' : `실패 · ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
