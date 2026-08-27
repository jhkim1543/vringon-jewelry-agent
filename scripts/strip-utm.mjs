/* 구워 둔 샘플의 출처 주소에서 추적 꼬리표를 떼어 낸다.
   조사 도구가 `?utm_source=…` 를 붙여 보내는데, 그 주소가 화면의 인용 링크로
   그대로 나가서 어느 AI 를 썼는지가 출처에 적혀 나갔다 — 실측 521군데.

   앞으로 들어오는 것은 server/tidy.mjs 의 cleanUrl 이 막는다. 이 스크립트는
   이미 구워 둔 것을 씻는 자리다.

   실행: node scripts/strip-utm.mjs */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { cleanUrl } from '../server/tidy.mjs'

const DIRS = ['src/samples', 'qa/samples']
const URL_RE = /https?:\/\/[^\s<>"'()\[\]\\]+/g

let files = 0, hits = 0
for (const dir of DIRS) {
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const p = `${dir}/${f}`
    const before = readFileSync(p, 'utf8')
    let n = 0
    const after = before.replace(URL_RE, (u) => {
      const c = cleanUrl(u)
      if (c !== u) n++
      return c
    })
    if (n) { writeFileSync(p, after); files++; hits += n; console.log(`  ${p} · ${n}군데`) }
  }
}
console.log(`\n${files}개 파일 · ${hits}군데 씻음`)
