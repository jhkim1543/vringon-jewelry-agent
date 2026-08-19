// ── 번역 감사 ────────────────────────────────────────────────────
// 세 가지를 본다.
//  1) 화면 코드가 t()/tf() 로 부르는 키 중 KO·JA 사전에 없는 것 (그 자리는 영어로 남는다)
//  2) 사전에는 있는데 아무도 부르지 않는 키 (원문이 바뀌면서 죽은 항목)
//  3) tf() 의 {치환자}가 번역문에서 빠진 것 (값이 통째로 사라진다)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(e) && !/i18n(\.ja)?\.ts$/.test(e)) out.push(p)
  }
  return out
}

/** 소스에서 t('…') / tf('…', …) 의 첫 인자를 모은다. 변수를 넘긴 호출은 셀 수 없으므로 건너뛴다. */
function keysIn(src) {
  const keys = new Set()
  // 작은따옴표 · 큰따옴표 · 백틱(치환 없는 것)만 잡는다
  const re = /\bt f?\(|\btf?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  const rx = /\btf?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  let m
  while ((m = rx.exec(src))) {
    const raw = m[2]
    if (m[1] === '`' && raw.includes('${')) continue   // 동적 키는 사전에 넣을 수 없다
    keys.add(raw.replace(/\\'/g, "'").replace(/\\\\/g, '\\'))
  }
  void re
  return keys
}

const files = walk(SRC)
const used = new Map()          // key -> [file, …]
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const k of keysIn(src)) {
    if (!used.has(k)) used.set(k, [])
    used.get(k).push(f.replace(ROOT + '\\', '').replace(/\\/g, '/'))
  }
}

// 사전은 소스에서 직접 읽는다(빌드 없이 감사하려면 이 방법뿐)
function dictOf(file) {
  const src = readFileSync(join(SRC, 'core', file), 'utf8')
  const d = {}
  const rx = /^\s*'((?:\\.|[^'\\])*)':\s*(?:\r?\n\s*)?'((?:\\.|[^'\\])*)',/gm
  let m
  while ((m = rx.exec(src))) {
    const k = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    const v = m[2].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    d[k] = v
  }
  return d
}
const KO = dictOf('i18n.ts')
const JA = dictOf('i18n.ja.ts')

// 한·일에서도 원문 그대로 쓰는 말 · 동일해도 미번역이 아니다
 const SAME_OK = new Set(['QA', 'QA {pass}/{total}', 'MD', 'PDF', '3D', 'DNA', 'VRINGON'])
 const missKo = [], missJa = [], sameKo = [], badPh = []
for (const [k, where] of used) {
  if (!(k in KO)) missKo.push([k, where[0]])
  else if (KO[k] === k && /[A-Za-z]/.test(k) && k.length > 2 && !SAME_OK.has(k)) sameKo.push([k, where[0]])
  if (!(k in JA)) missJa.push([k, where[0]])
  // 치환자 보존 검사
  const ph = [...k.matchAll(/\{(\w+)\}/g)].map(x => x[1])
  for (const p of ph) {
    if (KO[k] && !KO[k].includes(`{${p}}`)) badPh.push([`KO`, k, p])
    if (JA[k] && !JA[k].includes(`{${p}}`)) badPh.push([`JA`, k, p])
  }
}
const unusedKo = Object.keys(KO).filter(k => !used.has(k))

// 번역문 안에 영어 낱말이 통째로 남은 경우 · 티어 이름을 문장 속에 두고 잊는 일이 잦다
const LEFTOVER = /\b(Core|Push|Signature|Trend|Series|Moodboard|Design|Sketch|Research)\b/
const leftover = []
for (const [label, dict] of [['KO', KO], ['JA', JA]]) {
  for (const [k, v] of Object.entries(dict)) {
    if (v === k) continue                       // 원문 그대로 두기로 한 항목
    if (LEFTOVER.test(v)) leftover.push([label, k, v])
  }
}

const show = (title, rows, fmt) => {
  console.log(`\n── ${title} · ${rows.length}건`)
  for (const r of rows.slice(0, 25)) console.log('   ' + fmt(r))
  if (rows.length > 25) console.log(`   … 외 ${rows.length - 25}건`)
}

console.log(`화면 코드가 쓰는 키 ${used.size}개 · KO 사전 ${Object.keys(KO).length} · JA 사전 ${Object.keys(JA).length}`)
show('KO 사전 누락 (그 자리는 영어로 나온다)', missKo, ([k, f]) => `${f}  "${k.slice(0, 70)}"`)
show('JA 사전 누락', missJa, ([k, f]) => `${f}  "${k.slice(0, 70)}"`)
show('KO 값이 영어 원문 그대로', sameKo, ([k, f]) => `${f}  "${k.slice(0, 70)}"`)
show('치환자 유실 (값이 사라진다)', badPh, ([l, k, p]) => `${l}  {${p}}  "${k.slice(0, 60)}"`)
show('번역문에 영어 낱말이 남음', leftover, ([l, , v]) => `${l}  "${v.slice(0, 70)}"`)
// 아래는 실패로 세지 않는다 · t(METAL_EN[x]) 처럼 변수로 부르는 키는 여기서 안 잡힌다
show('안 쓰이는 사전 항목 (변수로 부르는 키 포함)', unusedKo, k => `"${k.slice(0, 70)}"`)

const fail = missKo.length + missJa.length + sameKo.length + badPh.length + leftover.length
console.log('\n' + '─'.repeat(58))
console.log(fail === 0 ? '통과 · 번역 누락 0건' : `실패 · 고쳐야 할 항목 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
