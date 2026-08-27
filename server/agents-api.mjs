// ── 3-에이전트 조사·프롬프트 계층 ────────────────────────────────────
// 경쟁사 트렌드 / 패션 트렌드 / 주얼리 컬렉션 세 에이전트가 쓰는 서버 호출 전부.
// 웹 검색·정리는 research-api 의 ask() 를 그대로 쓰고, 레퍼런스 이미지 판독만
// 비전 호출(askVision)을 따로 둔다.
//
// 원칙 · 조사는 "확인한 것만". 가격·순위·판매량은 출처가 그렇게 말할 때만 그 말로 적고,
// 노출순위를 판매순위로 바꿔 말하지 않는다. 모든 항목에 출처 URL 을 남긴다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ask } from './research-api.mjs'
import { grabImage } from './grab.mjs'
import { tidyDeep } from './tidy.mjs'

const VISION_MODEL = 'gpt-5'

function cacheDir(root) {
  const d = join(root, '.cache', 'research')
  mkdirSync(d, { recursive: true })
  return d
}
function keyOf(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)
}
// 캐시에는 모델이 준 그대로 담고, **내보낼 때** 문장을 다듬는다.
// 그래야 다듬는 규칙을 고쳐도 조사를 다시 돌리지 않아도 된다.
function cached(root, key) {
  const f = join(cacheDir(root), `${key}.json`)
  if (!existsSync(f)) return null
  return { ...tidyDeep(JSON.parse(readFileSync(f, 'utf8'))), cached: true }
}
function save(root, key, data) {
  writeFileSync(join(cacheDir(root), `${key}.json`), JSON.stringify(data))
  return { ...tidyDeep(data), cached: false }
}

// ── 공통 언어 지시 · 분석 언어 6종 ───────────────────────────────────
// 기호 규칙을 여기 둔 이유 · 놔두면 모델이 대시를 문장 부호로, 화살표를 순서 표시로 쓴다.
// 사람이 쓴 글로 안 읽힌다. 규칙만으로는 종종 어기므로 server/tidy.mjs 가 뒤에서 한 번 더 거른다.
const LANG_RULE = (lang) => `모든 출력 문장은 반드시 ${lang} 로 씁니다. 브랜드명·컬렉션명·제품명 고유명사는 원문 그대로 둡니다.
문장 부호로 em 대시(—), en 대시(–), 화살표(→, ->)를 쓰지 마세요. 범위는 물결표(~), 나열은 쉼표나 가운뎃점(·)을 쓰고, 순서나 변화는 말로 풀어 씁니다("A에서 B로"). 줄 앞에 '- ' 같은 불릿 기호를 붙이지 마세요.`

// ════════════════════════════════════════════════════════════════════
// 1) 경쟁사 트렌드 · (가) 경쟁사 대표 상품 크롤링
// ════════════════════════════════════════════════════════════════════
const CRAWL_ITEM = {
  type: 'object', additionalProperties: false,
  required: ['name', 'group', 'price', 'currency', 'image_url', 'product_url', 'released_note'],
  properties: {
    name: { type: 'string' },
    group: { type: 'string', enum: ['representative', 'best', 'new'], description: '대표 상품군 / 베스트 / 최신(6개월 이내)' },
    price: { type: 'number', description: '공식 표기 가격 숫자. 확인 못 하면 0' },
    currency: { type: 'string', description: '가격 통화 (KRW, USD, EUR, JPY...). 가격 0이면 빈 문자열' },
    image_url: { type: 'string', description: '제품 사진 이미지 파일 직접 링크. 확실치 않으면 빈 문자열' },
    product_url: { type: 'string' },
    released_note: { type: 'string', description: 'new 그룹일 때 출시 시점 근거 한 줄. 아니면 빈 문자열' },
  },
}

export async function agentCompetitorCrawl(apiKey, root, { brand, itemKo, country, langName, direction = '' }) {
  const key = keyOf(['agc4', brand, itemKo, country, langName])
  const hit = cached(root, key); if (hit) return hit
  const input = `당신은 주얼리 시장 조사원입니다. 웹 검색으로 사실만 수집하세요.

브랜드: ${brand}
품목: ${itemKo} — 이 품목에 해당하는 제품만 수집합니다. 다른 품목은 넣지 마세요.
시장(검색 국가): ${country}
${direction ? `조사 방향 참고: ${direction}` : ''}

이 브랜드의 ${itemKo} 제품을 세 그룹으로 수집하세요.
- representative: 브랜드를 대표하는 상품군 (시그니처·아이코닉 라인)
- best: 공식몰·리테일러가 베스트셀러로 표기한 제품
- new: 최근 6개월 이내 출시로 확인되는 제품

규칙:
- 실제로 검색해 확인한 제품만. 그룹당 20~40개, 전체 60~120개. 확인되는 만큼 최대한 채우되 지어내지는 마세요.
- 표본이 적으면 뒤의 리포트가 "비중" 을 말할 수 없습니다. 한 페이지에서 끝내지 말고
  공식몰 카테고리·리테일러·검색 결과를 여러 쪽 넘겨 가며 모으세요.
- price 는 공식 표기 가격을 통화와 함께. 확인 못 하면 0 / 빈 통화.
- best 는 출처가 "베스트셀러"라고 표기한 경우에만. 노출순위를 베스트로 바꿔 말하지 마세요.
- image_url 은 이미지 파일 직접 주소만. 페이지 주소면 빈 문자열.
- ${LANG_RULE(langName)}`
  const { data, searches } = await ask(apiKey, {
    input,
    schema: {
      type: 'object', additionalProperties: false, required: ['items', 'brand_note', 'sources'],
      properties: {
        items: { type: 'array', items: CRAWL_ITEM },
        brand_note: { type: 'string', description: '이 브랜드의 포지셔닝 한두 문장' },
        sources: { type: 'array', items: { type: 'string' } },
      },
    },
    name: 'competitor_crawl',
  })
  return save(root, key, { brand, ...data, searches })
}

// ── (나) 편집샵 베스트 · 국가 기준 10곳 ───────────────────────────────
export async function agentShops(apiKey, root, { itemKo, country, langName }) {
  const key = keyOf(['ags4', itemKo, country, langName])
  const hit = cached(root, key); if (hit) return hit
  // ① 그 나라에서 실제 접근 가능한 주얼리 편집샵·멀티브랜드 리테일러 10곳
  const picked = await ask(apiKey, {
    input: `${country} 소비자가 실제로 이용하는 주얼리 편집샵·멀티브랜드 리테일러(온라인 포함) 10곳을 웹 검색으로 확인해 고르세요.
실존하는 곳만. 각각 이름과 대표 URL, 한 줄 성격을 적으세요. ${LANG_RULE(langName)}`,
    schema: {
      type: 'object', additionalProperties: false, required: ['shops'],
      properties: {
        shops: {
          type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['name', 'url', 'note'],
            properties: { name: { type: 'string' }, url: { type: 'string' }, note: { type: 'string' } },
          },
        },
      },
    },
    name: 'shop_pick',
  })
  const shops = (picked.data.shops ?? []).slice(0, 10)
  let searches = picked.searches
  // ② 샵별 베스트 수집 · 병렬
  const settled = await Promise.allSettled(shops.map(s => ask(apiKey, {
    input: `웹 검색으로 ${s.name} (${s.url}) 의 ${itemKo} 인기 제품을 수집하세요.
규칙:
- 사이트가 "베스트셀러"나 판매순위를 공개하면 rank_basis 를 'official_best' 로, 순위 표기를 rank_note 에 그대로 적으세요.
- 공개하지 않으면 rank_basis 를 'exposure' 로 두고, 노출·추천 순서라고 정직하게 적으세요. 노출을 판매로 바꿔 말하면 안 됩니다.
- 20~40개. 가격은 표기 통화 그대로. image_url 은 이미지 파일 직접 주소만(아니면 빈 문자열). product_url 은 반드시 실제 상품 페이지 주소.
- ${LANG_RULE(langName)}`,
    schema: {
      type: 'object', additionalProperties: false, required: ['items'],
      properties: {
        items: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            required: ['name', 'brand', 'price', 'currency', 'image_url', 'product_url', 'rank_basis', 'rank_note'],
            properties: {
              name: { type: 'string' }, brand: { type: 'string' },
              price: { type: 'number' }, currency: { type: 'string' },
              image_url: { type: 'string' }, product_url: { type: 'string' },
              rank_basis: { type: 'string', enum: ['official_best', 'exposure'] },
              rank_note: { type: 'string' },
            },
          },
        },
      },
    },
    name: 'shop_best',
  })))
  const out = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') { searches += r.value.searches; out.push({ ...shops[i], items: r.value.data.items ?? [] }) }
    else out.push({ ...shops[i], items: [], failed: String(r.reason?.message ?? r.reason).slice(0, 120) })
  })
  return save(root, key, { shops: out, searches })
}

// ════════════════════════════════════════════════════════════════════
// (다) 트렌드 리포트 · 유저의 조사 방향이 조사를 이끈다
// ════════════════════════════════════════════════════════════════════
// 품목별로 의미 있는 트렌드 축만 남긴다 (스펙의 구분표)
const ELEMENT_AXES = ['금속', '금속 색감', '표면', '스톤 종류', '스톤 형태', '실루엣', '구조', '콘셉트', '착용 방식', '감성']

const TREND_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['headline', 'summary', 'elements', 'sources'],
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string', description: '종합 분석 4~6문장' },
    elements: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['axis', 'trends'],
        properties: {
          axis: { type: 'string', description: `트렌드 축 이름. 다음 중에서: ${ELEMENT_AXES.join(', ')}` },
          trends: {
            type: 'array', items: {
              type: 'object', additionalProperties: false,
              required: ['label', 'evidence', 'mentions', 'source_urls', 'image_url'],
              properties: {
                label: { type: 'string' },
                evidence: { type: 'string', description: '무엇이 어디서 반복 관측됐는지 한두 문장' },
                mentions: { type: 'number', description: '서로 다른 출처에서 언급된 횟수' },
                source_urls: { type: 'array', items: { type: 'string' } },
                image_url: { type: 'string', description: '자료 안 시각 자료의 직접 링크. 없으면 빈 문자열' },
              },
            },
          },
        },
      },
    },
    sources: { type: 'array', items: { type: 'string' } },
  },
}

export async function agentTrendReport(apiKey, root, { mode, itemKo, country, langName, direction, target, depth = 4, deep = false, deepModel }) {
  // 깊은 조사는 넓게도 판다 · 하위 질문 두 개 추가 (병렬이라 벽시계는 한 겹)
  if (deep) depth = Math.min(10, depth + 2)
  // agr2 · 방향에 명시된 속성(무광 실버 같은)이 주류가 아니면 리포트에서 사라지던 것을
  // Gemini 감리가 잡았다 — 명시 속성 강제 취급 규칙이 프롬프트에 들어가며 버전을 올렸다
  // deep 이 키에 들어간다 · 얕게 돈 결과가 깊은 조사인 척 재사용되면 안 된다
  const key = keyOf(['agr3', mode, itemKo, country, langName, direction, target, depth, deep])
  const hit = cached(root, key); if (hit) return hit
  // 같은 키의 계산이 이미 날고 있으면 거기에 합류한다.
  // 클라이언트가 타임아웃으로 끊겨도 서버는 계산을 계속하는데, 그 사이 재시도가 오면
  // 캐시 미스로 같은 조사를 처음부터 또 돌린다 — 깊은 조사(gpt-5-pro)에서는
  // 수십 분·실비용이 통째로 두 배가 된다 (실제로 세 겹까지 겹쳤다).
  if (inflightReports.has(key)) return inflightReports.get(key)
  const job = runTrendReport(apiKey, root, { mode, itemKo, country, langName, direction, target, depth, deep, deepModel, key })
  inflightReports.set(key, job)
  job.finally(() => inflightReports.delete(key))
  return job
}

const inflightReports = new Map()

async function runTrendReport(apiKey, root, { mode, itemKo, country, langName, direction, target, depth, deep, deepModel, key }) {

  const frame = mode === 'fashion'
    ? `조사 대상은 패션 트렌드입니다. 최근 12개월의 런웨이·컬렉션·룩북과 최근 6개월의 리테일·에디토리얼·스트리트 확산을 함께 봅니다.
각 트렌드에는 그것을 ${itemKo} 주얼리로 번역할 방향(컬러→금속·스톤 색감, 소재→표면 질감, 실루엣→볼륨·비례, 착장 노출부→착용 위치)을 붙입니다.`
    : `조사 대상은 주얼리 트렌드입니다. 최근 1년 이내 공개된 트렌드 리포트·리서치 자료·기사에서 반복 언급되는 내용을 클러스터링합니다.`

  // ① 유저의 조사 방향으로 하위 질문 설계
  const planned = await ask(apiKey, {
    input: `${itemKo} · 시장 ${country} · 타겟 ${target} 의 트렌드를 조사합니다.
${frame}

유저가 지정한 조사 방향:
"""${direction || '(지정 없음 · 일반 트렌드)'}"""

이 방향을 중심으로 서로 겹치지 않는 하위 질문 ${depth}개를 만드세요. 각 질문은 웹에서 사실로 확인 가능해야 하고,
디자인 요소(${ELEMENT_AXES.join('·')})로 옮길 수 있는 답이 나와야 합니다.
방향 문장에 명시된 속성(소재·마감·형태·배제 조건 등)은 하나씩 뽑아 각각 최소 한 질문이 직접 다루게 하세요.
그 속성이 시장 주류가 아니어도 빼지 말고, 틈새 사례·구체 브랜드까지 찾는 질문으로 만드세요 —
비중이 낮으면 낮다고 적는 것까지가 조사입니다.
유저 방향은 조사 범위이지 결론이 아닙니다. 방향과 어긋나는 사실이 나오면 그것도 담을 수 있게 질문을 짜세요.`,
    schema: {
      type: 'object', additionalProperties: false, required: ['questions'],
      properties: { questions: { type: 'array', items: { type: 'string' } } },
    },
    name: 'agent_plan',
  })
  const qs = (planned.data.questions ?? []).slice(0, depth)
  let searches = planned.searches

  // ② 병렬 검색 · 현지어+영어 병행
  const settled = await Promise.allSettled(qs.map(q => ask(apiKey, {
    input: `웹 검색으로 답하세요. ${country} 현지 언어와 영어를 병행해 검색하고, 1년 이내 자료를 우선합니다.
확인한 사실만, 출처 URL·발표 시점과 함께. 자료 안 시각자료(이미지)의 직접 링크가 있으면 image_urls 에 남기세요. ${deep
    ? '검색은 10회까지. 서로 다른 성격의 출처(브랜드 공식·리테일러·매체·리포트)를 고루 확인하고, 사실마다 수치·시점·브랜드명을 붙이세요. facts 는 6~10개.'
    : '검색은 5회 이내.'}
대상: ${itemKo} · ${country} · 타겟 ${target}
질문: ${q}`,
    schema: {
      type: 'object', additionalProperties: false, required: ['answer', 'facts', 'sources', 'image_urls'],
      properties: {
        answer: { type: 'string' },
        facts: { type: 'array', items: { type: 'string' } },
        sources: { type: 'array', items: { type: 'string' } },
        image_urls: { type: 'array', items: { type: 'string' } },
      },
    },
    name: 'agent_sub', deep, deepModel,
  })))
  const findings = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') { searches += r.value.searches; findings.push({ q: qs[i], ...r.value.data }) }
  })

  // ③ 종합 · 트렌드 축별 정리
  const digest = findings.map((f, i) =>
    `[Q${i + 1}] ${f.q}\n답: ${f.answer}\n사실: ${(f.facts ?? []).join(' / ')}\n출처: ${(f.sources ?? []).join(', ')}\n이미지: ${(f.image_urls ?? []).join(', ')}`).join('\n\n')
  const rep = await ask(apiKey, {
    input: `아래 조사 결과만 근거로 ${itemKo} 트렌드를 축별로 정리하세요. 없는 내용을 만들지 마세요.
축은 ${ELEMENT_AXES.join(', ')} 중 이 품목과 조사 결과에 실제로 해당하는 것만 남깁니다.
mentions 는 서로 다른 출처 수입니다. 부풀리지 마세요. image_url 은 조사 결과에 있던 링크만.${deep
    ? `
깊은 조사입니다. 축마다 트렌드 3~5개, evidence 는 2~3문장으로 수치·브랜드·시점을 담아 구체적으로. summary 는 6~8문장.
evidence 에는 가능하면 "몇 개 중 몇 개" 형태의 비중과 가격대 범위를 넣으세요 —
"많이 보인다" 는 기획 회의에서 쓸 수 없습니다. 수집된 제품 목록에서 셀 수 있는 것은 세어서 쓰세요.`
    : ''}
${LANG_RULE(langName)}

--- 조사 결과 ---
${digest}
--- 끝 ---`,
    schema: TREND_SCHEMA, name: 'agent_trend', web: false, deep, deepModel,
  })
  searches += rep.searches
  return save(root, key, { ...rep.data, sub_questions: qs, searches, collected_at: new Date().toISOString().slice(0, 10) })
}

// ════════════════════════════════════════════════════════════════════
// (라) 다음 시즌 예측 · 1년 뒤 같은 시즌을 내다본다
// ════════════════════════════════════════════════════════════════════
// 예측은 예측이라고 말한다. 확정처럼 쓰면 정직성 계약 위반이다 —
// 모든 예측에 근거(왜)와 확신도, 지켜볼 지표를 붙인다. 유저의 조사 방향이 여기도 실린다.
const FORECAST_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['horizon', 'thesis', 'predictions', 'risks', 'sources'],
  properties: {
    horizon: { type: 'string', description: '예측 대상 시즌 (예: 2027 F/W)' },
    thesis: { type: 'string', description: '종합 전망 4~6문장' },
    predictions: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['axis', 'call', 'why', 'confidence', 'watch'],
        properties: {
          axis: { type: 'string', description: `${ELEMENT_AXES.join(', ')} 중에서` },
          call: { type: 'string', description: '예측 한 문장' },
          why: { type: 'string', description: '지금 보이는 근거 (전조 신호·발표·공급 동향)' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          watch: { type: 'string', description: '이 예측을 확인하거나 뒤집을 관찰 지표' },
        },
      },
    },
    risks: { type: 'array', items: { type: 'string' }, description: '예측을 흔들 변수 2~4개' },
    sources: { type: 'array', items: { type: 'string' } },
  },
}

export async function agentForecast(apiKey, root, { mode, itemKo, country, langName, direction, target, deep = false, deepModel }) {
  const key = keyOf(['agfc1', mode, itemKo, country, langName, direction, target, deep])
  const hit = cached(root, key); if (hit) return hit
  const { data, searches } = await ask(apiKey, {
    input: `${itemKo} · 시장 ${country} · 타겟 ${target}. 지금부터 약 1년 뒤, 다음 같은 시즌의 트렌드를 예측하세요.

${direction ? `유저의 조사 방향: "${direction}" — 예측도 이 방향의 관점에서 우선 조망하되, 방향과 어긋나는 큰 흐름도 숨기지 마세요.` : ''}

웹 검색으로 전조를 찾으세요: 다가올 패션위크·컬렉션 예고, 소재·금속 공급과 가격 동향,
주요 브랜드의 발표·채용·투자, 소비 지표, 규제(도금·니켈 등). 확인한 전조에서만 예측을 끌어내세요.
- predictions 는 6~10개, 축(${ELEMENT_AXES.join(', ')})별로 겹치지 않게.
- 예측은 예측입니다. call 은 단정이 아니라 전망 문장으로, confidence 를 정직하게.
- ${LANG_RULE(langName)}`,
    schema: FORECAST_SCHEMA, name: 'agent_forecast', deep, deepModel,
  })
  return save(root, key, { ...data, searches })
}

// ════════════════════════════════════════════════════════════════════
// 패션 트렌드 전용 · (가) 런웨이 룩 수집 / (나) 확산 신호
// ════════════════════════════════════════════════════════════════════
const LOOK = {
  type: 'object', additionalProperties: false,
  required: ['brand', 'collection', 'season', 'look_note', 'image_url', 'source_url', 'colors', 'materials', 'silhouette', 'styling', 'jewelry_zone'],
  properties: {
    brand: { type: 'string' }, collection: { type: 'string' }, season: { type: 'string' },
    look_note: { type: 'string', description: 'Look 번호나 발표 시점 등 확인된 식별 정보' },
    image_url: { type: 'string', description: '룩 이미지 직접 링크. 확실치 않으면 빈 문자열' },
    source_url: { type: 'string' },
    colors: { type: 'array', items: { type: 'string' } },
    materials: { type: 'array', items: { type: 'string' } },
    silhouette: { type: 'string' },
    styling: { type: 'string' },
    jewelry_zone: { type: 'string', description: '이 착장에서 주얼리가 보일 자리 (네크라인·손목·귀 등)' },
  },
}

export async function agentRunway(apiKey, root, { country, langName, direction, itemKo }) {
  const key = keyOf(['agrw1', country, langName, direction, itemKo])
  const hit = cached(root, key); if (hit) return hit
  const { data, searches } = await ask(apiKey, {
    input: `당신은 패션 리서처입니다. 웹 검색으로 사실만 수집하세요. ${country} 현지어와 영어를 병행합니다.

${country} 관점에서 현재 시즌과 공개된 차기 시즌의 런웨이·컬렉션·룩북에서 대표 룩 8~14개를 수집하세요.
글로벌 4대 패션위크와 ${country} 주요 패션위크·브랜드 공식 컬렉션을 우선합니다.
${direction ? `조사 방향: ${direction}` : ''}
각 룩은 ${itemKo} 착용 환경(주얼리가 보일 자리)까지 적습니다.
image_url 은 이미지 파일 직접 주소만, 아니면 빈 문자열. 출시·발표 정보는 확인된 것만. ${LANG_RULE(langName)}`,
    schema: {
      type: 'object', additionalProperties: false, required: ['looks', 'season_now', 'season_next', 'sources'],
      properties: {
        looks: { type: 'array', items: LOOK },
        season_now: { type: 'string' }, season_next: { type: 'string' },
        sources: { type: 'array', items: { type: 'string' } },
      },
    },
    name: 'agent_runway',
  })
  return save(root, key, { ...data, searches })
}

export async function agentAdoption(apiKey, root, { country, langName, direction, itemKo }) {
  const key = keyOf(['agad1', country, langName, direction, itemKo])
  const hit = cached(root, key); if (hit) return hit
  const { data, searches } = await ask(apiKey, {
    input: `${country} 의 리테일·에디토리얼·스트리트에서 패션 트렌드의 실제 확산 신호를 수집하세요. 최근 6개월 우선.
${direction ? `조사 방향: ${direction}` : ''}
신호마다 basis 를 정직하게 구분합니다:
official_best(공식 베스트셀러) / exposure(사이트 노출순위) / editorial(에디토리얼 언급) / search(검색 관심도) / street(스트리트 노출).
노출을 판매로 바꿔 말하지 마세요. ${LANG_RULE(langName)}`,
    schema: {
      type: 'object', additionalProperties: false, required: ['signals', 'sources'],
      properties: {
        signals: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            required: ['label', 'basis', 'evidence', 'source_url', 'image_url'],
            properties: {
              label: { type: 'string' },
              basis: { type: 'string', enum: ['official_best', 'exposure', 'editorial', 'search', 'street'] },
              evidence: { type: 'string' }, source_url: { type: 'string' },
              image_url: { type: 'string' },
            },
          },
        },
        sources: { type: 'array', items: { type: 'string' } },
      },
    },
    name: 'agent_adoption',
  })
  return save(root, key, { ...data, searches })
}

// ════════════════════════════════════════════════════════════════════
// (라) 레퍼런스 10개 선정 · 슬롯별 기준이 다르다
// ════════════════════════════════════════════════════════════════════
const SLOTS_JEWELRY = [
  '1-2 전체 트렌드 조합을 가장 잘 대표', '3 금속·금속 색감 중심', '4 스톤 종류·컷 중심',
  '5 유기적 형태·실루엣 중심', '6 표면 질감·가공법 중심', '7 구조·세팅 방식 중심',
  '8 착용 방식·기능성 중심', '9 상업성이 높은 트렌드 조합', '10 실험적·차별화 가능성',
]
const SLOTS_FASHION = [
  '1-2 전체 거시 패션 트렌드 대표 룩', '3 컬러 팔레트와 금속·스톤 색감 연결성', '4 소재·표면 질감 특징',
  '5 실루엣·볼륨·비례', '6 구조·재단·디테일의 주얼리 번역성', '7 주얼리 착용 환경(네크라인·소매·헤어)이 명확',
  '8 레이어링·스타일링·착용 방식 특징', '9 검색 국가·타깃 상업성', '10 실험적 런웨이 룩',
]

export async function agentReferences(apiKey, root, { mode, itemKo, country, langName, target, candidates, trendSummary }) {
  const key = keyOf(['agsel1', mode, itemKo, country, langName, target,
    candidates.map(c => c.id), trendSummary.slice(0, 400)])
  const hit = cached(root, key); if (hit) return hit
  const slots = mode === 'fashion' ? SLOTS_FASHION : SLOTS_JEWELRY
  const list = candidates.map(c =>
    `- id:${c.id} · ${c.title} · ${c.subtitle} · 특징: ${c.traits} · 이미지:${c.image_url ? '있음' : '없음'}`).join('\n')
  const { data, searches } = await ask(apiKey, {
    input: `트렌드 종합과 수집된 후보들에서 디자인 레퍼런스 10개를 슬롯 기준대로 고르세요.
트렌드를 한 문장으로 뭉쳐 같은 잣대로 뽑지 말고, 요소별 조합(금속/색감/형태/콘셉트 등)을 만들어 슬롯마다 다른 기준으로 뽑습니다.
이미지가 있는 후보를 우선합니다. 각 선택에는 어떤 트렌드 요소 조합과 연결되는지, 왜 그 슬롯에 맞는지 설명을 답니다.
타겟 고객: ${target} · 시장: ${country} · 품목: ${itemKo}
${LANG_RULE(langName)}

슬롯 기준:
${slots.map(s => `  ${s}`).join('\n')}

--- 트렌드 종합 ---
${trendSummary}

--- 후보 (${candidates.length}) ---
${list}`,
    schema: {
      type: 'object', additionalProperties: false, required: ['picks'],
      properties: {
        picks: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            required: ['slot', 'candidate_id', 'trend_combo', 'reason'],
            properties: {
              slot: { type: 'number' },
              candidate_id: { type: 'string' },
              trend_combo: { type: 'array', items: { type: 'string' }, description: '이 슬롯이 대표하는 트렌드 요소 조합' },
              reason: { type: 'string', description: '트렌드와 연결해 왜 이 레퍼런스인지 2~3문장' },
            },
          },
        },
      },
    },
    name: 'agent_refs', web: false,
  })
  return save(root, key, { ...data, searches })
}

// ════════════════════════════════════════════════════════════════════
// (마) 프롬프트 쌍 · 1단계 DNA(비전) → 2·3단계 방향+최종 프롬프트
// ════════════════════════════════════════════════════════════════════
/** 레퍼런스 사진을 비전 입력으로 만든다.
 *  직링크가 죽어 있으면 상품 페이지의 og:image 로 넘어간다 — 조사 모델은 직링크를
 *  좀처럼 주지 않고, 줘도 만료된 CDN 주소인 경우가 많다. 받아 오는 순서는 grab.mjs 에 있다. */
// 비전 모델이 실제로 읽는 형식만 · svg 나 몇 백 바이트짜리 자리표를 보내면
// "valid image 가 아니다" 로 400 이 난다. 자리표는 image/svg+xml 로 오기 때문에
// `image/` 로 시작하는지만 보면 걸러지지 않는다.
const VISION_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])

async function fetchImageAsPart(root, url, pageUrl) {
  const got = await grabImage({ src: url ?? '', pages: pageUrl ? [pageUrl] : [], root })
  if (!got) return null
  if (got.buf.length > 6_000_000 || got.buf.length < 2_000) return null
  const mime = got.type.split(';')[0].trim().toLowerCase()
  if (!VISION_MIME.has(mime)) return null
  return { type: 'input_image', image_url: `data:${mime};base64,${got.buf.toString('base64')}` }
}

async function askVision(apiKey, { system, text, imagePart, schema, name }) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VISION_MODEL,
      reasoning: { effort: 'medium' },
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text }, ...(imagePart ? [imagePart] : [])] },
      ],
      text: { format: { type: 'json_schema', name, schema, strict: true } },
    }),
  })
  if (!r.ok) throw new Error(`vision ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  const msg = j.output?.find(o => o.type === 'message')
  const textOut = msg?.content?.[0]?.text
  if (!textOut) throw new Error('vision 응답 비어 있음')
  return JSON.parse(textOut)
}

const DNA_JEWELRY = {
  type: 'object', additionalProperties: false,
  required: ['product_type', 'silhouette', 'metal', 'surface', 'stones', 'setting', 'rhythm', 'structure', 'wearability', 'staging', 'avoid', 'principles'],
  properties: {
    product_type: { type: 'string' }, silhouette: { type: 'string' },
    metal: { type: 'string' }, surface: { type: 'string' },
    stones: { type: 'string' }, setting: { type: 'string' },
    rhythm: { type: 'string', description: '반복·대칭·리듬' },
    structure: { type: 'string' }, wearability: { type: 'string' },
    staging: { type: 'string', description: '이미지 연출 요소' },
    avoid: { type: 'array', items: { type: 'string' }, description: '복제하면 안 되는 식별적 특징' },
    principles: { type: 'array', items: { type: 'string' }, description: '새 디자인으로 옮길 추상 원리' },
  },
}

const DNA_FASHION = {
  type: 'object', additionalProperties: false,
  required: ['garment', 'silhouette', 'palette', 'material', 'construction', 'neckline', 'exposure', 'styling_density', 'mood', 'jewelry_opportunity', 'conflicts', 'avoid', 'principles'],
  properties: {
    garment: { type: 'string' }, silhouette: { type: 'string' }, palette: { type: 'string' },
    material: { type: 'string' }, construction: { type: 'string' }, neckline: { type: 'string' },
    exposure: { type: 'string', description: '노출 부위와 주얼리 가시성' },
    styling_density: { type: 'string' }, mood: { type: 'string' },
    jewelry_opportunity: { type: 'string', description: '선택 품목에서의 기회 (크기·색·위치)' },
    conflicts: { type: 'array', items: { type: 'string' }, description: '착장과 충돌할 요소' },
    avoid: { type: 'array', items: { type: 'string' } },
    principles: { type: 'array', items: { type: 'string' } },
  },
}

export async function agentRefDna(apiKey, root, { mode, refId, imageUrl, sourceUrl, context, itemKo, target, country, direction, langName }) {
  // agdna2 · agdna1 로 구운 것은 사진을 한 장도 못 본 DNA 다. 재사용하면 안 된다.
  const key = keyOf(['agdna2', mode, refId, imageUrl, sourceUrl, itemKo, langName])
  const hit = cached(root, key); if (hit) return hit
  const imagePart = await fetchImageAsPart(root, imageUrl, sourceUrl)
  const isFashion = mode === 'fashion'
  const system = isFashion
    ? `Analyze the attached fashion look as a styling and visual system, not as a garment to reproduce. Do not infer unavailable facts. Do not copy logos, prints, hardware or recognizable brand-specific motifs. ${LANG_RULE(langName)}`
    : `Analyze the attached jewelry reference as a design system, not as an object to reproduce. Do not use or infer the brand logo. ${LANG_RULE(langName)}`
  const body = (withImage) => `${withImage ? '' : '이미지를 내려받지 못했습니다. 아래 서술 정보만으로 판단하고, 확인 불가한 필드는 "이미지 미확인"으로 두세요.\n'}대상 품목: ${itemKo}
타겟 고객: ${target} · 시장: ${country}
${direction ? `조사 방향: ${direction}` : ''}
레퍼런스 정보: ${context}`
  const schema = isFashion ? DNA_FASHION : DNA_JEWELRY
  try {
    const data = await askVision(apiKey, { system, text: body(!!imagePart), imagePart, schema, name: 'ref_dna' })
    return save(root, key, { dna: data, hadImage: !!imagePart })
  } catch (e) {
    // 사진은 보탬이지 조건이 아니다. 사진 때문에 실패했으면 사진 없이 한 번 더 간다 —
    // 안 그러면 못 읽는 사진 한 장이 디자인 하나를 통째로 없앤다(실제로 그랬다).
    if (!imagePart) throw e
    const data = await askVision(apiKey, { system, text: body(false), imagePart: null, schema, name: 'ref_dna' })
    return save(root, key, { dna: data, hadImage: false })
  }
}

// ── 2·3단계 · 방향(P/T/R/C(+Complement)/A) + 최종 이미지 프롬프트 ─────
/* 제작 사양 · 원가 계산과 테크팩이 이 필드를 먹는다.
   글로 "치수를 적어 주세요" 하면 흘리지만, 필드로 받으면 스키마가 빈 값을 거부한다.
   weight_g 가 원가 계산의 유일한 입력이라 범위로 받는다 — 한 값으로 받으면
   추정이라는 사실이 화면에서 사라진다. */
const SPEC_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['dims', 'metal', 'plating', 'stones', 'findings', 'weight_g', 'process', 'note'],
  properties: {
    dims: {
      type: 'array', description: '그 품목의 핵심 치수 3~6개',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'mm'],
        properties: {
          name: { type: 'string', description: '밴드 폭 · 두께 · 총 길이 · 체인 굵기 등' },
          mm: { type: 'string', description: 'mm 단위 수치. 범위면 "2.0~2.4"' },
        },
      },
    },
    metal: { type: 'string', description: '합금 규격 · 925 / K10 / 14K / 18K yellow / brass 등' },
    plating: { type: 'string', description: '도금 종류와 두께(마이크로미터). 없으면 빈 문자열' },
    stones: {
      type: 'array', description: '스톤이 없으면 빈 배열',
      items: {
        type: 'object', additionalProperties: false, required: ['type', 'cut', 'mm', 'count'],
        properties: {
          type: { type: 'string', description: 'CZ · 모아사나이트 · 랩다이아 · 천연석 종류' },
          cut: { type: 'string' }, mm: { type: 'string' },
          count: { type: 'number', description: '개수' },
        },
      },
    },
    findings: {
      type: 'array', description: '부속 · 클래스프, 이어링 백, 베일, 점프링 등',
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'spec'],
        properties: { name: { type: 'string' }, spec: { type: 'string', description: '규격·재질' } },
      },
    },
    weight_g: {
      type: 'object', additionalProperties: false, required: ['min', 'max'],
      description: '소재와 볼륨에서 추정한 금속 중량 범위(g). 스톤·부속 제외',
      properties: { min: { type: 'number' }, max: { type: 'number' } },
    },
    process: { type: 'array', items: { type: 'string' }, description: '주조·세팅·연마·도금 등 주요 공정' },
    note: { type: 'string', description: '사용자가 적은 수치 범위를 벗어났다면 그 이유. 없으면 빈 문자열' },
  },
}

const VARIANT_RULE = {
  base: '레퍼런스의 핵심 DNA 와 트렌드 대표성을 우선한 기본안.',
  commercial: '상업적 변형안. 크기·무게 감소, 공정 단순화, 안정적 세팅, 데일리 착용. 색만 바꾸지 말고 크기·구조·착용·공정 중 두 가지 이상을 바꿀 것.',
  form: '형태 실험안. 비대칭·볼륨 대비·빈 공간·비례 변화로 기본안과 명확히 다른 실루엣.',
  material: '소재·구조 실험안. 혼합 금속·표면 대비·탈착 가변·모듈형·새로운 세팅. 소량 생산 가능한 실험적 제작법.',
}

export async function agentPrompts(apiKey, root, { mode, refId, variant, dna, trendCombo, itemEn, itemKo, target, country, langName, brief }) {
  // agp4 · DNA 가 키에 들어갔다. 전에는 refId 만 보고 캐시해서, 사진을 못 본 고장 DNA 로
  // 만든 프롬프트가 DNA 를 고친 뒤에도 그대로 재사용됐다 (NFC 버그 복구 때 실제로 그랬다).
  const key = keyOf(['agp6', mode, refId, variant, itemEn, target, trendCombo, langName, dna, brief])
  const hit = cached(root, key); if (hit) return hit
  const isFashion = mode === 'fashion'
  const { data } = await ask(apiKey, {
    input: `주얼리 디자인 방향과 이미지 생성 프롬프트를 만듭니다. 웹 검색 없이 아래 정보만 사용하세요.

품목: ${itemKo} (${itemEn})
타겟 고객: ${target} · 시장: ${country}
${brief ? `사용자가 적은 조건: """${String(brief).slice(0, 600)}"""
  여기에 금속 규격·중량·가격대 같은 수치가 있으면 spec 이 반드시 그 범위를 지켜야 합니다.` : ''}
변형 종류: ${VARIANT_RULE[variant] ?? VARIANT_RULE.base}
트렌드 조합: ${trendCombo.join(' + ')}

레퍼런스 DNA:
${JSON.stringify(dna, null, 1)}

1) direction: Preserve / Transform / Replace / Combine${isFashion ? ' / Complement' : ''} / Avoid 를 각각 1~2문장으로.
   - Preserve 는 추상 원리만. Avoid 에는 DNA 의 avoid 항목을 반드시 반영.
   ${isFashion ? '- Complement: 이 주얼리가 그 착장에서 할 역할과, 네크라인·소매·헤어 볼륨 대비 가시성.' : ''}
   ${isFashion ? '- 의상을 축소한 미니어처 주얼리를 만들지 말 것.' : '- 레퍼런스의 윤곽·개구 위치·스톤 방향을 그대로 쓰지 말 것.'}
2) final_prompt: 이미지 생성용 최종 프롬프트 (140~200 단어) · 반드시 ${langName} 로 씁니다.
   **첫 두 줄에 반드시 지켜야 할 것만 명령형 짧은 절로 먼저 씁니다.**
   금속 종류, 마감, 스톤 유무와 세팅 방식, 잠금·부속 종류(귀걸이 백·클래스프·베일), 금지 요소.
   예: "18K 옐로골드. 베젤 세팅. 히든 베일. 라푸세트 백. 프롱·버터플라이 백 금지."
   이미지 모델은 문장이 길어질수록 뒤쪽 지시를 흘린다 — 실측으로 클로저·베일이 설명과 다르게 나왔다.
   그 다음에 "${itemKo}" 원본 디자인이라는 선언과 함께 형태·비례·구조를 서술합니다.
   실제 벽두께·주조·세팅이 가능한 조형으로.
   스리쿼터 제품 뷰, 무채색 스튜디오 배경, 매크로 주얼리 사진, 포토리얼 마무리 지시를 포함.
   마지막에 "완전히 새로운 디자인일 것. 다음을 재현하지 말 것: ..." 형태로 Avoid 를 명시.
3) title: 이 디자인안을 부를 짧은 이름 (${langName}).
4) spec: 이 디자인을 벤치에 올릴 수 있는 제작 사양. 프롬프트에 쓴 형태와 일치해야 합니다.
   - dims 는 그 품목의 핵심 치수만 (반지=밴드 폭·두께·링 사이즈 / 귀걸이=총 길이·모티프 폭·포스트 굵기 /
     목걸이=체인 길이·굵기·펜던트 크기 / 브레이슬릿=둘레·폭).
   - weight_g 는 그 치수와 금속에서 추정한 실제 값. 지어내지 말고 볼륨을 어림해서 범위로.
   - findings 에 잠금·백·베일을 빠짐없이. 프롬프트 첫 두 줄에 쓴 것과 같아야 합니다.
   - 사용자가 방향에 중량·가격대·규격을 적었으면 그 범위 안에서 설계하고,
     벗어나야 한다면 note 에 한 줄로 이유를 적으세요.

direction·title·final_prompt 모두 ${langName} 로 씁니다. 고유명사·보석 용어는 원어를 병기해도 됩니다.`,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['title', 'direction', 'final_prompt', 'spec'],
      properties: {
        title: { type: 'string' },
        direction: {
          type: 'object', additionalProperties: false,
          required: ['preserve', 'transform', 'replace', 'combine', 'complement', 'avoid'],
          properties: {
            preserve: { type: 'string' }, transform: { type: 'string' }, replace: { type: 'string' },
            combine: { type: 'string' }, complement: { type: 'string', description: '패션 모드가 아니면 빈 문자열' },
            avoid: { type: 'string' },
          },
        },
        final_prompt: { type: 'string' },
        spec: SPEC_SCHEMA,
      },
    },
    name: 'agent_prompts', web: false,
  })
  return save(root, key, data)
}

// ════════════════════════════════════════════════════════════════════
// 3) 주얼리 컬렉션 · 키워드 조사 → 추상화 → 세트 콘셉트 → 품목 프롬프트
// ════════════════════════════════════════════════════════════════════
export async function agentKeyword(apiKey, root, { keyword, country, langName }) {
  const key = keyOf(['agk2', keyword, country, langName])
  const hit = cached(root, key); if (hit) return hit
  const { data, searches } = await ask(apiKey, {
    input: `키워드/스토리를 주얼리 디자인 관점에서 조사하세요. 웹 검색으로 확인한 사실 기반으로.

키워드: """${keyword}"""
시장: ${country} — 이 나라에서의 문화적 의미를 반드시 포함합니다.

조사: 기본 의미 / ${country} 문화적 의미 / 역사·신화·예술 배경 / 긍정·부정 상징 / 관련 감정 / 관련 색채 / 관련 소재 /
형태적 특징 / 움직임·리듬 / 기존 주얼리의 흔한 표현 / 피해야 할 진부하거나 문화적으로 부적절한 표현.
abstraction: 상징·감정·형태·움직임·구조·표면·소재·색채·리듬·이야기 10개 축으로 키워드를 분해합니다.
${LANG_RULE(langName)}`,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['meaning', 'cultural', 'background', 'symbols', 'emotions', 'colors', 'materials', 'forms', 'motion', 'cliches', 'cautions', 'abstraction', 'sources'],
      properties: {
        meaning: { type: 'string' }, cultural: { type: 'string' }, background: { type: 'string' },
        symbols: { type: 'array', items: { type: 'string' } },
        emotions: { type: 'array', items: { type: 'string' } },
        colors: { type: 'array', items: { type: 'string' } },
        materials: { type: 'array', items: { type: 'string' } },
        forms: { type: 'array', items: { type: 'string' } },
        motion: { type: 'array', items: { type: 'string' } },
        cliches: { type: 'array', items: { type: 'string' }, description: '기존 주얼리의 흔한 표현' },
        cautions: { type: 'array', items: { type: 'string' }, description: '피해야 할 표현' },
        abstraction: {
          type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['axis', 'notes'],
            properties: { axis: { type: 'string' }, notes: { type: 'array', items: { type: 'string' } } },
          },
        },
        sources: { type: 'array', items: { type: 'string' } },
      },
    },
    name: 'agent_keyword',
  })
  return save(root, key, { ...data, searches })
}

const SET_KINDS = {
  1: ['키워드를 가장 잘 대표하는 통합형'],
  3: ['대표형', '상업형', '실험형'],
  5: ['대표형', '상업형', '형태·움직임형', '소재·표면형', '구조 실험형'],
}

export async function agentSets(apiKey, root, { keyword, insight, setCount, items, target, country, langName, adv }) {
  const key = keyOf(['agset1', keyword, setCount, items, target, langName, adv])
  const hit = cached(root, key); if (hit) return hit
  const kinds = SET_KINDS[setCount] ?? SET_KINDS[3]
  const { data } = await ask(apiKey, {
    input: `키워드 인사이트를 바탕으로 서로 다른 콘셉트의 주얼리 세트 ${setCount}개를 설계하세요. 웹 검색 없이 아래 정보만.

키워드: """${keyword}"""
세트 성격 (순서대로): ${kinds.join(' / ')}
품목: ${items.join(', ')} — 모든 세트가 이 품목들을 하나의 톤앤매너로 덮어야 합니다.
타겟: ${target} · 시장: ${country}
${adv ? `고급 설정: ${adv}` : ''}

각 세트에: 세트명 / 한 문장 콘셉트 / 콘셉트 스토리(3~4문장) / 컬러 팔레트 / 금속과 색감 / 표면 처리 / 스톤 종류·형태 /
공통 실루엣 / 마스터 모티프 / 반복·대칭 규칙 / 구조·세팅 / 피해야 할 표현(키워드 조사의 진부·부적절 표현 반영) /
design_dna: 품목이 달라도 지켜야 할 공통 규칙 6~9개 문장 / concept_art: 이 세트의 Form·Motion·Material·Atmosphere
추상 이미지를 만들 영어 프롬프트 4개 (주얼리 제품을 그리지 말 것 — 추상적인 형태·움직임·소재·분위기 이미지).
${LANG_RULE(langName)} (concept_art 프롬프트만 영어)`,
    schema: {
      type: 'object', additionalProperties: false, required: ['sets'],
      properties: {
        sets: {
          type: 'array', items: {
            type: 'object', additionalProperties: false,
            required: ['name', 'kind', 'concept', 'story', 'palette', 'metal', 'surface', 'stones', 'silhouette', 'motif', 'rhythm', 'structure', 'avoid', 'design_dna', 'concept_art'],
            properties: {
              name: { type: 'string' }, kind: { type: 'string' }, concept: { type: 'string' }, story: { type: 'string' },
              palette: { type: 'array', items: { type: 'string' } },
              metal: { type: 'string' }, surface: { type: 'string' }, stones: { type: 'string' },
              silhouette: { type: 'string' }, motif: { type: 'string' }, rhythm: { type: 'string' }, structure: { type: 'string' },
              avoid: { type: 'array', items: { type: 'string' } },
              design_dna: { type: 'array', items: { type: 'string' } },
              concept_art: {
                type: 'object', additionalProperties: false,
                required: ['form', 'motion', 'material', 'atmosphere'],
                properties: {
                  form: { type: 'string' }, motion: { type: 'string' },
                  material: { type: 'string' }, atmosphere: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    name: 'agent_sets', web: false,
  })
  const insightNote = `${insight?.meaning ?? ''} · 주의: ${(insight?.cautions ?? []).join(', ')}`
  return save(root, key, { ...data, insight_note: insightNote })
}

export async function agentItemPrompt(apiKey, root, { setName, dna, avoid, item, itemEn, target, langName, brief }) {
  const key = keyOf(['agip4', setName, dna, item, target, langName, brief])
  const hit = cached(root, key); if (hit) return hit
  const { data } = await ask(apiKey, {
    input: `세트의 공통 Design DNA 를 ${item} (${itemEn}) 하나에 맞게 변환한 이미지 생성 프롬프트를 만듭니다. 웹 검색 없이.

세트: ${setName}
공통 Design DNA:
${dna.map(x => `- ${x}`).join('\n')}
피해야 할 표현: ${avoid.join(', ')}
타겟 고객: ${target}
${brief ? `사용자가 적은 조건: ${brief} — spec 이 반드시 이 범위를 지켜야 합니다.` : ''}
품목 고려: 반지=손가락 구조·착용 안정 / 귀걸이=무게·길이·얼굴 관계 / 목걸이=목선·체인·중심 무게 /
펜던트=체인 연결·회전 방지 / 브레이슬릿=손목 움직임·잠금.

final_prompt: ${langName} 140~190단어.
**첫 두 줄에 반드시 지켜야 할 것만 명령형 짧은 절로 먼저 씁니다** — 금속, 마감, 스톤 유무와 세팅,
잠금·부속(귀걸이 백·클래스프·베일), 금지 요소. 이미지 모델은 문장이 길어질수록 뒤쪽 지시를 흘린다
(실측으로 클로저·베일이 설명과 다르게 나왔다).
그 다음 "${item}" 원본 디자인 선언과 함께 마스터 모티프·금속 색감·표면·스톤 규칙을 세트 DNA 그대로 유지.
실제 제조 가능한 벽두께·세팅. 스리쿼터 제품 뷰, 무채색 스튜디오 배경, 매크로 주얼리 사진, 포토리얼 마무리 지시 포함.
Avoid 명시. feature: 이 제품의 디자인 특징 한 문장. 모두 ${langName} 로.
spec: 이 디자인을 벤치에 올릴 제작 사양. 프롬프트에 쓴 형태와 일치해야 합니다.
dims 는 그 품목의 핵심 치수만, weight_g 는 그 치수와 금속에서 어림한 실제 범위,
findings 에 잠금·백·베일을 빠짐없이 — 프롬프트 첫 두 줄에 쓴 것과 같아야 합니다.
세트 안의 품목들은 같은 금속·도금 규격을 공유해야 합니다.`,
    schema: {
      type: 'object', additionalProperties: false, required: ['final_prompt', 'feature', 'spec'],
      properties: { final_prompt: { type: 'string' }, feature: { type: 'string' }, spec: SPEC_SCHEMA },
    },
    name: 'agent_item_prompt', web: false,
  })
  return save(root, key, data)
}

// ── 사전 평가 · 프롬프트·DNA 텍스트 기준 (비전 아님을 화면에 명시할 것) ──
export async function agentScore(apiKey, root, { mode, pairs, target, langName }) {
  const key = keyOf(['agsc2', mode, pairs.map(p => p.id + p.prompt.slice(0, 80)), target])
  const hit = cached(root, key); if (hit) return hit
  const { data } = await ask(apiKey, {
    input: `아래 디자인 프롬프트들을 평가하세요. 웹 검색 없이. 이미지는 없으므로 프롬프트와 방향 텍스트만 기준으로 합니다.
항목: 트렌드 적합(25) 착장·맥락 조화(20) 품목 적합(15) 독창성(15) 착용성(10) 제조성(10) 타겟 적합(5) — 합계 100.
타겟: ${target}. 점수는 보수적으로. ${LANG_RULE(langName)}

${pairs.map(p => `[${p.id}] ${p.prompt.slice(0, 500)}`).join('\n\n')}`,
    schema: {
      type: 'object', additionalProperties: false, required: ['scores'],
      properties: {
        scores: {
          type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['id', 'total', 'note'],
            properties: { id: { type: 'string' }, total: { type: 'number' }, note: { type: 'string' } },
          },
        },
      },
    },
    name: 'agent_score', web: false,
  })
  return save(root, key, data)
}

/** 이미 만들어진 프롬프트에서 제작 사양을 읽어 낸다.
 *  옛 저장본과 데모 샘플에는 spec 이 없다. 새로 지어내면 이미 생성된 사진과 어긋나므로,
 *  프롬프트에 적힌 것만 읽고 적히지 않은 것은 그 품목의 표준값으로 채운 뒤 그렇다고 밝힌다. */
export async function agentSpecFrom(apiKey, root, { prompt, itemKo, langName }) {
  const key = keyOf(['agsf2', prompt.slice(0, 400), itemKo])
  const hit = cached(root, key); if (hit) return hit
  const { data } = await ask(apiKey, {
    input: `아래는 이미 생성이 끝난 주얼리 디자인 프롬프트입니다. 여기에 적힌 내용만으로 제작 사양을 정리하세요.
웹 검색 없이. 새로 설계하지 마세요 — 사진이 이미 이 프롬프트로 만들어졌으므로 어긋나면 안 됩니다.

품목: ${itemKo}
프롬프트: """${String(prompt).slice(0, 1800)}"""

- 프롬프트에 적힌 금속·마감·스톤·부속을 그대로 옮깁니다.
- 치수와 중량은 프롬프트에 없으면 그 품목의 표준 치수로 어림하고, note 에 "치수는 표준값으로 채웠습니다" 라고 적으세요.
- weight_g 는 반드시 0 보다 큰 값이어야 합니다. 프롬프트에 없더라도 치수와 금속에서 부피를 어림해
  범위로 채우세요. 0 으로 두면 원가를 계산할 수 없어 이 사양은 쓸모가 없어집니다.
  참고 범위 · 반지 2~6g / 귀걸이 한 짝 1~4g / 펜던트 2~6g / 목걸이 체인 포함 5~12g / 브레이슬릿 6~20g.
- metal 은 합금 규격 하나로 적으세요. "미정" 이나 빈 값을 두지 말고, 프롬프트의 색·마감에서
  가장 그럴듯한 규격을 고른 뒤 note 에 추정이라고 밝히세요. 여러 소재가 섞이면 몸체 소재를 적습니다.
- 프롬프트가 "없음" 이라고 한 부속은 없음으로 적습니다. 없는 것을 만들어 넣지 마세요.
${LANG_RULE(langName)}`,
    // 옮겨 적는 일이라 추론을 낮춰 부른다 · 실측으로 high 는 한 건에 몇 분이 걸렸다
    schema: SPEC_SCHEMA, name: 'agent_spec_from', web: false, effort: 'low',
  })
  return save(root, key, data)
}
