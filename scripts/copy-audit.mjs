// ── 문구 감사 ────────────────────────────────────────────────────────
// 화면에 나가는 문장에서 "AI 가 쓴 티" 나는 기호와 어색한 표현을 잡는다.
//
//   node scripts/copy-audit.mjs
//
// 잡는 것
//  · em/en 대시(—, –)와 화살표(→, ->) · 문장 부호로 쓰면 번역투가 된다
//  · 숫자 앞 '+' (예: +10 상업 변형) · 말로 풀어야 읽힌다
//  · 목록 앞 '- ' 불릿
//  · 한국어 문장에 남은 영어 낱말(고유명사·약어 제외)
//  · 한국어 종결 불일치 (…합니다 / …한다 가 한 화면에 섞이는 것)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src', 'core')

/** 지금 코드가 실제로 부르는 문구만 본다.
 *  개편으로 죽은 옛 사전 항목까지 세면 고칠 것이 아닌 것으로 실패가 난다. */
const codeBlob = (() => {
  const parts = []
  ;(function walk(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e) && !/i18n(\.ja)?\.ts$/.test(e)) parts.push(readFileSync(p, 'utf8'))
    }
  })(join(process.cwd(), 'src'))
  return parts.join('\n')
})()
const isLive = (key) => codeBlob.includes(key) || codeBlob.includes(key.replace(/'/g, "\\'"))

function dictOf(file) {
  const src = readFileSync(join(SRC, file), 'utf8')
  const out = []
  const rx = /^\s*'((?:\\.|[^'\\])*)':\s*(?:\r?\n\s*)?'((?:\\.|[^'\\])*)',/gm
  let m
  while ((m = rx.exec(src))) {
    out.push({
      key: m[1].replace(/\\'/g, "'"),
      val: m[2].replace(/\\'/g, "'"),
      line: src.slice(0, m.index).split('\n').length,
    })
  }
  return out
}

// 한국어 문장에 남아도 되는 영어 · 고유명사와 업계 약어
const OK_EN = /\b(VRINGON|MD|QA|PDF|PPT|3D|DNA|Design DNA|Preserve|Transform|Replace|Combine|Complement|Avoid|Pandora|Mejuri|Tiffany|GitHub|Miro|CSV|URL|API)\b/g

const rows = dictOf('i18n.ts')
const jaRows = dictOf('i18n.ja.ts')

const hits = { dash: [], plus: [], bullet: [], english: [], ending: [] }

for (const { key, val, line } of rows) {
  if (!isLive(key)) continue                 // 죽은 옛 항목은 화면에 안 나온다
  // 키(영문 원문)도 en 화면에 그대로 나간다 · 둘 다 본다
  for (const [who, s] of [['key', key], ['ko', val]]) {
    if (/[—–]|->|→/.test(s)) hits.dash.push({ line, who, s })
    if (/(^|\s)\+\d/.test(s)) hits.plus.push({ line, who, s })
    if (/(^|\n)\s*-\s/.test(s)) hits.bullet.push({ line, who, s })
  }
  // 한국어 값에 영어가 섞였는가
  if (/[가-힣]/.test(val)) {
    const left = val.replace(OK_EN, '').replace(/\{[a-z]+\}/g, '')
    const eng = left.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g)
    if (eng?.length) hits.english.push({ line, s: val, eng: [...new Set(eng)] })
    // 종결 · 평서문인데 '…한다' 로 끝나면 화면 톤과 어긋난다
    if (/(한다|된다|이다|간다|온다)\.?$/.test(val.trim())) hits.ending.push({ line, s: val })
  }
}

for (const { key, val, line } of jaRows) {
  if (!isLive(key)) continue
  if (/[—–]|->|→/.test(val)) hits.dash.push({ line, who: 'ja', s: val })
}

// ── 구운 샘플의 생성 본문도 본다 ─────────────────────────────────────
// 사전만 보다가 놓친 적이 있다. 화면에 나가는 글의 대부분은 조사 모델이 쓴 것이고,
// 거기에 화살표와 대시가 그대로 남아 있었다. 서버의 tidy() 가 지금은 걸러 내지만,
// 걸러지는지 확인하는 자리가 여기다.
const samples = []
{
  const dir = join(process.cwd(), 'src', 'samples')
  if (existsSync(dir)) {
    // 앱이 심는 데모 샘플만 본다 · QA 실행 산출물(persona_*)은 사용자가 친 문장이라
    // 여기서 다듬을 대상이 아니다 (그 사람 말투가 그대로 들어 있다)
    for (const f of readdirSync(dir).filter(x => x.startsWith('sample_') && x.endsWith('.json'))) {
      const st = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      // 사람이 읽는 한국어 필드만 · 주소와 영문 프롬프트는 대상이 아니다
      const walk = (v, key = '') => {
        if (typeof v === 'string') {
          if (/url$/i.test(key) || /^https?:\/\//.test(v)) return
          if (key === 'prompt' || key === 'final_prompt') return   // 생성 프롬프트는 영어다
          if (/[가-힣]/.test(v)) samples.push({ file: f, s: v })
          return
        }
        if (Array.isArray(v)) return v.forEach(x => walk(x, key))
        if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
      }
      walk(st)
    }
  }
}
for (const { file, s } of samples) {
  if (/[—–]|->|→/.test(s)) hits.dash.push({ line: file, who: '샘플', s })
  if (/(^|\n)\s*-\s/.test(s)) hits.bullet.push({ line: file, who: '샘플', s })
}

const show = (title, rows, fmt) => {
  console.log(`\n── ${title} · ${rows.length}건`)
  for (const r of rows.slice(0, 30)) console.log('   ' + fmt(r))
  if (rows.length > 30) console.log(`   … 외 ${rows.length - 30}건`)
}

console.log(`KO ${rows.length}개 · JA ${jaRows.length}개 문구 · 샘플 본문 ${samples.length}개 검사`)
show('대시·화살표', hits.dash, r => `${r.line} [${r.who}] ${r.s.slice(0, 76)}`)
show('숫자 앞 +', hits.plus, r => `${r.line} [${r.who}] ${r.s.slice(0, 76)}`)
show('- 불릿', hits.bullet, r => `${r.line} [${r.who}] ${r.s.slice(0, 76)}`)
show('한국어에 섞인 영어', hits.english, r => `${r.line} ${r.eng.join(', ')} · ${r.s.slice(0, 60)}`)
show('종결 불일치 (…한다)', hits.ending, r => `${r.line} ${r.s.slice(0, 76)}`)

const fail = hits.dash.length + hits.plus.length + hits.bullet.length + hits.english.length + hits.ending.length
console.log('\n' + '─'.repeat(58))
console.log(fail === 0 ? '통과 · 다듬을 문구 0건' : `실패 · 다듬을 문구 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
