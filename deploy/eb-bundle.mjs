/* Elastic Beanstalk 번들 — vringon-cad/deploy 와 같은 방식.
   들어가는 것: dist/(프로덕션 빌드) · server/ · package.json(런타임 의존성만) · Procfile
   안 들어가는 것: .env · docs/ · public/ 원본 · scripts/ · node_modules · .git
   실행:  npm run build  →  node deploy/eb-bundle.mjs  →  deploy/eb-bundle.zip */
import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
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

/* dist/samples 는 빌드가 public/ 을 통째로 복사해 오는 자리다. 실행을 돌릴 때마다
   생성 이미지가 그 폴더에 쌓이는데, 배포에 필요한 것은 데모 샘플이 실제로 가리키는
   몇 장뿐이다. 그냥 두었더니 번들이 716MB 가 되어 EB 상한(500MB)에 막혔다.
   런타임 생성 이미지는 별도 캐시로 가므로 여기서 걷어내도 화면은 그대로다. */
{
  const sdir = join(STAGE, 'dist', 'samples')
  if (existsSync(sdir)) {
    // 데모 샘플 JSON 은 src/samples 에 있고 빌드 때 JS 청크로 들어간다 —
    // dist/samples 에는 사진만 있으므로 참조 목록은 원본에서 읽어야 한다.
    // (여기를 dist/samples 에서 찾다가 "0개 남기고 1227개 뺐다" 가 나왔다. 그대로 나갔으면
    //  데모 사진이 전부 깨진다.)
    const want = new Set()
    const srcDir = join(ROOT, 'src', 'samples')
    const live = new Set(
      [...readFileSync(join(ROOT, 'src', 'core', 'sampleRun.ts'), 'utf8')
        .matchAll(/'(sample_[a-z_]+)'/g)].map(m => `${m[1]}.json`))
    for (const f of readdirSync(srcDir).filter(x => live.has(x))) {
      const body = readFileSync(join(srcDir, f), 'utf8')
      for (const m of body.matchAll(/\/samples\/([\w.-]+\.(?:png|jpe?g|webp|glb))/g)) want.add(m[1])
    }
    if (!want.size) { console.error('데모 샘플이 가리키는 사진을 하나도 못 찾았다 — 중단'); process.exit(1) }
    let kept = 0, dropped = 0, freed = 0
    for (const f of readdirSync(sdir)) {
      if (f.endsWith('.json') || want.has(f)) { kept++; continue }
      const p2 = join(sdir, f)
      freed += statSync(p2).size
      rmSync(p2, { force: true, recursive: true })
      dropped++
    }
    console.log(`샘플 이미지 ${kept}개 남기고 ${dropped}개 뺐다 (${(freed / 1e6).toFixed(0)} MB)`)
  }
}
/* PPT 라이브러리는 브라우저 번들에 넣지 않고 이 서버가 내준다
   (번들러가 Node 모듈을 끌고 들어가려다 실패한다 · VRINGON dev 가 실제로 이걸로 죽었다) */
mkdirSync(join(STAGE, 'dist', 'vendor'), { recursive: true })
cpSync(join(ROOT, 'node_modules', 'pptxgenjs', 'dist', 'pptxgen.es.js'),
  join(STAGE, 'dist', 'vendor', 'pptxgen.es.js'))
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

/* 계정별 분석 내역이 재배포로 사라지지 않게, 앱 폴더 밖에 저장 자리를 만들어 둔다.
   EB 는 배포마다 /var/app/current 를 통째로 갈아치우므로 그 안에 두면 안 된다.
   서버는 RUNS_DIR 환경변수를 보고 이 경로에 쓴다. */
mkdirSync(join(STAGE, '.platform', 'hooks', 'predeploy'), { recursive: true })
writeFileSync(join(STAGE, '.platform', 'hooks', 'predeploy', '01_runs_dir.sh'),
  '#!/bin/bash\nset -e\nmkdir -p /var/app/data/runs\nchown -R webapp:webapp /var/app/data\n', { mode: 0o755 })

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
