/* 이 앱의 전역 CSS 를 한 뿌리(.pa-root) 아래로 가둔다.
   VRINGON 저장소 안으로 소스를 옮길 때, 우리 :root 변수와 * / body 규칙이
   호스트 화면 전체를 덮어쓰면 안 된다 — 공동 작업 중인 다른 화면이 깨진다.

   규칙
     :root                    → .pa-root                 (변수는 우리 뿌리에만)
     :root, [data-theme=…]    → 각각 스코프
     [data-theme="dark"] X    → [data-theme="dark"] .pa-root X   (테마는 html 에 붙는다)
     *                        → .pa-root *
     html, body, #root        → 버린다 (호스트가 정한다)
     body                     → .pa-root
     그 밖의 셀렉터            → .pa-root 를 앞에 붙인다
   @keyframes 안쪽(0%/from/to)은 건드리지 않고, @media 안쪽은 같은 규칙으로 재귀 처리한다.

   실행: node scripts/scope-css.mjs <입력.css> <출력.css> */
import { readFileSync, writeFileSync } from 'node:fs'

// 뿌리 클래스는 인자로 바꿀 수 있다 · 주얼리와 신발이 한 화면에서 나란히 도는데
// 둘 다 .pa-root 로 가두면 뒤에 실린 쪽이 앞의 스타일을 덮는다 (.topbar, .btn 처럼 이름이 겹친다)
const ROOT = process.argv[4] || '.pa-root'

/** 셀렉터 하나를 스코프 안으로 */
function scopeOne(sel) {
  const s = sel.trim()
  if (!s) return ''
  if (s === ':root') return ROOT
  if (s === '*') return `${ROOT} *`
  if (/^(html|body|#root)$/.test(s)) return ROOT
  if (s.startsWith(':root')) return ROOT + s.slice(':root'.length)      // :root:not([data-theme…])
  // 테마 스위치는 호스트의 html 에 붙는다 → 우리 뿌리를 그 안쪽에 끼운다
  const m = s.match(/^(\[data-theme=("|')?[a-z]+\2?\])\s+(.+)$/)
  if (m) return `${m[1]} ${ROOT} ${m[3]}`
  if (/^\[data-theme=/.test(s)) return `${s} ${ROOT}`
  return `${ROOT} ${s}`
}

const scopeSelectorList = (list) =>
  list.split(',').map(scopeOne).filter(Boolean).join(', ')

/** 블록 단위로 훑는다 · at-rule 안쪽은 재귀 */
function scope(css) {
  let out = ''
  let i = 0
  while (i < css.length) {
    // 주석은 그대로
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2)
      const stop = end === -1 ? css.length : end + 2
      out += css.slice(i, stop); i = stop; continue
    }
    // 다음 블록의 여는 괄호까지가 셀렉터(또는 at-rule 머리)
    const brace = css.indexOf('{', i)
    if (brace === -1) { out += css.slice(i); break }
    const head = css.slice(i, brace)
    // 짝 맞는 닫는 괄호 찾기
    let depth = 0, j = brace
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') { depth--; if (depth === 0) break }
    }
    const body = css.slice(brace + 1, j)
    const headTrim = head.trim()

    if (/^@(keyframes|font-face|import|charset|property)/.test(headTrim)) {
      out += head + '{' + body + '}'                       // 안쪽을 건드리지 않는다
    } else if (headTrim.startsWith('@')) {
      out += head + '{' + scope(body) + '}'                 // @media·@supports → 재귀
    } else {
      // 셀렉터 앞에 붙은 주석은 떼어 그대로 내보낸다.
      // 안 떼면 ".pa-root /*주석*/ :root" 가 되어 아무것에도 안 맞고,
      // 그 블록의 변수가 조용히 사라진다 (간격·라운드 토큰이 실제로 이렇게 없어졌다).
      let lead = ''
      let rest = head
      for (;;) {
        const m2 = rest.match(/^(\s*\/\*[\s\S]*?\*\/)/)
        if (!m2) break
        lead += m2[1]
        rest = rest.slice(m2[1].length)
      }
      const sel = scopeSelectorList(rest.trim())
      // html/body/#root 만 있던 규칙(높이 지정 등)은 호스트 몫이라 버린다
      if (sel) out += (head.startsWith('\n') ? '\n' : '') + lead + (lead ? '\n' : '') + sel + ' {' + body + '}'
      else out += lead
    }
    i = j + 1
  }
  return out
}

const [, , inFile, outFile] = process.argv
if (!inFile || !outFile) { console.error('사용: node scripts/scope-css.mjs <입력> <출력>'); process.exit(1) }
const src = readFileSync(inFile, 'utf8')
const done = scope(src)
writeFileSync(outFile, done)
const leaked = [...done.matchAll(/(^|\})\s*(:root|\*|html|body)\s*[,{]/g)].length
// 접두사를 붙였지만 실제로는 아무것에도 안 맞는 셀렉터도 실패로 본다 —
// 조용히 규칙이 사라지는 쪽이 전역 유출보다 찾기 어렵다
const dead = [...done.matchAll(/\.pa-[a-z-]+\s+:root\b/g)].length
console.log(`${inFile} → ${outFile} · 남은 전역 셀렉터 ${leaked} · 죽은 셀렉터 ${dead}`)
if (leaked || dead) process.exit(2)
