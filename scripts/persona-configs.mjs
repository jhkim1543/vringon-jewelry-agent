/* 고른 페르소나 6명의 설정을 실행용 cfg 로 옮긴다.
   화면에서 그 사람이 고를 값 그대로 옮기는 것이 요점이다 — 여기서 다듬으면 QA 가 무의미해진다.
   실행: node scripts/persona-configs.mjs [--count N]  (N 을 주면 디자인 수를 그 값으로 낮춘다) */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const capIdx = args.indexOf('--count')
const cap = capIdx >= 0 ? Number(args[capIdx + 1]) : null

const { picked } = JSON.parse(readFileSync(join(ROOT, '.personaqa', 'picked.json'), 'utf8'))
const dir = join(ROOT, '.sampleruns')
mkdirSync(dir, { recursive: true })

const slug = (s) => s.normalize('NFKD').replace(/[^\w]+/g, '').toLowerCase().slice(0, 10) || 'p'

const made = []
for (const p of picked) {
  const q = p.params
  const name = `persona_${q.mode}_${slug(p.country)}`
  const cfg = {
    name,
    sampleTitle: `${p.name} (${p.country}) · ${q.mode}`,
    persona: { id: p.id, name: p.name, country: p.country, role: p.role, goal: p.goal, successLooksLike: p.successLooksLike },
    params: {
      algo: 2,
      mode: q.mode,
      countries: q.countries,
      analysisLang: q.analysisLang,
      direction: q.direction,
      itemType: q.itemType,
      items: q.mode === 'collection' ? q.items : [q.itemType],
      designCount: cap ?? q.designCount,
      setCount: q.setCount,
      target: { ages: q.ages, gender: q.gender },
      competitors: q.mode === 'competitor' ? q.competitors : [],
      imageEngine: 'fast',
    },
  }
  writeFileSync(join(dir, `${name}.cfg.json`), JSON.stringify(cfg, null, 1))
  made.push(`${name}  ${q.mode}/${q.analysisLang}  디자인 ${cfg.params.designCount}`)
}
console.log(made.join('\n'))
console.log(`\n${made.length}개 · .sampleruns/persona_*.cfg.json`)
