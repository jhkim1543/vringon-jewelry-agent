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

/** 화면 문구를 담은 상수 맵의 값들 · t(MAP[x]) 처럼 변수로 부르면 위 정규식이 못 잡는다.
 *  Record<..., string> 리터럴의 문자열 값 중 문장처럼 보이는 것을 후보로 올린다.
 *  이 검사가 없어서 에이전트 설명 세 줄이 화면에 영어로 남았다. */
function mapValuesIn(src) {
  const out = new Set()
  // const NAME: Record<…, string> = { key: '문장', … } 형태만 본다
  const rx = /(?:const|let)\s+[A-Z_][A-Za-z0-9_]*\s*:\s*Record<[^>]*string\s*>\s*=\s*\{([\s\S]*?)\n\s*\}/g
  let m
  while ((m = rx.exec(src))) {
    const sx = /:\s*'((?:\\.|[^'\\]){4,})'/g
    let v
    while ((v = sx.exec(m[1]))) {
      const val = v[1].replace(/\\'/g, "'")
      // 낱말 하나짜리 식별자는 번역 대상이 아닐 때가 많다 — 공백이 있는 것만 본다
      if (/\s/.test(val) && /[A-Za-z]/.test(val)) out.add(val)
    }
  }
  return out
}

/** types.ts 의 분류·프리셋 표에 있는 label / note · 이것들은 t(x.label) 로 화면에 나가므로
 *  리터럴 스캔에도, Record 맵 스캔에도 안 걸린다. 실제로 라인 프리셋 일곱 개가
 *  한국어 화면에 영어로 떠 있었다. */
function labelFieldsIn(src) {
  const out = new Set()
  for (const m of src.matchAll(/\b(?:label|note)\s*:\s*'((?:\\.|[^'\\])+)'/g)) {
    out.add(m[1].replace(/\\'/g, "'"))
  }
  return out
}

const files = walk(SRC)
const used = new Map()          // key -> [file, …]
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  // 맵 값 훑기는 화면 파일에만 적용한다. core/ 의 상수 맵에는 모델에 보내는 프롬프트 조각과
  // 스펙 값(예: '925 silver', 'straight front view')이 들어 있고, 그건 번역 대상이 아니다.
  const isUi = /[\\/]ui[\\/]|App\.tsx$/.test(f)
  // types.ts 는 분류·프리셋의 화면 라벨을 들고 있는 유일한 core 파일이다
  const isTaxonomy = /core[\\/]types\.ts$/.test(f)
  for (const k of new Set([
    ...keysIn(src),
    ...((isUi || isTaxonomy) ? mapValuesIn(src) : []),
    ...(isTaxonomy ? labelFieldsIn(src) : []),
  ])) {
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
 const SAME_OK = new Set(['QA', 'QA {pass}/{total}', 'MD', 'PDF', '3D', 'DNA', 'VRINGON',
   // 언어 이름은 그 언어 스스로의 표기가 정답이다 · 번역하면 오히려 못 찾는다
   '한국어', '日本語', 'English', '中文', 'Français', 'Italiano',
   'Preserve · Transform · Replace · Combine · Avoid',
   // 서버 프롬프트에 넣는 언어 이름 · 화면에 그리지 않는다 (types.ts 맵 스캔의 오탐)
   'Korean (한국어)', 'Japanese (日本語)', 'Chinese (中文)', 'French (Français)', 'Italian (Italiano)'])
 const missKo = [], missJa = [], sameKo = [], badPh = []
for (const [k, where] of used) {
  if (!(k in KO) && !SAME_OK.has(k)) missKo.push([k, where[0]])
  else if (KO[k] === k && /[A-Za-z]/.test(k) && k.length > 2 && !SAME_OK.has(k)) sameKo.push([k, where[0]])
  if (!(k in JA) && !SAME_OK.has(k)) missJa.push([k, where[0]])
  // 치환자 보존 검사
  const ph = [...k.matchAll(/\{(\w+)\}/g)].map(x => x[1])
  for (const p of ph) {
    if (KO[k] && !KO[k].includes(`{${p}}`)) badPh.push([`KO`, k, p])
    if (JA[k] && !JA[k].includes(`{${p}}`)) badPh.push([`JA`, k, p])
  }
}
const unusedKo = Object.keys(KO).filter(k => !used.has(k))

// 번역문 안에 영어 낱말이 통째로 남은 경우 · 티어 이름을 문장 속에 두고 잊는 일이 잦다
// 'Design DNA' 는 스펙이 정한 고유 명칭이라 여섯 언어 공통으로 그대로 쓴다
const LEFTOVER = /\b(Core|Push|Signature|Trend|Series|Moodboard|Sketch|Research)\b/
const leftover = []
for (const [label, dict] of [['KO', KO], ['JA', JA]]) {
  for (const [k, v] of Object.entries(dict)) {
    if (v === k) continue                       // 원문 그대로 두기로 한 항목
    if (LEFTOVER.test(v)) leftover.push([label, k, v])
  }
}

// --dump: 누락 키 전체를 조각 JSON 틀로 떨어뜨린다 (번역해서 i18n-merge 에 넣는 용도)
if (process.argv.includes('--dump')) {
  const { writeFileSync: wf } = await import('node:fs')
  const tpl = Object.fromEntries(missKo.map(([k]) => [k, ['', '']]))
  wf('.i18n-missing.json', JSON.stringify(tpl, null, 1))
  console.log(`${missKo.length}건 → .i18n-missing.json`)
  process.exit(0)
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
