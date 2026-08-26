/* VRINGON 안(임베드)에서 깨질 자리를 찾는다.
   이 앱은 자기 서버에서 돌 때와 VRINGON 안의 한 화면으로 돌 때가 다르다.
   같은 출처를 가정한 경로가 남아 있으면 임베드에서 조용히 404 가 된다 —
   실제로 에이전트 카드 사진 3장이 그렇게 깨졌다.

   검사
     1) 코드가 만드는 절대 경로(/samples /brand /assets /api …)가 apiUrl·assetUrl 을 지나는가
     2) 빌드 산출물에 남은 같은-출처 자산 참조
     3) 이식본(옮긴 코드)에 index.html 이 주던 것(글꼴 등)이 빠지지 않았는가
   실행: node scripts/embed-audit.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SRC = join(ROOT, 'src')

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|css)$/.test(e.name)) out.push(p)
  }
  return out
}

const files = walk(SRC)
const problems = []

for (const f of files) {
  const rel = relative(ROOT, f)
  const text = readFileSync(f, 'utf8')
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`
    if (/\/\/\s|^\s*\*/.test(line) && !line.includes('src=')) return   // 주석은 건너뛴다

    // 1) 자산 경로가 헬퍼를 지나지 않는 경우
    const asset = line.match(/["'`]\/(samples|brand|assets|vendor|pdfjs)\//)
    if (asset && !/(assetUrl|apiUrl|__AGENT_API__|replace)/.test(line)) {
      problems.push(`${at} · 자산 경로가 같은 출처를 가정한다 → ${asset[0]}`)
    }
    // 2) fetch/EventSource 가 헬퍼를 지나지 않는 경우
    //    리터럴 경로뿐 아니라 변수로 넘기는 형태도 본다 — 보드 쓰기가 실제로 그렇게 새어
    //    같은 출처로 404 를 맞았다(화면에는 메모가 붙는데 서버에는 안 남았다).
    if (/(fetch|EventSource)\(\s*[`'"]\/(api|samples)/.test(line)) {
      problems.push(`${at} · API 호출이 apiUrl 을 지나지 않는다`)
    }
    const call = line.match(/(fetch|EventSource)\(\s*([A-Za-z_$][\w$]*)\s*[,)]/)
    if (call) {
      // 변수로 넘기는 경우 · 그 변수가 바로 위에서 헬퍼로 만들어졌으면 통과로 본다
      const near = lines.slice(Math.max(0, i - 6), i + 1).join(' ')
      const made = new RegExp(`(const|let)\\s+${call[2]}\\s*=.*(apiUrl|assetUrl|shotUrl)`).test(near)
      if (!made) problems.push(`${at} · ${call[1]}(${call[2]}) · 인자가 apiUrl 을 지나지 않는다`)
    }
    // 3) BASE_URL 을 직접 읽는 경우 (이식본에는 vite 타입 선언이 없다)
    if (/import\.meta\.env/.test(line) && !rel.endsWith('core\\api.ts') && !rel.endsWith('core/api.ts')) {
      problems.push(`${at} · import.meta.env 직접 사용 (api.ts 의 baseUrl 을 쓸 것)`)
    }
  })
}

// 4) 글꼴 · 이식본은 index.html 이 없다
const theme = readFileSync(join(SRC, 'theme.css'), 'utf8')
if (!/@import[^;]*pretendard/i.test(theme)) {
  problems.push('src/theme.css · Pretendard @import 가 없다 (임베드에서 한글 글꼴이 바뀐다)')
}

// 5) 이식본 점검 · 인자로 VRINGON 저장소 경로를 주면 옮겨 간 코드도 함께 본다
//    (원본 빌드본의 /samples/ 는 자기 서버가 서빙하므로 문제가 아니다 — 이식본에서만 치환된다)
const ported = process.argv[2]
if (ported) {
  const dir = join(ported, 'core', 'src', 'planning', 'agent')
  try {
    for (const f of walk(dir)) {
      const rel = relative(ported, f)
      const text = readFileSync(f, 'utf8')
      if (/\.css$/.test(f)) {
        for (const m of text.matchAll(/(^|\})\s*(:root|html|body|\*)\s*[,{]/g)) {
          problems.push(`${rel} · 전역 셀렉터가 스코프를 벗어났다 → ${m[2]}`)
        }
      }
    }
    for (const f of readdirSync(join(dir, 'samples'))) {
      if (!f.endsWith('.json')) continue
      const text = readFileSync(join(dir, 'samples', f), 'utf8')
      if (/"\/samples\//.test(text)) problems.push(`samples/${f} · 사진 경로가 치환되지 않았다`)
    }
  } catch (e) { problems.push('이식본을 못 읽었다: ' + e.message) }
}

const uniq = [...new Set(problems)]
if (uniq.length) {
  console.log('임베드 검사 · 문제 ' + uniq.length + '건')
  for (const p of uniq) console.log('  ✕ ' + p)
  process.exit(1)
}
console.log(`임베드 검사 · 통과 (${files.length}개 파일)`)
