// ── 시즌 트렌드 도시에 · MICAM/Livetrend 형식을 그대로 데이터로 옮긴다 ──────
//
// 참고한 형식 (첨부 리포트 3종):
//   MICAM 101 FW26 Buyer's Guide, MICAM 100 SS26 Buyer's Guide, MICAM 102 SS27 Press Kit
//   - 데이터 소스 4종: 이커머스(MARKET) / 인스타그램(SOCIAL) / 패션쇼(SHOWS) / 검색량(CONSUMER)
//   - 트렌드 등급 6종: EDGY / EARLY SIGN / SAFE / BIG / STABLE / LAST CALL
//   - 시즌 서사 1편 → 매크로트렌드 4개 → 각 매크로마다
//       서브트렌드 칩 · 검색 성장률 3개 · 팔레트(Pantone TCX + HEX) · 소재 4 · 디테일 4 · 키아이템(여/남/키즈)
//   - 모든 수치는 전년 대비(YoY)이고 어느 소스에서 나왔는지 아이콘으로 표시된다
//
// 여기서는 그 구조를 강제 스키마로 만들어, 모든 수치가 출처 URL을 달고 나오게 한다.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const SOURCE_KINDS = ['market', 'social', 'shows', 'consumer']
export const TREND_GRADES = ['edgy', 'early_sign', 'safe', 'big', 'stable', 'last_call']

const GRADE_NOTE = `등급 기준 (MICAM 분류를 따른다):
- edgy: 아주 약한 신호. 마이크로 트렌드 가능성, 위험 매우 높음
- early_sign: 부상 중. 전망은 있으나 위험이 큼
- safe: 이미 예고된 트렌드. 성장 중이고 위험이 낮음
- big: 상업적 잠재력이 크고 확산이 빠른 큰 트렌드
- stable: 이미 시장에 있고 성장은 평평함
- last_call: 전망은 꺾였지만 아직 사업성은 남아 있음`

const SOURCE_NOTE = `데이터 소스는 넷 중 하나로 표기한다:
- market: 이커머스에서 관측한 전년 대비 변화 (판매 페이지, 품절/재입고, 노출 수)
- social: 인스타그램 등 소셜에서의 전년 대비 노출 증가
- shows: 패션쇼/컬렉션에서의 전년 대비 등장 증가
- consumer: 검색량 등 소비자 관심의 전년 대비 증가`

/** 근거가 붙은 수치 하나. 화면에서는 "+265% YoY · MARKET" 처럼 보인다. */
const METRIC = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'yoy_percent', 'magnitude', 'source_kind', 'source_url', 'observed_note'],
  properties: {
    label: { type: 'string', description: '무엇이 늘었는가. 예: FISHERMAN, RETRO SPORT, AUTHENTIC SUEDE' },
    yoy_percent: { type: ['number', 'null'], description: '공개된 전년 대비 증감 %를 찾았을 때만 넣는다. 못 찾았으면 null. 지어내지 말 것' },
    magnitude: { type: 'string', enum: ['surging', 'rising', 'steady', 'softening'], description: '숫자를 못 찾아도 이건 반드시 채운다. 관측한 양으로 판단한 방향과 세기' },
    source_kind: { type: 'string', enum: SOURCE_KINDS },
    source_url: { type: 'string', description: '이 수치를 확인한 실제 URL. 없으면 빈 문자열' },
    observed_note: { type: 'string', description: '어떻게 확인했는지 한 문장. 추정이면 추정이라고 쓴다' },
  },
}

const COLOR = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'pantone_tcx', 'hex'],
  properties: {
    name: { type: 'string', description: '컬러 이름. 예: Peat Moss, Rose Dust' },
    pantone_tcx: { type: 'string', description: 'Pantone TCX 코드. 모르면 빈 문자열' },
    hex: { type: 'string', description: '#RRGGBB' },
  },
}

const KEY_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['segment', 'name', 'description', 'metric', 'grade', 'silhouette_spec'],
  properties: {
    segment: { type: 'string', enum: ['women', 'men', 'kids'] },
    name: { type: 'string', description: '아이템 이름. 예: THE STRAPPY STILETTO' },
    description: { type: 'string', description: '3~5문장. 형태와 그것이 주는 인상을 함께 쓴다' },
    metric: METRIC,
    grade: { type: 'string', enum: TREND_GRADES },
    silhouette_spec: { type: 'string', description: '디자인 스펙으로 바로 옮길 수 있는 구절. 토 셰이프·힐·소재·클로저·부자재' },
  },
}

const MACRO = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'statement', 'narrative', 'sub_trends', 'drivers', 'palette', 'materials', 'details', 'key_items', 'grade', 'next_season_call', 'confidence'],
  properties: {
    name: { type: 'string', description: '매크로트렌드 이름. 두 단어. 예: MARE NOIR, BUCOLIC SLUMBER' },
    statement: { type: 'string', description: '한 문장 요약. 리포트 하단 인용구로 쓰인다' },
    narrative: { type: 'string', description: '3문단. 무드 → 신발에 어떻게 나타나는가 → 팔레트' },
    sub_trends: { type: 'array', description: '서브트렌드 칩 3~4개', items: { type: 'string' } },
    drivers: { type: 'array', description: '이 매크로를 떠받치는 성장 지표 3개', items: METRIC },
    palette: { type: 'array', description: '컬러 8~9개', items: COLOR },
    materials: { type: 'array', description: '소재 4개', items: METRIC },
    details: { type: 'array', description: '디테일 4개. 예: 브로그 펀칭, 모카신 웰트 심', items: METRIC },
    key_items: { type: 'array', description: '여성 3 · 남성 3 · 키즈 3', items: KEY_ITEM },
    grade: { type: 'string', enum: TREND_GRADES },
    next_season_call: { type: 'string', description: '예측 시즌에 이 매크로가 어떻게 되는가. 관측 시즌 대비 무엇이 커지고 무엇이 빠지는지 한두 문장. 근거를 함께.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: '선행 지표가 많고 서로 일치하면 high, 한 갈래뿐이면 low' },
  },
}

export const DOSSIER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['season', 'forecast_season', 'evidence_season', 'season_title', 'powershift', 'season_narrative', 'macrotrends', 'yearly_context', 'method_note', 'open_questions', 'sources'],
  properties: {
    season: { type: 'string', description: '예: SS27, FW26' },
    forecast_season: { type: 'string', description: '예측 대상 시즌. 예: SS27' },
    evidence_season: { type: 'string', description: '근거로 삼은 관측 시즌. 예: FW26' },
    season_title: { type: 'string', description: '예측 시즌 제목. 예: A RAW RENAISSANCE, ANTIDOTE TO SUFFERING' },
    powershift: { type: 'string', description: '이 시즌을 움직이는 큰 힘 한 단어~두 단어. 예: FUTUREKIND' },
    season_narrative: { type: 'string', description: '4~6문단. 근거 시즌에서 관측된 것이 예측 시즌에 어떻게 전개되는지. 마지막 문단에서 매크로 4개를 소개한다' },
    macrotrends: { type: 'array', description: '정확히 4개', items: MACRO },
    yearly_context: {
      type: 'array',
      description: '연도별 흐름. 최근 3~5개 시즌을 한 줄씩. 각 항목에 출처 URL을 단다',
      items: {
        type: 'object', additionalProperties: false,
        required: ['season', 'headline', 'what_changed', 'source_url'],
        properties: {
          season: { type: 'string' },
          headline: { type: 'string' },
          what_changed: { type: 'string', description: '전 시즌 대비 무엇이 달라졌는가' },
          source_url: { type: 'string' },
        },
      },
    },
    method_note: { type: 'string', description: '어떤 소스를 몇 번 확인했고 무엇이 한계였는지' },
    open_questions: { type: 'array', items: { type: 'string' } },
    sources: {
      type: 'array',
      description: '본문에 쓰인 모든 출처. 제목과 URL을 함께 둔다',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'url', 'used_for'],
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          used_for: { type: 'string', description: '이 출처가 무엇을 뒷받침하는가' },
        },
      },
    },
  },
}

function dossierDir(root) {
  const d = join(root, '.cache', 'research')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

/** 시즌 도시에 조사.
 *  ① 매크로 후보 잡기 → ② 매크로별 개별 심층 조사 → ③ 연도 흐름 → ④ 하나로 합치기
 *  한 번에 다 물으면 응답이 얕아지고 상류 연결도 먼저 끊긴다. */
/** FW26 → SS27, SS26 → FW26. 형식을 못 읽으면 그대로 둔다. */

/** 조사 결과 다듬기 · 모델이 메모체로 쓸 때가 있어 마지막에 한 번 걸러 준다.
 *  URL 은 건드리지 않는다 (출처가 깨진다). */
export function tidyProse(v) {
  if (typeof v === 'string') {
    // URL 을 잠시 빼 두고 본문만 손본다
    const urls = []
    let s = v.replace(/https?:\/\/[^\s)\]]+/g, (m) => { urls.push(m); return '\u0000' + (urls.length - 1) + '\u0000' })
    s = s
      .replace(/\s*(->|=>|→|⟶)\s*/g, '에서 ')       // 화살표는 연결어로
      .replace(/\s+[—–]\s+/g, ', ')                  // 긴 대시는 쉼표로
      .replace(/(?<=\S)\s-\s(?=\S)/g, ', ')         // 문장 중간의 하이픈 연결
      .replace(/^\s*[-•*]\s+/gm, '')                 // 줄머리 불릿
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.])/g, '$1')
      .trim()
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => urls[Number(i)])
  }
  if (Array.isArray(v)) return v.map(tidyProse)
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, val] of Object.entries(v)) {
      // 기계가 쓰는 키와 주소는 그대로 둔다
      out[k] = (k === 'attribute' || k.endsWith('_url') || k === 'url' || k === 'hex' || k === 'pantone_tcx')
        ? val : tidyProse(val)
    }
    return out
  }
  return v
}

export function nextSeason(s) {
  const m = /^(SS|FW)\s*'?(\d{2})$/i.exec(String(s ?? '').trim())
  if (!m) return null
  const half = m[1].toUpperCase()
  const yy = Number(m[2])
  return half === 'SS' ? `FW${String(yy).padStart(2, '0')}` : `SS${String((yy + 1) % 100).padStart(2, '0')}`
}

export async function researchDossier(deps, root, opts) {
  const { ask } = deps
  const { categoryEn, season, priceBand, brands = [], deep = false, onStep, langName = 'English' } = opts
  const key = createHash('sha256').update(JSON.stringify(['dossier4-forecast', langName, categoryEn, season, priceBand ?? '', brands, deep])).digest('hex').slice(0, 24)
  const file = join(dossierDir(root), `${key}.json`)
  if (existsSync(file)) return { ...JSON.parse(readFileSync(file, 'utf8')), cached: true }

  const LANG = langName
  // 이번 시즌을 정리하는 자료는 이미 시중에 많다. 디자인에 쓸모 있는 건 다음 시즌 예측이다.
  // 그래서 이번 시즌은 "근거", 다음 시즌이 "대상"이다.
  const FORECAST = nextSeason(season) ?? season
  const base = `출력 언어: 모든 문자열을 ${LANG}로 쓴다. 검색은 어떤 언어로 하든 좋다. 브랜드·모델명은 공식 표기 그대로 둔다.

이 문서는 **${FORECAST} 예측서**다. ${season}은 근거이지 주제가 아니다.
대상 시즌: ${FORECAST} (예측)  ·  근거 시즌: ${season} (관측)
품목: ${categoryEn}${priceBand ? ` · 가격대 ${priceBand}` : ''}${brands.length ? ` · 참고 브랜드 ${brands.join(', ')}` : ''}

예측 방법:
- ${season}에서 실제로 관측된 것(쇼, 리테일 랭킹, 품절, 검색량, 소재 조달)을 근거로 삼는다.
- 거기서 ${FORECAST}에 무엇이 커지고, 무엇이 정점을 지나고, 무엇이 새로 들어오는지를 판단한다.
- 이번 시즌 요약에 그치면 실패다. 문장마다 "${FORECAST}에 어떻게 되는가"가 있어야 한다.
- 선행 지표(리드타임이 긴 소재 발주, 프리폴/크루즈 컬렉션, 공급사 신소재, 특허·상표 출원)를 우선한다.

${SOURCE_NOTE}

${GRADE_NOTE}

읽기 규칙 (반드시 지킬 것):
- 화살표와 대시를 문장 연결에 쓰지 않는다. "->", "→", "—", " - " 금지. 문장으로 풀어 쓴다.
  나쁨: "실버 하드웨어 -> 청키 체인 확대"
  좋음: "실버 하드웨어가 자리를 잡으면서 청키 체인으로 넓어진다."
- 개조식 나열 대신 완결된 문장을 쓴다. 각 문장은 주어와 서술어를 갖춘다.
- 항목 이름 뒤에 콜론을 붙여 설명을 잇지 않는다. 이름과 설명은 별개 필드다.
- 괄호 안에 출처 URL을 늘어놓지 않는다. 출처는 source_url 필드에만 넣는다.
- 한 문장은 60자 안팎으로 끊는다. 쉼표로 세 번 이상 잇지 않는다.


규칙:
- 웹 검색으로 실제 확인한 것만 씁니다. 공개된 % 수치를 못 찾으면 yoy_percent는 null로 두되, magnitude는 관측량으로 판단해 반드시 채웁니다.
- 리테일 랭킹·품절 표기·쇼 등장 횟수·검색 트렌드처럼 % 없이도 방향을 말할 수 있는 근거를 찾아 observed_note에 씁니다.
- source_url은 실제로 연 페이지의 URL이어야 합니다. 지어내지 마세요.
- 검색은 어떤 언어로 하든 좋습니다. 출력 문자열은 위에서 정한 언어로만 씁니다.
- 트렌드 리포트 업계(MICAM, Livetrend, WGSN, Pantone, Vogue Runway, Fashion Snoops 등)의 공개 자료와 브랜드 공식몰, 리테일러 랭킹 페이지를 함께 봅니다.`

  onStep?.('Mapping macrotrends')
  const plan = await ask({
    input: `${base}

${FORECAST} ${categoryEn}를 이끌 매크로트렌드 4개를 예측하세요.
각각 이름(두 단어, 대문자), 한 줄 요약, 서브트렌드 칩 3~4개를 답하세요.
서로 겹치지 않아야 하고, 넷을 합치면 ${FORECAST} 전체가 설명되어야 합니다.
넷 중 최소 하나는 ${season}에는 아직 작지만 ${FORECAST}에 올라올 신호여야 합니다.`,
    schema: {
      type: 'object', additionalProperties: false, required: ['season_title', 'powershift', 'macros'],
      properties: {
        season_title: { type: 'string' },
        powershift: { type: 'string' },
        macros: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false, required: ['name', 'statement', 'sub_trends'],
            properties: {
              name: { type: 'string' }, statement: { type: 'string' },
              sub_trends: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    name: 'dossier_plan',
  })

  const macros = (plan.data.macros ?? []).slice(0, 4)
  let searches = plan.searches

  onStep?.(`Researching ${macros.length} macrotrends`)
  const filled = await Promise.allSettled(macros.map(async (m) => {
    const r = await ask({
      input: `${base}

매크로트렌드 "${m.name}" (${m.statement}) 를 깊게 조사하세요.
서브트렌드: ${(m.sub_trends ?? []).join(', ')}

채울 것:
- narrative 3문단
- drivers 3개: 이 무드를 떠받치는 검색·소셜·쇼 성장 지표
- palette 8~9개: 실제 시즌 컬러. Pantone TCX 코드를 찾을 수 있으면 넣습니다
- materials 4개: 소재별 전년 대비 성장
- details 4개: 부자재·봉제·마감 디테일별 성장
- key_items 9개: 여성 3, 남성 3, 키즈 3. 각각 이름·설명·성장률·등급·스펙 구절
- grade: 이 매크로 전체의 등급`,
      schema: MACRO, name: 'macrotrend',
    })
    searches += r.searches
    return { ...r.data, name: r.data.name || m.name, statement: r.data.statement || m.statement }
  }))

  const macrotrends = filled.filter(r => r.status === 'fulfilled').map(r => r.value)

  onStep?.('Tracing the last few seasons')
  const yearly = await ask({
    input: `${base}

최근 3~5개 시즌의 ${categoryEn} 트렌드 흐름을 시즌별 한 줄로 정리하세요.
각 항목에 실제 출처 URL을 답니다. 무엇이 직전 시즌 대비 달라졌는지가 핵심입니다.
그리고 이번 시즌 서사(season_narrative)를 4~6문단으로 쓰세요. 마지막 문단에서 매크로 4개(${macrotrends.map(m => m.name).join(', ')})를 소개합니다.`,
    schema: {
      type: 'object', additionalProperties: false,
      required: ['season_narrative', 'yearly_context', 'method_note', 'open_questions', 'sources'],
      properties: {
        season_narrative: { type: 'string' },
        yearly_context: DOSSIER_SCHEMA.properties.yearly_context,
        method_note: { type: 'string' },
        open_questions: { type: 'array', items: { type: 'string' } },
        sources: DOSSIER_SCHEMA.properties.sources,
      },
    },
    name: 'dossier_context',
  })
  searches += yearly.searches

  const out = tidyProse({
    season,
    forecast_season: FORECAST,
    evidence_season: season,
    season_title: plan.data.season_title,
    powershift: plan.data.powershift,
    season_narrative: yearly.data.season_narrative,
    macrotrends,
    yearly_context: yearly.data.yearly_context ?? [],
    method_note: yearly.data.method_note ?? '',
    open_questions: yearly.data.open_questions ?? [],
    sources: yearly.data.sources ?? [],
    searches,
    collected_at: new Date().toISOString().slice(0, 10),
  })
  writeFileSync(file, JSON.stringify(out))
  return { ...out, cached: false }
}
