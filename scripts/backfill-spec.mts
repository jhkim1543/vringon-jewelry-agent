/* 데모 샘플에 제작 사양을 채워 넣는다.
   샘플은 이 개편 전에 구운 것이라 spec 이 없다 — 화면에서 테크팩이 통째로 안 보인다.
   새로 설계하는 것이 아니라 이미 있는 프롬프트에서 읽어 낸다. 사진이 그 프롬프트로
   만들어졌으므로, 지어내면 그림과 사양이 어긋난다.

   실행: npx tsx scripts/backfill-spec.mts            (데모 샘플 전부)
         npx tsx scripts/backfill-spec.mts sample_collection_tide
         npx tsx scripts/backfill-spec.mts --qa         (QA 실행본 qa/samples 전부) */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { estimateCost } from '../src/core/cost'

const BASE = 'http://localhost:5188'
const ITEM_KO: Record<string, string> = {
  ring: '반지', earrings: '귀걸이', necklace: '목걸이', pendant: '펜던트', bracelet: '브레이슬릿',
}
const LANG: Record<string, string> = {
  ko: 'Korean (한국어)', ja: 'Japanese (日本語)', en: 'English',
  zh: 'Chinese (中文)', fr: 'French (Français)', it: 'Italian (Italiano)',
}

const qaMode = process.argv.includes('--qa')
const DIR = qaMode ? 'qa/samples' : 'src/samples'
const names = process.argv.slice(2).filter(a => !a.startsWith('-'))
const targets = names.length ? names
  : qaMode
    ? readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
    : [...readFileSync('src/core/sampleRun.ts', 'utf8').matchAll(/'(sample_[a-z_]+)'/g)].map(m => m[1])

/** 한 번에 너무 많이 던지면 429 가 난다 · 여기서 재시도까지 본다 */
async function specFor(prompt: string, itemKo: string, langName: string, tries = 3): Promise<unknown> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/api/agent/specfrom`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, itemKo, langName }),
        signal: AbortSignal.timeout(180_000),
      })
      if (r.ok) return r.json()
      if (r.status !== 429) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`)
    } catch (e) {
      if (i === tries - 1) throw e
    }
    await new Promise(res => setTimeout(res, 4000 * (i + 1)))
  }
  throw new Error('재시도 소진')
}

async function pool<T>(items: T[], limit: number, work: (x: T, i: number) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; await work(items[i], i) }
  }))
}

for (const name of [...new Set(targets)]) {
  const path = `${DIR}/${name}.json`
  let st: {
    params: { mode: string; itemType: string; analysisLang: string }
    pairs: Array<{ id: string; item?: string; prompt: string; spec?: unknown }>
  }
  try { st = JSON.parse(readFileSync(path, 'utf8')) } catch { console.log(`건너뜀 · ${name} 없음`); continue }

  const todo = st.pairs.filter(p => !p.spec && p.prompt)
  if (!todo.length) { console.log(`= ${name} · 이미 채워짐`); continue }
  process.stdout.write(`${name} · ${todo.length}건 `)

  let done = 0, failed = 0
  await pool(todo, 4, async (p) => {
    const itemKo = ITEM_KO[p.item ?? st.params.itemType] ?? '주얼리'
    try {
      p.spec = await specFor(p.prompt, itemKo, LANG[st.params.analysisLang] ?? LANG.ko)
      done++
    } catch { failed++ }
    process.stdout.write('.')
  })

  writeFileSync(path, JSON.stringify(st, null, 1))
  const costed = st.pairs.filter(p => estimateCost(p.spec as never).ok).length
  console.log(` 채움 ${done} · 실패 ${failed} · 원가 계산되는 것 ${costed}/${st.pairs.length}`)
}
