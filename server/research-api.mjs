// ── 실제 리서치 — OpenAI Responses API + web_search ───────────────────
// 사용자가 입력한 경쟁사를 실제로 검색해서 최근 제품과 인기 근거를 수집한다.
// 판매 프록시는 여기서 만들지 않는다. 1회 검색으로는 시계열이 성립하지 않기 때문이다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { researchDossier } from './dossier-api.mjs'

export const RESEARCH_MODEL = 'gpt-5'
// 딥리서치 · 계정에서 열리면 .env에 OPENAI_DEEP_RESEARCH=1 을 넣어 켠다.
// 같은 API 키를 쓰며 별도 키가 필요 없다. 모델이 없으면 자동으로 기본 경로로 되돌아간다.
export const DEEP_MODEL_DEFAULT = 'o3-deep-research'
const DEEP_POLL_MS = 10_000
const DEEP_MAX_WAIT_MS = 15 * 60 * 1000

const COMPETITOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['products', 'notes'],
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['brand', 'model_name', 'price_krw', 'released', 'popularity_evidence', 'evidence_strength',
          'rank_note', 'user_sentiment', 'praise_points', 'complaint_points', 'design_traits',
          'image_urls', 'product_url', 'source_urls'],
        properties: {
          brand: { type: 'string' },
          model_name: { type: 'string' },
          price_krw: { type: 'integer', description: '원화 정가. 모르면 0' },
          released: { type: 'string', description: '출시 시점. 모르면 unknown' },
          popularity_evidence: {
            type: 'array', items: { type: 'string' },
            description: '베스트셀러 선정·어워드·품절·재입고 등 관측된 근거. 추측 금지',
          },
          evidence_strength: { type: 'string', enum: ['strong', 'moderate', 'weak', 'none'] },
          rank_note: { type: 'string', description: '판매 순위·랭킹 표기를 확인했으면 그대로 인용. 없으면 빈 문자열' },
          user_sentiment: { type: 'string', enum: ['positive', 'mixed', 'negative', 'unknown'] },
          praise_points: { type: 'array', items: { type: 'string' }, description: '리뷰에서 반복되는 칭찬. 확인한 것만' },
          complaint_points: { type: 'array', items: { type: 'string' }, description: '리뷰에서 반복되는 불만. 확인한 것만' },
          design_traits: { type: 'array', items: { type: 'string' }, description: '눈에 보이는 디자인 특징 (실루엣·소재·컬러·부자재)' },
          image_urls: { type: 'array', items: { type: 'string' }, description: '제품 사진 직링크(.jpg/.png/.webp). 확인한 것만' },
          product_url: { type: 'string', description: '제품 상세 페이지 URL' },
          source_urls: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    notes: { type: 'string', description: '수집 한계와 확인하지 못한 항목' },
  },
}

const TREND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['signals', 'report_perspective', 'notes'],
  properties: {
    signals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'axis', 'attribute', 'direction', 'observed_count', 'evidence', 'source_urls', 'confidence'],
        properties: {
          label: { type: 'string', description: 'Signal name, in the requested output language' },
          axis: { type: 'string', description: 'Attribute axis, in the requested output language (e.g. Toe shape, Sole thickness)' },
          attribute: { type: 'string', description: '영문 속성 키' },
          direction: { type: 'string', enum: ['rising', 'stable', 'declining'] },
          observed_count: { type: 'integer', description: '서로 다른 출처에서 확인된 횟수' },
          evidence: { type: 'array', items: { type: 'string' } },
          source_urls: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    report_perspective: { type: 'string', description: '수집된 자료의 관점·편향' },
    notes: { type: 'string' },
  },
}

// 지시서 14장 · 리포트 문체 규격
const reportStyle = (langName = 'English') => `Write in ${langName}. Style rules:
- No emoji. Do not fall into repeated three-bullet groups. Avoid "the key is", "in conclusion", "not only but also", "it can be said that".
- Vary paragraph length between two and seven sentences. Do not let equal-length paragraphs run in sequence.
- Do not add a summary paragraph at the end.
- No percentages you cannot source. Numbers you observed go in with their source.
- Where you are unsure, say so plainly, as in "seen at three brands, but the sample is too small to call".
- If observations conflict, put both in rather than hiding one.`

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'executive_view', 'body_markdown', 'design_implications', 'open_questions', 'sources'],
  properties: {
    title: { type: 'string' },
    executive_view: { type: 'string', description: '이 시즌에 무엇을 해야 하는지 3~5문장' },
    body_markdown: { type: 'string', description: '## 소제목을 쓴 본문. 관측·해석·반대신호를 포함' },
    design_implications: {
      type: 'array',
      description: '디자인 스펙으로 옮길 수 있는 구체 지침',
      items: {
        type: 'object', additionalProperties: false,
        required: ['area', 'guidance', 'basis'],
        properties: {
          area: { type: 'string', description: '실루엣 / 소재 / 컬러 / 부자재 / 비율 등' },
          guidance: { type: 'string' },
          basis: { type: 'string', description: '어떤 관측에서 나왔는지' },
        },
      },
    },
    open_questions: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
  },
}

function cacheDir(root) {
  const d = join(root, '.cache', 'research')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

/** 딥리서치 · 오래 걸리므로 background로 띄우고 폴링한다. 결과는 인용이 붙은 장문 리포트 */
async function deepResearch(apiKey, { input, model, onProgress }) {
  const create = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      input,
      background: true,                       // 수 분 걸리므로 필수
      tools: [{ type: 'web_search_preview' }], // 딥리서치는 데이터 소스 도구가 반드시 있어야 한다
      reasoning: { summary: 'auto' },
    }),
  })
  if (!create.ok) {
    const body = await create.text()
    const err = new Error(`deep research ${create.status}: ${body.slice(0, 200)}`)
    err.status = create.status
    throw err
  }
  let job = await create.json()
  const started = Date.now()
  while (job.status === 'queued' || job.status === 'in_progress') {
    if (Date.now() - started > DEEP_MAX_WAIT_MS) throw new Error('딥리서치 시간 초과')
    await new Promise(r => setTimeout(r, DEEP_POLL_MS))
    const poll = await fetch(`https://api.openai.com/v1/responses/${job.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!poll.ok) throw new Error(`deep research poll ${poll.status}`)
    job = await poll.json()
    onProgress?.(job.status, Math.round((Date.now() - started) / 1000))
  }
  if (job.status !== 'completed') throw new Error(`딥리서치 실패: ${job.status}`)
  const msg = (job.output ?? []).find(o => o.type === 'message')
  const text = msg?.content?.[0]?.text ?? ''
  const searches = (job.output ?? []).filter(o => o.type === 'web_search_call').length
  const citations = (msg?.content?.[0]?.annotations ?? [])
    .filter(a => a.type === 'url_citation').map(a => a.url)
  return { text, searches, citations, elapsedSec: Math.round((Date.now() - started) / 1000) }
}

// 웹 검색이 붙은 호출은 기본 헤더 타임아웃(5분)을 넘길 수 있다.
// Node 기본 dispatcher를 그대로 두면 조용히 끊기므로 상한을 크게 잡는다.
// 주의: Node 내장 fetch에 별도 설치한 undici의 Agent를 넘기면 즉시 실패한다.
// 둘은 서로 다른 인스턴스라, dispatcher를 쓰려면 fetch도 같은 패키지 것을 써야 한다.
let longFetch = fetch
try {
  const { Agent, fetch: undiciFetch } = await import('undici')
  const agent = new Agent({ headersTimeout: 20 * 60_000, bodyTimeout: 20 * 60_000, connectTimeout: 30_000 })
  longFetch = (url, init = {}) => undiciFetch(url, { ...init, dispatcher: agent })
} catch { /* undici가 없으면 내장 fetch로 진행한다 */ }

async function ask(apiKey, { input, schema, name }) {
  const r = await longFetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: RESEARCH_MODEL,
      tools: [{ type: 'web_search' }],
      // 비용보다 결과를 우선한다 · 추론 강도를 최고로 둔다
      reasoning: { effort: 'high' },
      input,
      text: { format: { type: 'json_schema', name, schema, strict: true } },
    }),
  })
  if (!r.ok) throw new Error(`OpenAI research ${r.status}: ${(await r.text()).slice(0, 400)}`)
  const j = await r.json()
  const msg = j.output?.find(o => o.type === 'message')
  const text = msg?.content?.[0]?.text
  if (!text) throw new Error('리서치 응답이 비어 있습니다')
  const searches = (j.output ?? []).filter(o => o.type === 'web_search_call').length
  return { data: JSON.parse(text), searches }
}

/** 브랜드가 여러 곳이면 한 번에 묶지 않고 브랜드별로 나눠 병렬로 돈다.
 *  한 요청이 커지면 상류 연결이 먼저 끊기고, 한 브랜드 실패가 전체를 날린다. */
export async function researchCompetitors(apiKey, root, opts) {
  const { brands = [], categoryKo, typeKo, priceMin, priceMax, langName = 'English' } = opts
  const key = createHash('sha256').update(JSON.stringify(['comp4', langName, brands, categoryKo, typeKo, priceMin, priceMax])).digest('hex').slice(0, 24)
  const file = join(cacheDir(root), `${key}.json`)
  if (existsSync(file)) return { ...JSON.parse(readFileSync(file, 'utf8')), cached: true }

  const results = await Promise.allSettled(
    brands.map(b => researchOneBrand(apiKey, root, { ...opts, brand: b , langName })),
  )
  const products = []
  const notes = []
  let searches = 0
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      products.push(...r.value.products)
      searches += r.value.searches || 0
      if (r.value.notes) notes.push(`${brands[i]}: ${r.value.notes}`)
    } else {
      notes.push(`${brands[i]}: 수집 실패 (${String(r.reason?.message || r.reason).slice(0, 80)})`)
    }
  })
  const out = { products, notes: notes.join(' / '), searches, collected_at: new Date().toISOString().slice(0, 10) }
  writeFileSync(file, JSON.stringify(out))
  return { ...out, cached: false }
}

// 화면에는 영문으로 노출하지만, 국내 검색은 한글 브랜드명이 훨씬 잘 걸린다.
// 캐시 키도 정규화한 이름으로 잡아 같은 조사를 두 번 돌리지 않는다.
const BRAND_ALIAS = {
  'nike': '나이키', 'adidas': '아디다스', 'asics': '아식스',
  'new balance': '뉴발란스', 'newbalance': '뉴발란스', 'hoka': '호카',
  'tiffany': '티파니', 'tiffany & co.': '티파니', 'cartier': '까르띠에',
  'pandora': '판도라', 'swarovski': '스와로브스키',
}
function canonBrand(b) { return BRAND_ALIAS[String(b).trim().toLowerCase()] ?? b }

// 카테고리·품목도 마찬가지다. 화면은 영문, 검색은 한글.
const TERM_ALIAS = {
  footwear: '신발', shoe: '신발', shoes: '신발', jewelry: '주얼리', jewellery: '주얼리',
  loafer: '로퍼', derby: '더비 슈즈', oxford: '옥스퍼드 슈즈', 'monk strap': '몽크스트랩 슈즈',
  sneaker: '스니커즈', sneakers: '스니커즈', pump: '펌프스', slingback: '슬링백',
  ballet: '발레 플랫', 'driving shoe': '드라이빙 슈즈', 'ankle boot': '앵클 부츠', chelsea: '첼시 부츠',
  sandal: '샌들', slide: '슬라이드', stud: '스터드 귀걸이', hoop: '후프 귀걸이',
  pendant: '펜던트 목걸이', 'tennis necklace': '테니스 목걸이', bangle: '뱅글', cuff: '커프',
  'signet ring': '시그넷 링', 'solitaire ring': '솔리테어 링',
}
function canonTerm(t) { return TERM_ALIAS[String(t).trim().toLowerCase()] ?? t }

async function researchOneBrand(apiKey, root, { brand: rawBrand, categoryKo: rawCat, typeKo: rawType, priceMin, priceMax, langName = 'English' }) {
  const LANG = langName
  const brand = canonBrand(rawBrand)
  const categoryKo = canonTerm(rawCat)
  const typeKo = canonTerm(rawType)
  const key = createHash('sha256').update(JSON.stringify(['brand3', langName, brand, categoryKo, typeKo, priceMin, priceMax])).digest('hex').slice(0, 24)
  const file = join(cacheDir(root), `${key}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))

  const input = `당신은 패션 브랜드의 상품기획 리서처입니다. 웹 검색으로 사실만 수집하세요.

대상 브랜드: ${brand}
품목: ${categoryKo} / ${typeKo}
자사 가격 밴드: ${priceMin.toLocaleString()}원 ~ ${priceMax.toLocaleString()}원

이 브랜드에서 최근 출시되었거나 현재 잘 팔리는 ${typeKo} 모델을 2~3개만 찾아주세요.
브랜드 공식몰의 베스트셀러·랭킹 페이지와 리뷰를 함께 확인하세요. 검색은 8회 이내로 끝내세요.

읽기 규칙 (반드시 지킬 것):
- 화살표와 대시를 문장 연결에 쓰지 않는다. "->", "→", "—", " - " 금지. 문장으로 풀어 쓴다.
  나쁨: "실버 하드웨어 -> 청키 체인 확대"
  좋음: "실버 하드웨어가 자리를 잡으면서 청키 체인으로 넓어진다."
- 개조식 나열 대신 완결된 문장을 쓴다. 각 문장은 주어와 서술어를 갖춘다.
- 항목 이름 뒤에 콜론을 붙여 설명을 잇지 않는다. 이름과 설명은 별개 필드다.
- 괄호 안에 출처 URL을 늘어놓지 않는다. 출처는 source_url 필드에만 넣는다.
- 한 문장은 60자 안팎으로 끊는다. 쉼표로 세 번 이상 잇지 않는다.


규칙:
- 실제로 검색해서 확인한 것만 적습니다. 확인하지 못한 값은 지어내지 마세요.
- price_krw는 한국 정가를 확인한 경우에만 넣고, 모르면 0으로 둡니다.
- popularity_evidence에는 "베스트셀러 선정", "OO 어워드 수상", "품절", "재입고" 처럼 출처에서 확인된 사실만 적습니다. 판매량 추정치를 지어내지 마세요.
- rank_note에는 "여성 러닝화 랭킹 3위" 처럼 사이트에 표기된 순위를 그대로 옮깁니다. 없으면 빈 문자열.
- user_sentiment / praise_points / complaint_points는 실제 리뷰를 읽고 반복되는 내용만 적습니다. 리뷰를 못 찾으면 unknown과 빈 배열로 둡니다.
- design_traits에는 사진과 상세 설명에서 확인되는 디자인 특징을 적습니다 (예: "두꺼운 EVA 미드솔", "메시 갑피에 TPU 오버레이").
- image_urls에는 제품 사진의 직접 링크만 넣습니다. 페이지 주소가 아니라 이미지 파일 주소여야 합니다. 확실하지 않으면 빈 배열로 둡니다.
- product_url에는 제품 상세 페이지 주소를 넣습니다.
- In notes, list what you could not confirm and the limits of this pass. Write it in ${LANG}.
- Search in Korean where that finds more, but every string you output must be written in ${LANG}. Keep brand and model names as they are officially written.`

  const { data, searches } = await ask(apiKey, { input, schema: COMPETITOR_SCHEMA, name: 'competitor_research' })
  const out = { ...data, searches }
  writeFileSync(file, JSON.stringify(out))
  return out
}

export async function researchTrends(apiKey, root, {
  categoryKo: rawCat, typeKo: rawType, brands: rawBrands, season, priceBandKo, deep, deepModel, wantReport = true, depth = 4, onStep,
  langName = 'English',
}) {
  const LANG = langName
  const categoryKo = canonTerm(rawCat)
  const typeKo = canonTerm(rawType)
  const brands = (rawBrands ?? []).map(canonBrand)
  const useDeep = !!deep
  const key = createHash('sha256').update(JSON.stringify([
    'trend5', LANG, categoryKo, typeKo, brands ?? [], season, priceBandKo ?? '',
    useDeep ? 'deep' : wantReport ? `multi${depth}` : 'fast',
  ])).digest('hex').slice(0, 24)
  const file = join(cacheDir(root), `${key}.json`)
  if (existsSync(file)) return { ...JSON.parse(readFileSync(file, 'utf8')), cached: true }

  const input = `당신은 패션 브랜드의 트렌드 리서처입니다. 웹 검색으로 사실만 수집하세요.

품목: ${categoryKo} / ${typeKo}
시즌: ${season}
${brands?.length ? `참고 브랜드: ${brands.join(', ')}` : ''}

이 품목의 디자인 트렌드 신호를 5~7개 찾아주세요. 신호는 "무엇이 어떻게 바뀌고 있다"는 관측이어야 하고,
디자인 스펙으로 옮길 수 있을 만큼 구체적이어야 합니다. (예: 토 셰이프, 솔 두께, 힐 높이 밴드, 소재, 클로저, 하드웨어)

규칙:
- 실제로 검색해서 확인한 것만 적습니다. 확인하지 못한 것은 넣지 마세요.
- observed_count는 서로 다른 출처에서 확인된 횟수입니다. 부풀리지 마세요.
- confidence는 출처가 3곳 이상이면 high, 1곳이면 low로 둡니다.
- label과 axis는 반드시 ${LANG}로 씁니다. attribute만 영어 snake_case로 두세요 (기계가 쓰는 키라서 언어를 타면 안 됩니다).
- 아래 예시는 영어로 적혀 있지만, 실제 출력은 ${LANG}로 씁니다.
- In report_perspective, say which market and viewpoint the material leans towards.
- Search in Korean where that finds more, but every string you output must be written in ${LANG}.
- 신호는 반드시 '제품에서 관측된 디자인 속성'이어야 합니다. 실제 판매 중인 제품 페이지·리뷰·기사에서 본 형태, 소재, 부자재, 비율, 컬러를 적으세요.
- 데이터가 없다거나 확인이 어렵다는 서술은 신호가 아닙니다. 그런 내용은 notes에만 적고 signals에는 절대 넣지 마세요.
- label은 디자인 속성 이름이어야 합니다. 좋은 예: 'Square toe', 'Chunky lug sole', 'Low block heel 25-35mm', 'Suede upper', 'Elastic gore closure', 'Metal hardware accent'.
- 나쁜 예(넣지 말 것): 'No quantified shares', 'Access constraints', 'Data not available', 'GTM requirement'.
- 정량 통계를 못 찾더라도, 개별 제품에서 반복 관측되는 속성이면 confidence를 low로 두고 신호로 올리세요.`

  // 딥리서치 모델이 없어도 상세 보고서가 나오도록, 조사를 여러 단계로 쪼갠다.
  // ① 하위 질문 설계 → ② 질문별 개별 검색 → ③ 종합 보고서 → ④ 스키마 정리
  if (!useDeep && wantReport) {
    const planned = await ask(apiKey, {
      input: `${categoryKo} / ${typeKo} · ${season} · 가격대 ${priceBandKo ?? '미지정'} 의 디자인 트렌드를 조사하려 합니다.
서로 겹치지 않는 조사 하위 질문 ${depth}개를 만드세요. 각 질문은 웹에서 사실로 확인 가능한 것이어야 하고,
디자인 스펙(실루엣·소재·부자재·컬러·비율)으로 옮길 수 있는 답이 나오는 질문이어야 합니다.`,
      schema: {
        type: 'object', additionalProperties: false, required: ['questions'],
        properties: { questions: { type: 'array', items: { type: 'string' } } },
      },
      name: 'research_plan',
    })
    const qs = (planned.data.questions ?? []).slice(0, depth)
    onStep?.(`하위 질문 ${qs.length}개 설계 완료`)

    // 하위 질문은 서로 독립이므로 병렬로 돈다. 순차로 하면 5배 느리다.
    let totalSearch = planned.searches
    const settled = await Promise.allSettled(qs.map(q => ask(apiKey, {
      input: `웹 검색으로 다음 질문에 답하세요. 확인한 사실만 쓰고 출처 URL을 함께 남기세요.
검색은 4회 이내로 끝내세요. 이미 아는 사실은 다시 검색하지 마세요.
대상: ${categoryKo} / ${typeKo} · ${season} · 가격대 ${priceBandKo ?? '미지정'}
질문: ${q}`,
      schema: {
        type: 'object', additionalProperties: false, required: ['answer', 'facts', 'sources'],
        properties: {
          answer: { type: 'string' },
          facts: { type: 'array', items: { type: 'string' } },
          sources: { type: 'array', items: { type: 'string' } },
        },
      },
      name: 'sub_finding',
    })))
    const findings = []
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        totalSearch += r.value.searches
        findings.push({ q: qs[i], ...r.value.data })
      }
    })
    onStep?.(`조사 ${findings.length}/${qs.length}건 완료 · 종합 보고서 작성 중`)

    const digest = findings.map((f, i) =>
      `[Q${i + 1}] ${f.q}\n답: ${f.answer}\n사실: ${(f.facts ?? []).join(' / ')}\n출처: ${(f.sources ?? []).join(', ')}`
    ).join('\n\n')

    const rep = await ask(apiKey, {
      input: `아래 조사 결과만 근거로 ${categoryKo} / ${typeKo} (${season}, 가격대 ${priceBandKo ?? '미지정'}) 트렌드 trend report written in ${LANG}, using only the research below.

${reportStyle(LANG)}

--- 조사 결과 ---
${digest}
--- 끝 ---`,
      schema: REPORT_SCHEMA, name: 'trend_report',
    })
    totalSearch += rep.searches

    const structured = await ask(apiKey, {
      input: `아래 보고서에 적힌 내용만 사용해 신호 스키마로 정리하세요. 없는 내용을 만들지 마세요.

${rep.data.body_markdown}

인용 가능한 출처: ${findings.flatMap(f => f.sources ?? []).slice(0, 40).join(', ')}`,
      schema: TREND_SCHEMA, name: 'trend_research',
    })

    const out = {
      ...structured.data,
      searches: totalSearch,
      engine: 'multi',
      report: rep.data,
      sub_questions: qs,
      collected_at: new Date().toISOString().slice(0, 10),
    }
    writeFileSync(file, JSON.stringify(out))
    return { ...out, cached: false }
  }

  // 딥리서치가 열려 있으면 먼저 장문 리포트를 만들고, 그 리포트를 구조화한다.
  // 조사와 문장화를 분리하면 근거가 잘리지 않고 스키마에 담긴다.
  if (useDeep) {
    try {
      const dr = await deepResearch(apiKey, { input, model: deepModel || DEEP_MODEL_DEFAULT })
      const { data } = await ask(apiKey, {
        input: `아래는 웹 리서치로 작성된 조사 리포트입니다. 이 리포트에 적힌 내용만 사용해 스키마로 정리하세요.
없는 내용을 추가하지 말고, source_urls에는 리포트에 인용된 URL만 넣으세요.

--- 리포트 시작 ---
${dr.text.slice(0, 120_000)}
--- 리포트 끝 ---

참고 인용 URL: ${dr.citations.slice(0, 40).join(', ')}`,
        schema: TREND_SCHEMA, name: 'trend_research',
      })
      const out = {
        ...data, searches: dr.searches, engine: 'deep', elapsed_sec: dr.elapsedSec,
        report: dr.text.slice(0, 20_000),
        collected_at: new Date().toISOString().slice(0, 10),
      }
      writeFileSync(file, JSON.stringify(out))
      return { ...out, cached: false }
    } catch (e) {
      // 모델 미개방(404) 등은 조용히 기본 경로로 되돌린다
      const fellBack = `딥리서치 사용 불가로 기본 검색으로 진행: ${String(e.message).slice(0, 120)}`
      const { data, searches } = await ask(apiKey, { input, schema: TREND_SCHEMA, name: 'trend_research' })
      const out = { ...data, searches, engine: 'fast', fallback_reason: fellBack, collected_at: new Date().toISOString().slice(0, 10) }
      writeFileSync(file, JSON.stringify(out))
      return { ...out, cached: false }
    }
  }

  const { data, searches } = await ask(apiKey, { input, schema: TREND_SCHEMA, name: 'trend_research' })
  const out = { ...data, searches, engine: 'fast', collected_at: new Date().toISOString().slice(0, 10) }
  writeFileSync(file, JSON.stringify(out))
  return { ...out, cached: false }
}


/** 시즌 도시에 · MICAM 형식. ask()를 주입해 dossier-api가 같은 검색 경로를 쓰게 한다. */
export async function researchSeasonDossier(apiKey, root, opts) {
  return researchDossier({ ask: (a) => ask(apiKey, a) }, root, opts)
}
