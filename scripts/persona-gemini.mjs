/* Gemini 로 만드는 테스터 패널 · 20개국 20명.
   먼저 GPT 로 만든 패널(persona-qa.mjs)과 생성 모델을 갈라 둔다 — 한 모델이 만든 사용자상만으로
   검증하면 그 모델의 편향까지 함께 검증을 통과해 버린다.

   personas : 20명 생성 → .personaqa/gemini-personas.json
   configs  : 실행 설정으로 변환 → .sampleruns/gpersona_*.cfg.json
   실행: node scripts/persona-gemini.mjs <personas|configs> [--count N] */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

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
const KEY = env().GEMINI_API_KEY || env().GOOGLE_API_KEY
if (!KEY) { console.error('GEMINI_API_KEY 없음'); process.exit(1) }

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
// 계정에서 실제로 조회되는 모델만 (2.5-pro 는 신규 사용자에게 닫혔다)
const MODELS = ['gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3-flash-preview']

/* 화면이 실제로 주는 선택지 · 벗어나면 실행이 안 된다 */
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

const SCHEMA = {
  type: 'object',
  required: ['personas'],
  properties: {
    personas: {
      // 개수는 스키마로 강제하지 않는다 · minItems 20 과 이 크기의 중첩 객체를 함께 주면
      // Gemini 가 400 을 준다(2개로 줄이면 통과 — 제약 복잡도 한도). 개수는 코드에서 검증한다.
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'country', 'role', 'brandContext', 'situation', 'goal', 'successLooksLike', 'params'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          country: { type: 'string' },
          role: { type: 'string' },
          brandContext: { type: 'string' },
          situation: { type: 'string', description: '지금 왜 이 도구를 여는가 · 마감·상사·시즌 같은 실제 상황' },
          goal: { type: 'string' },
          successLooksLike: { type: 'string' },
          params: {
            type: 'object',
            required: ['mode', 'countries', 'analysisLang', 'direction', 'itemType', 'items',
              'designCount', 'setCount', 'ages', 'gender', 'competitors'],
            properties: {
              mode: { type: 'string', enum: CHOICES.mode },
              countries: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', enum: CHOICES.regions } },
              analysisLang: { type: 'string', enum: CHOICES.analysisLang },
              direction: { type: 'string' },
              itemType: { type: 'string', enum: CHOICES.itemType },
              items: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', enum: CHOICES.itemType } },
              // Gemini 는 enum 을 문자열로만 받는다 · configs 단계에서 숫자로 되돌린다
              designCount: { type: 'string', enum: CHOICES.designCount.map(String) },
              setCount: { type: 'string', enum: CHOICES.setCount.map(String) },
              ages: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: CHOICES.ages } },
              gender: { type: 'string', enum: CHOICES.gender },
              competitors: { type: 'array', maxItems: 4, items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
}

async function gemini(input, schema) {
  let lastErr = null
  for (const model of MODELS) {
    try {
      const r = await fetch(`${BASE}/models/${model}:generateContent?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.9 },
        }),
      })
      if (!r.ok) { lastErr = new Error(`${model} ${r.status}: ${(await r.text()).slice(0, 120)}`); continue }
      const j = await r.json()
      const text = j?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) { lastErr = new Error(`${model} 응답 비어 있음`); continue }
      return { data: JSON.parse(text), model }
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

async function personas() {
  const input = `주얼리 기획·디자인 AI 도구를 테스트할 사용자 20명을 만듭니다. 당신이 만든 20명이 실제로 이 도구를 돌리고, 결과가 자기 요구를 채웠는지 평가하게 됩니다.

도구 설명(화면에 적힌 그대로):
 · competitor(경쟁사 트렌드): 경쟁사와 검색 지역들의 편집샵을 크롤링하고, 조사 방향대로 트렌드 리포트를 만든 뒤, 트렌드 적합 순으로 뽑은 레퍼런스에서 디자인합니다.
 · fashion(패션 트렌드): 시즌 런웨이와 리테일 확산을 읽고, 패션 룩을 주얼리 언어로 번역해 패션 레퍼런스에서 디자인합니다.
 · collection(주얼리 컬렉션): 키워드·스토리를 조사해 디자인 언어로 추상화하고, 고른 품목들이 하나의 Design DNA 를 공유하는 주얼리 세트를 만듭니다.

규칙:
1. 20명 전원 다른 나라. 주요 시장을 고루: 한국·일본·중국·인도·태국·베트남·미국·캐나다·브라질·멕시코·영국·프랑스·이탈리아·독일·스페인·터키·UAE·사우디·나이지리아·호주 같은 폭으로.
2. 직군을 흩을 것: 브랜드 인하우스, 독립 공방, 리테일 MD, 웨딩, 남성 주얼리, 파인/하이, 패스트 패션 액세서리, 이커머스, 학생 창업, 컨설턴트.
3. 세 mode 가 최소 6명씩. analysisLang 6종이 모두 등장. 지역·품목·수량·나이대·성별 고루.
4. situation 은 그 사람이 오늘 이 도구를 연 이유 — 마감, 상사 지시, 시즌 준비, 투자 미팅 같은 구체 상황.
5. direction 은 그 사람이 입력창에 실제로 칠 문장. 재료·형태·가격대·착용 상황 중 둘 이상이 들어간 구체 문장. 그 나라 통화·시장 맥락이 보이면 좋습니다.
6. competitors 는 competitor 모드만, 그 나라에 실재하는 브랜드로. 실재를 확신 못 하면 세계구 브랜드(Pandora, Swarovski 등)를 쓰세요.
7. successLooksLike 는 나중에 결과를 채점할 기준 — "무엇이 보이면 합격인지" 검증 가능한 문장으로.

params 의 모든 값은 위 스키마의 enum 안에서만 고르세요.`
  const { data, model } = await gemini(input, SCHEMA)
  const p = data.personas ?? []
  if (p.length < 18) throw new Error(`20명을 요구했는데 ${p.length}명만 왔다 — 다시 돌리세요`)
  writeFileSync(join(OUT, 'gemini-personas.json'), JSON.stringify(data, null, 1))
  const byMode = {}
  for (const x of p) byMode[x.params.mode] = (byMode[x.params.mode] ?? 0) + 1
  console.log(`Gemini(${model}) · ${p.length}명 · 나라 ${new Set(p.map(x => x.country)).size} · 모드 ${JSON.stringify(byMode)} · 언어 ${[...new Set(p.map(x => x.params.analysisLang))].sort().join(',')}`)
}

function configs() {
  const args = process.argv.slice(3)
  const capIdx = args.indexOf('--count')
  const cap = capIdx >= 0 ? Number(args[capIdx + 1]) : null
  const { personas: all } = JSON.parse(readFileSync(join(OUT, 'gemini-personas.json'), 'utf8'))
  const dir = join(ROOT, '.sampleruns')
  const slug = (s) => s.normalize('NFKD').replace(/[^\w]+/g, '').toLowerCase().slice(0, 12) || 'x'
  let n = 0
  for (const p of all) {
    const q = p.params
    const name = `gpersona_${q.mode}_${slug(p.country)}`
    writeFileSync(join(dir, `${name}.cfg.json`), JSON.stringify({
      name,
      sampleTitle: `${p.name} (${p.country}) · ${q.mode}`,
      persona: { id: p.id, name: p.name, country: p.country, role: p.role,
        situation: p.situation, goal: p.goal, successLooksLike: p.successLooksLike },
      params: {
        algo: 2, mode: q.mode, countries: q.countries, analysisLang: q.analysisLang,
        direction: q.direction, itemType: q.itemType,
        items: q.mode === 'collection' ? q.items : [q.itemType],
        designCount: cap ?? Number(q.designCount), setCount: Number(q.setCount),
        target: { ages: q.ages, gender: q.gender },
        competitors: q.mode === 'competitor' ? q.competitors : [],
        imageEngine: 'fast',
      },
    }, null, 1))
    n++
  }
  console.log(`${n}개 설정 · .sampleruns/gpersona_*.cfg.json (designCount ${cap ?? '원래대로'})`)
}

const step = process.argv[2]
if (step === 'personas') await personas()
else if (step === 'configs') configs()
else { console.error('personas | configs'); process.exit(1) }
