/* 페르소나 QA · 각국 디자이너 20명이 이 도구를 쓴다고 두고, 서로 다른 설정으로
   돌린 결과를 그들의 눈으로 평가·토론하게 한다.

   왜 이렇게 하나
     혼자 만든 사람은 자기 기준으로만 본다. 나라·직군·목표가 다른 사용자를 세워 두면
     "입력이 결과에 정말 반영됐는가", "이 결과로 무엇을 할 수 있는가" 를 다른 각도에서 묻게 된다.

   단계 (인자로 고른다)
     personas   20명과 각자의 실행 설정을 만든다        → .personaqa/personas.json
     pick       대표 6개(유형별 2개)를 고른다            → .personaqa/picked.json
     evaluate   실제 실행 결과를 페르소나들이 평가한다   → .personaqa/reviews.json
     debate     평가를 놓고 토론하고 공통 개선점을 뽑는다 → .personaqa/verdict.json

   실행: node scripts/persona-qa.mjs <단계>
   조사 모델을 그대로 쓴다(server/research-api.mjs) — 키는 .env 에서만 읽는다. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { ask } from '../server/research-api.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const OUT = join(ROOT, '.personaqa')
mkdirSync(OUT, { recursive: true })

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

const save = (name, obj) => {
  writeFileSync(join(OUT, name), JSON.stringify(obj, null, 1))
  console.log('→ .personaqa/' + name)
}
const load = (name) => JSON.parse(readFileSync(join(OUT, name), 'utf8'))

/* 화면이 실제로 주는 선택지 · 여기서 벗어난 값이 나오면 QA 가 무의미해진다 */
const CHOICES = {
  mode: ['competitor', 'fashion', 'collection'],
  regions: ['Korea', 'Japan', 'Europe', 'Asia', 'Middle East', 'United States'],
  analysisLang: ['ko', 'ja', 'en', 'zh', 'fr', 'it'],
  itemType: ['ring', 'earrings', 'necklace', 'pendant', 'bracelet'],
  designCount: [10, 20, 30, 40],
  setCount: [2, 3, 4, 5],
  ages: ['18-21', '22-25', '26-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-64', '65+'],
  gender: ['female', 'male', 'unisex'],
}

const PERSONA_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['personas'],
  properties: {
    personas: {
      type: 'array', minItems: 20, maxItems: 20,
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'name', 'country', 'role', 'brandContext', 'goal', 'successLooksLike', 'params'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          country: { type: 'string' },
          role: { type: 'string', description: '직군과 연차 · 예: 상업 주얼리 MD 8년차' },
          brandContext: { type: 'string', description: '어떤 브랜드/조직에서 무엇을 파는가' },
          goal: { type: 'string', description: '이 도구로 이번에 얻고 싶은 것' },
          successLooksLike: { type: 'string', description: '무엇이 나와야 성공이라고 볼지 · 구체적으로' },
          params: {
            type: 'object', additionalProperties: false,
            required: ['mode', 'countries', 'analysisLang', 'direction', 'itemType', 'items',
              'designCount', 'setCount', 'ages', 'gender', 'competitors'],
            properties: {
              mode: { type: 'string', enum: CHOICES.mode },
              countries: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', enum: CHOICES.regions } },
              analysisLang: { type: 'string', enum: CHOICES.analysisLang },
              direction: { type: 'string', description: '조사 방향 또는 컬렉션 키워드·스토리 · 그 사람 말투로' },
              itemType: { type: 'string', enum: CHOICES.itemType },
              items: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', enum: CHOICES.itemType } },
              designCount: { type: 'integer', enum: CHOICES.designCount },
              setCount: { type: 'integer', enum: CHOICES.setCount },
              ages: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: CHOICES.ages } },
              gender: { type: 'string', enum: CHOICES.gender },
              competitors: { type: 'array', maxItems: 4, items: { type: 'string' }, description: 'competitor 모드에서만 채운다 · 그 나라에 실재하는 브랜드' },
            },
          },
        },
      },
    },
  },
}

async function personas() {
  const input = `주얼리 기획·디자인 AI 도구의 사용자 20명을 정의합니다.

도구가 하는 일: 셋 중 하나로 조사하고 그 근거로 디자인을 만듭니다.
 · competitor(경쟁사 트렌드) — 경쟁 브랜드와 편집샵을 크롤링해 트렌드 리포트를 만들고, 그 근거로 디자인
 · fashion(패션 트렌드) — 런웨이와 리테일 확산을 읽어 패션 언어를 주얼리로 번역해 디자인
 · collection(주얼리 컬렉션) — 키워드·스토리를 디자인 언어로 추상화해 한 DNA 를 공유하는 세트를 만듦

요구:
1. 20명은 나라가 서로 달라야 합니다(최소 12개국). 아시아·유럽·중동·북미가 고루 섞이게.
2. 직군도 갈라야 합니다: 대형 브랜드 디자이너, 독립 공방 주인, 리테일 MD, 웨딩 전문, 남성 주얼리, 하이주얼리,
   패션 하우스 액세서리 팀, 이커머스 셀러, 스튜디오 창업 준비생, 브랜드 컨설턴트 등.
3. 각자의 params 는 서로 겹치지 않게 흩어 주세요. 세 모드가 최소 6명씩, 분석 언어 6종이 모두 쓰이게,
   지역·품목·나이대·성별·수량도 골고루.
4. direction 은 그 사람이 실제로 칠 법한 문장으로. 막연한 말("트렌디한 것") 말고,
   재료·형태·가격대·상황 같은 구체가 하나 이상 들어가야 합니다. 그 사람 나라의 시장 맥락이 보이면 더 좋습니다.
5. competitors 는 competitor 모드인 사람만 채우고, 그 나라·그 가격대에 실재하는 브랜드로.
6. successLooksLike 는 나중에 결과를 채점할 기준이 됩니다. "무엇이 보이면 이 조사가 쓸모 있다고 볼지"를
   검증 가능한 형태로 적어 주세요.

지어내지 말아야 할 것: 실재하지 않는 브랜드 이름. 확신이 없으면 그 자리를 비우고 다른 조건을 구체화하세요.`
  const { data } = await ask(KEY, { input, schema: PERSONA_SCHEMA, name: 'personas', web: false })
  save('personas.json', data)
  const p = data.personas
  const byMode = {}
  for (const x of p) byMode[x.params.mode] = (byMode[x.params.mode] ?? 0) + 1
  console.log(`페르소나 ${p.length}명 · 나라 ${new Set(p.map(x => x.country)).size}개 · 모드 ${JSON.stringify(byMode)}`)
  console.log(`언어 ${[...new Set(p.map(x => x.params.analysisLang))].join(',')}`)
}

const PICK_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['picked'],
  properties: {
    picked: {
      type: 'array', minItems: 6, maxItems: 6,
      items: {
        type: 'object', additionalProperties: false,
        required: ['personaId', 'why'],
        properties: { personaId: { type: 'string' }, why: { type: 'string' } },
      },
    },
  },
}

async function pick() {
  const { personas: all } = load('personas.json')
  const brief = all.map(p => ({
    id: p.id, country: p.country, role: p.role, goal: p.goal,
    mode: p.params.mode, lang: p.params.analysisLang, regions: p.params.countries,
    item: p.params.itemType, direction: p.params.direction,
  }))
  const input = `아래 20명 중 6명을 고릅니다. 이들의 설정으로 실제 조사를 돌려 도구를 검증할 것입니다.

규칙
 · 모드마다 정확히 2명 (competitor 2, fashion 2, collection 2)
 · 6명의 분석 언어가 최대한 다르게 (같은 언어 두 번은 피할 것)
 · 지역·품목도 겹치지 않게
 · 서로 성격이 다른 요구를 골라 도구의 넓은 면이 드러나게 (쉬운 것만 고르지 말 것)

후보:
${JSON.stringify(brief, null, 1)}`
  const { data } = await ask(KEY, { input, schema: PICK_SCHEMA, name: 'pick', web: false })
  const map = new Map(all.map(p => [p.id, p]))
  const picked = data.picked.map(x => ({ ...map.get(x.personaId), why: x.why })).filter(p => p.id)
  save('picked.json', { picked })
  for (const p of picked) console.log(`  ${p.params.mode.padEnd(11)} ${p.params.analysisLang}  ${p.country.padEnd(12)} ${p.name} · ${p.params.itemType}`)
}

const step = process.argv[2]
if (step === 'personas') await personas()
else if (step === 'pick') await pick()
else { console.error('단계를 고르세요: personas | pick | evaluate | debate'); process.exit(1) }
