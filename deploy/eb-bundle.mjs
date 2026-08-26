/* Elastic Beanstalk 번들 — vringon-cad/deploy 와 같은 방식.
   들어가는 것: dist/(프로덕션 빌드) · server/ · package.json(런타임 의존성만) · Procfile
   안 들어가는 것: .env · docs/ · public/ 원본 · scripts/ · node_modules · .git
   실행:  npm run build  →  node deploy/eb-bundle.mjs  →  deploy/eb-bundle.zip */
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const STAGE = join(ROOT, 'deploy', 'eb-stage')
const ZIP = join(ROOT, 'deploy', 'eb-bundle.zip')

if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.error('dist/ 가 없다 — 먼저 npm run build')
  process.exit(1)
}

rmSync(STAGE, { recursive: true, force: true })
rmSync(ZIP, { force: true })
mkdirSync(STAGE, { recursive: true })

cpSync(join(ROOT, 'dist'), join(STAGE, 'dist'), { recursive: true })
cpSync(join(ROOT, 'server'), join(STAGE, 'server'), { recursive: true })

/* 런타임 의존성만 남긴 package.json — EB 가 배포 시 npm install 을 돈다 */
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
writeFileSync(join(STAGE, 'package.json'), JSON.stringify({
  name: pkg.name, version: pkg.version, private: true, type: 'module',
  dependencies: { sharp: pkg.dependencies.sharp, undici: pkg.dependencies.undici },
  engines: { node: '>=20' },
}, null, 2))

writeFileSync(join(STAGE, 'Procfile'), 'web: node server/prod.mjs\n')

/* nginx — 딥리서치는 한 요청이 수십 분이다. 기본 60초 프록시 타임아웃이면 전부 죽는다.
   보드 SSE 를 위해 버퍼링도 끈다. 업로드(무드보드 사진)용으로 본문 크기도 올린다. */
mkdirSync(join(STAGE, '.platform', 'nginx', 'conf.d'), { recursive: true })
writeFileSync(join(STAGE, '.platform', 'nginx', 'conf.d', 'long-requests.conf'),
  'proxy_read_timeout 3600s;\nproxy_send_timeout 3600s;\nproxy_buffering off;\nclient_max_body_size 50M;\n')

/* .env 가 절대 섞여 들어가지 않았는지 마지막으로 확인 */
if (existsSync(join(STAGE, '.env')) || existsSync(join(STAGE, 'server', '.env'))) {
  console.error('.env 가 스테이지에 들어갔다 — 중단')
  process.exit(1)
}

/* Compress-Archive 는 경로 구분자를 백슬래시로 써서 EB(리눅스 unzip)가 거부한다 —
   실측: "appears to use backslashes as path separators". 파이썬 zipfile 로 슬래시를 보장한다. */
const py = `
import os, zipfile
stage = r'${STAGE}'
with zipfile.ZipFile(r'${ZIP}', 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(stage):
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, stage).replace(os.sep, '/'))
print('entries', len(z.namelist()))
`
execFileSync('python', ['-c', py], { stdio: 'inherit' })
console.log('완료 →', ZIP)
