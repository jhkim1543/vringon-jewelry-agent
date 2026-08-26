/* Elastic Beanstalk 배포 — vringon-cad/deploy/eb-deploy.mjs 와 같은 흐름.
   S3 업로드 → 버전 등록 → 환경 갱신 → Ready 대기 → 바깥에서 확인.

   먼저:  aws login  (ap-northeast-2),  npm run build,  node deploy/eb-bundle.mjs
   실행:  node deploy/eb-deploy.mjs --app <앱> --env <환경> [--set KEY=VALUE ...] [--set-file <json>] [--no-wait]

   앱/환경 이름은 계정에서 jhkim 할당분을 확인해 넘긴다(기본값 없음 — 남의 환경에 잘못 올리지 않기 위해).
   --set 값은 로그·이력에 남기지 않는다. 키는 .env 가 아니라 여기 --set-file 로만 EB 에 넣는다. */
import { execFileSync } from 'node:child_process'
import { statSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }

const APP = opt('--app'), ENV = opt('--env'), REGION = opt('--region', 'ap-northeast-2')
if (!APP || !ENV) { console.error('--app 과 --env 는 필수다 (계정의 jhkim 할당 환경 이름)'); process.exit(1) }
const SETS = args.flatMap((a, i) => (a === '--set' ? [args[i + 1]] : []))
if (opt('--set-file')) for (const [k, v] of Object.entries(JSON.parse(readFileSync(opt('--set-file'), 'utf8')))) SETS.push(`${k}=${v}`)
const ZIP = join(ROOT, 'deploy', 'eb-bundle.zip')

const aws = (...a) => execFileSync('aws', [...a, '--region', REGION, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
const j = (s) => JSON.parse(s)

const who = j(aws('sts', 'get-caller-identity'))
console.log(`계정 ${who.Account} · ${who.Arn.split('/').pop()}`)

const envs = j(aws('elasticbeanstalk', 'describe-environments', '--application-name', APP, '--environment-names', ENV)).Environments
if (!envs.length) throw new Error(`환경 ${ENV} 이 ${APP} 에 없습니다`)
console.log(`환경 ${ENV} · ${envs[0].Status} · ${envs[0].Health} · 지금 버전 ${envs[0].VersionLabel} · ${envs[0].CNAME}`)

const bucket = j(aws('elasticbeanstalk', 'create-storage-location')).S3Bucket
const label = `v${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`
const key = `${APP}/${label}.zip`
console.log(`번들 ${(statSync(ZIP).size / 1e6).toFixed(1)} MB → s3://${bucket}/${key}`)
aws('s3', 'cp', ZIP, `s3://${bucket}/${key}`, '--only-show-errors')

aws('elasticbeanstalk', 'create-application-version', '--application-name', APP, '--version-label', label,
  '--source-bundle', `S3Bucket=${bucket},S3Key=${key}`, '--description', `deploy ${label}`, '--no-auto-create-application')
console.log(`버전 ${label} 등록`)

const upd = ['elasticbeanstalk', 'update-environment', '--application-name', APP, '--environment-name', ENV, '--version-label', label]
let tmp = null
if (SETS.length) {
  const items = SETS.map((kv) => { const i = kv.indexOf('='); return { Namespace: 'aws:elasticbeanstalk:application:environment', OptionName: kv.slice(0, i), Value: kv.slice(i + 1) } })
  tmp = join(tmpdir(), `eb-opts-${process.pid}.json`)
  writeFileSync(tmp, JSON.stringify(items))
  upd.push('--option-settings', `file://${tmp}`)
  console.log(`환경변수 ${items.length}개: ${items.map((x) => x.OptionName).join(', ')}`)
}
try { aws(...upd) } finally { if (tmp) unlinkSync(tmp) }
console.log('환경 갱신 요청됨')

if (args.includes('--no-wait')) process.exit(0)
const t0 = Date.now()
for (;;) {
  await new Promise((r) => setTimeout(r, 15000))
  const e = j(aws('elasticbeanstalk', 'describe-environments', '--environment-names', ENV)).Environments[0]
  console.log(`  ${Math.round((Date.now() - t0) / 1000)}s  ${e.Status} · ${e.Health} · ${e.VersionLabel}`)
  if (e.Status === 'Ready' && e.VersionLabel === label) break
  if (Date.now() - t0 > 15 * 60e3) throw new Error('15분이 지나도 Ready 가 아닙니다')
}
const host = `http://${envs[0].CNAME}`
for (const [p, want] of [['/api/status', 200], ['/', 200], ['/server/prod.mjs', 200]]) {
  const r = await fetch(host + p, { redirect: 'manual' }).catch(() => null)
  // /server/prod.mjs 는 SPA 폴백이라 200 이 정상(파일이 아니라 index.html 이 나온다)
  console.log(`  ${r?.status === want ? 'OK ' : '?? '} ${p} → ${r?.status} (기대 ${want})`)
}
console.log(`끝: ${host}`)
