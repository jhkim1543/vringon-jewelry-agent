/* 에이전트별 페르소나 3명 ─────────────────────────────────────────────
   세 에이전트는 목적이 다르다. 같은 사람을 셋에 돌려 보는 것은 의미가 없다 —
   각 에이전트가 실제로 어떤 사람의 어떤 일을 대신하려는 것인지에 맞춰 세운다.

     경쟁사 트렌드 · 지목한 경쟁사와 편집숍을 훑어 지금 시장을 읽는다
       → 브랜드 안에서 다음 시즌 라인을 정해야 하는 사람. 경쟁사 이름을 댈 수 있어야 한다.
     패션 트렌드   · 런웨이를 주얼리 언어로 옮기고 리테일 확산을 본다
       → 컬렉션 방향을 패션 흐름에서 끌어오는 사람. 시즌 단위로 일한다.
     주얼리 컬렉션 · 키워드/이야기 하나에서 세트를 짓는다 (크롤 없음)
       → 자기 브랜드의 이야기를 형태로 바꾸는 사람. 경쟁사가 아니라 서사가 출발점이다.

   페르소나는 GPT 가 만든다. 내가 쓰면 내가 만들기 쉬운 요구만 나온다.
   대신 각자가 "무엇을 넣을지"까지 스스로 정하게 해서, 그 설정 그대로 실행에 넘긴다.

   실행: node scripts/persona3.mjs            → .personaqa/persona3.json + .sampleruns/*.cfg.json */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { ask } from '../server/research-api.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const OUT = join(ROOT, '.personaqa')
const CFG = join(ROOT, '.sampleruns')
mkdirSync(OUT, { recursive: true })
mkdirSync(CFG, { recursive: true })

function env() {
  const out = {}
  for (const f of ['.env.local', '.env']) {
    const p = join(ROOT, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return { ...out, ...process.env }
}
const KEY = env().OPENAI_API_KEY
if (!KEY) { console.error('OPENAI_API_KEY 없음'); process.exit(1) }

/* 화면이 실제로 받는 값만 스키마에 넣는다. 화면에 없는 칸을 페르소나가 지어내면
   "수량을 무시한다" 같은 헛된 결함 보고가 나온다 — 지난 QA 에서 실제로 그랬다. */
const REGIONS = ['Korea', 'Japan', 'Europe', 'Asia', 'Middle East', 'United States']
const ITEMS = ['ring', 'earrings', 'necklace', 'pendant', 'bracelet']
const AGES = ['18-24', '20-25', '26-29', '30-34', '35-39', '40-44', '45-49', '50-59', '60+']

const PURPOSE = {
  competitor: '지목한 경쟁사 브랜드와 편집숍의 실제 판매 제품을 훑어, 지금 시장에서 무엇이 팔리는지 읽고 그 위에서 다음 디자인을 낸다. 경쟁사 이름을 댈 수 있는 사람이 쓴다.',
  fashion: '런웨이 룩과 그것이 리테일로 내려오는 속도를 보고, 패션 흐름을 주얼리 언어로 옮긴다. 시즌 단위로 방향을 잡는 사람이 쓴다.',
  collection: '키워드나 이야기 하나에서 출발해, 하나의 Design DNA 를 공유하는 세트를 짓는다. 경쟁사 크롤은 하지 않는다. 자기 브랜드의 서사를 형태로 바꾸는 사람이 쓴다.',
}

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['name', 'country', 'role', 'years', 'brandContext', 'situation', 'goal', 'successLooksLike', 'params'],
  properties: {
    name: { type: 'string', description: '그 나라에서 자연스러운 이름' },
    country: { type: 'string' },
    role: { type: 'string', description: '직함과 연차 (예: 브랜드 주얼리 디자인 리드)' },
    years: { type: 'integer' },
    brandContext: { type: 'string', description: '어떤 브랜드/공방에서 일하는가 · 가격대와 고객층 포함 2~3문장' },
    situation: { type: 'string', description: '오늘 이 도구를 여는 구체적 상황 · 언제까지 무엇을 내야 하는가' },
    goal: { type: 'string', description: '이 실행에서 얻고 싶은 것' },
    successLooksLike: { type: 'string', description: '무엇이 나오면 성공인가 · 나중에 이 기준으로 결과를 채점한다' },
    params: {
      type: 'object', additionalProperties: false,
      required: ['countries', 'analysisLang', 'direction', 'itemType', 'items', 'designCount', 'setCount', 'ages', 'gender', 'competitors', 'imageEngine'],
      properties: {
        countries: { type: 'array', items: { type: 'string', enum: REGIONS }, description: '1개만 고른다 (조사 시간이 지역 수만큼 늘어난다)' },
        analysisLang: { type: 'string', enum: ['ko', 'ja', 'en', 'zh', 'fr', 'it'] },
        direction: { type: 'string', description: '경쟁사·패션이면 조사 방향, 컬렉션이면 키워드나 이야기. 그 사람이 실제로 칠 문장으로.' },
        itemType: { type: 'string', enum: ITEMS, description: '경쟁사·패션 전용 단일 품목' },
        items: { type: 'array', items: { type: 'string', enum: ITEMS }, description: '컬렉션 전용 다중 품목 · 2~3개' },
        designCount: { type: 'integer', enum: [10, 20, 30, 40] },
        setCount: { type: 'integer', enum: [1, 3, 5] },
        ages: { type: 'array', items: { type: 'string', enum: AGES } },
        gender: { type: 'string', enum: ['female', 'male', 'unisex'] },
        competitors: { type: 'array', items: { type: 'string' }, description: '경쟁사 모드면 실존 브랜드 3~4곳. 다른 모드면 빈 배열.' },
        imageEngine: { type: 'string', enum: ['fast', 'detail'] },
      },
    },
  },
}

const made = {}
for (const [mode, purpose] of Object.entries(PURPOSE)) {
  process.stdout.write(`${mode.padEnd(12)} `)
  const { data } = await ask(KEY, {
    root: ROOT, web: false, name: `persona_${mode}`, schema: SCHEMA,
    input: `주얼리 업계에서 실제로 일하는 사람 한 명을 세웁니다. 가상의 인물이지만 하는 일과 제약은 현실적이어야 합니다.

이 사람이 쓸 도구: ${purpose}

조건
- 그 도구의 목적에 정말 맞는 사람이어야 합니다. 경쟁사를 못 대는 사람에게 경쟁사 모드를 주지 마세요.
- 나라·브랜드 규모·가격대를 구체적으로. "럭셔리 브랜드" 말고 어떤 가격대의 어떤 고객인지.
- successLooksLike 는 나중에 결과를 채점하는 잣대가 됩니다. 취향이 아니라 확인 가능한 것으로 쓰세요.
- params 는 그 사람이 화면에서 실제로 고를 값입니다. 위 스키마에 있는 칸만 채우세요.
  · countries 는 1개만 (조사 시간이 지역 수만큼 늘어납니다)
  · designCount 는 이 실행에서 감당할 만한 수로. 10 이 기본입니다.
  · ${mode === 'competitor' ? 'competitors 에 그 사람 시장의 실존 브랜드 3~4곳을 넣으세요.' : 'competitors 는 빈 배열입니다.'}
  · ${mode === 'collection' ? 'direction 에 키워드나 짧은 이야기를 넣고, items 에 품목 2~3개를 고르세요.' : 'itemType 에 품목 하나를 고르고, items 는 빈 배열로 두세요.'}
- 모든 글은 한국어로. 인명·브랜드명은 원어를 써도 됩니다.`,
  })
  made[mode] = data
  console.log(`${data.name} · ${data.country} · ${data.role}`)
}

writeFileSync(join(OUT, 'persona3.json'), JSON.stringify(made, null, 1))

/* 실행 설정으로 옮긴다 · make-sample.mts 가 먹는 형태 */
for (const [mode, p] of Object.entries(made)) {
  const q = p.params
  const cfg = {
    name: `run3_${mode}`,
    persona: { id: mode, name: p.name, country: p.country, role: p.role,
      situation: p.situation, goal: p.goal, successLooksLike: p.successLooksLike,
      brandContext: p.brandContext },
    params: {
      algo: 2, mode,
      countries: q.countries.slice(0, 1),
      analysisLang: q.analysisLang,
      direction: q.direction,
      itemType: mode === 'collection' ? 'ring' : q.itemType,
      items: mode === 'collection' ? q.items : [],
      designCount: q.designCount,
      setCount: q.setCount,
      target: { ages: q.ages, gender: q.gender },
      competitors: mode === 'competitor' ? q.competitors : [],
      imageEngine: q.imageEngine,
    },
  }
  writeFileSync(join(CFG, `run3_${mode}.cfg.json`), JSON.stringify(cfg, null, 1))
}

console.log('\n→ .personaqa/persona3.json · .sampleruns/run3_*.cfg.json')
for (const [mode, p] of Object.entries(made)) {
  const q = p.params
  const n = mode === 'collection' ? q.setCount * q.items.length : q.designCount
  console.log(`  ${mode.padEnd(12)} ${q.countries[0]} · ${mode === 'collection' ? q.items.join(',') : q.itemType} · 디자인 ${n}장${mode === 'competitor' ? ` · 경쟁사 ${q.competitors.length}곳` : ''}`)
}
