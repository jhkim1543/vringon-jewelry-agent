/* EB 환경변수를 안전하게 다룬다 ───────────────────────────────────────
   값을 확인할 필요가 없는데 원문을 찍는 사고가 있었다. describe-configuration
   출력을 그대로 grep 하면 마스킹이 없어 키가 통째로 나온다 — 실제로 그랬다.
   그래서 EB 환경변수는 반드시 이 스크립트로만 읽는다. 키·토큰류는 앞뒤 몇 글자만 남긴다.

   읽기:  node scripts/eb-env.mjs
   쓰기:  node scripts/eb-env.mjs set OPENAI_DEEP_RESEARCH_MODEL gpt-5.2
   지우기: node scripts/eb-env.mjs unset MIRO_ACCESS_TOKEN

   AWS 세션이 필요하다 (aws sts get-caller-identity 로 확인). */
import { execFileSync } from 'node:child_process'

const APP = 'Vringon-Jewelry'
const ENV = 'vringon-jewelry-prod'
const REGION = 'ap-northeast-2'
const NS = 'aws:elasticbeanstalk:application:environment'

/** 값이 비밀인가 · 이름으로 판단한다. 비밀이면 절대 원문을 찍지 않는다. */
const SECRET = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i
const mask = (name, val) => {
  if (!val) return '(빈 값)'
  if (!SECRET.test(name)) return val
  const s = String(val)
  return s.length <= 10 ? '****' : `${s.slice(0, 4)}…${s.slice(-2)} (${s.length}자)`
}

const aws = (args) => execFileSync('aws', args, { encoding: 'utf8', maxBuffer: 1 << 24 })

function read() {
  const out = aws(['elasticbeanstalk', 'describe-configuration-settings',
    '--application-name', APP, '--environment-name', ENV, '--region', REGION,
    '--query', `ConfigurationSettings[0].OptionSettings[?Namespace=='${NS}']`,
    '--output', 'json'])
  const rows = JSON.parse(out).sort((a, b) => a.OptionName.localeCompare(b.OptionName))
  console.log(`환경 ${ENV} · 변수 ${rows.length}개 (비밀은 가려서 표시)\n`)
  let flagged = 0
  for (const r of rows) {
    const v = r.Value ?? ''
    let note = ''
    if (/pro/i.test(v) && /MODEL/i.test(r.OptionName)) { note = '  ← ⚠ pro 모델!'; flagged++ }
    if (/^[A-Za-z]:[\/]/.test(v)) { note = '  ← ⚠ 윈도우 경로(리눅스 서버에서 깨진다)'; flagged++ }
    console.log(`  ${r.OptionName.padEnd(28)} ${mask(r.OptionName, v)}${note}`)
  }
  if (flagged) console.log(`\n⚠ 손봐야 할 값 ${flagged}개`)
}

function write(name, value) {
  aws(['elasticbeanstalk', 'update-environment', '--environment-name', ENV, '--region', REGION,
    '--option-settings', `Namespace=${NS},OptionName=${name},Value=${value}`,
    '--query', 'EnvironmentName', '--output', 'text'])
  console.log(`설정 요청 · ${name} = ${mask(name, value)} (반영까지 1~2분)`)
}

function unset(name) {
  aws(['elasticbeanstalk', 'update-environment', '--environment-name', ENV, '--region', REGION,
    '--options-to-remove', `Namespace=${NS},OptionName=${name}`,
    '--query', 'EnvironmentName', '--output', 'text'])
  console.log(`삭제 요청 · ${name} (반영까지 1~2분)`)
}

const [cmd, name, ...rest] = process.argv.slice(2)
if (!cmd || cmd === 'read') read()
else if (cmd === 'set' && name) write(name, rest.join(' '))
else if (cmd === 'unset' && name) unset(name)
else { console.error('사용: node scripts/eb-env.mjs [read | set NAME VALUE | unset NAME]'); process.exit(1) }
