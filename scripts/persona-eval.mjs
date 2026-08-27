/* 페르소나가 자기 실행 결과를 채점한다 · 그리고 여섯이 토론해 공통 개선점을 뽑는다.
   글로만 평가하면 "그럴듯한 말"이 나온다 — 실제로 생성된 디자인 이미지를 함께 보여 준다.

   evaluate : 6명이 각자 자기 기준으로 채점            → .personaqa/reviews.json
   debate   : 채점을 모아 토론하고 고칠 것을 정한다     → .personaqa/verdict.json
   실행: node scripts/persona-eval.mjs <evaluate|debate> */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
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

const save = (n, o) => { writeFileSync(join(OUT, n), JSON.stringify(o, null, 1)); console.log('→ .personaqa/' + n) }
const load = (n) => JSON.parse(readFileSync(join(OUT, n), 'utf8'))

/** 생성 이미지 몇 장을 base64 로 · 모델이 실제로 보게 한다 */
function imagesOf(st, max = 3) {
  const out = []
  for (const p of st.pairs ?? []) {
    const url = p.versions?.[p.versions.length - 1]?.url
    if (!url || !url.startsWith('/samples/')) continue
    const f = join(ROOT, 'public', url.replace(/^\//, ''))
    if (!existsSync(f)) continue
    const ext = f.split('.').pop().toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    out.push({ id: p.id, title: p.title, dataUrl: `data:${mime};base64,${readFileSync(f).toString('base64')}` })
    if (out.length >= max) break
  }
  return out
}

/** 결과에서 사람이 판단할 재료만 추린다 (원본은 수 MB 다).
 *  필드 이름은 실제 저장 구조를 그대로 따라야 한다 — 처음에 trendReport.axes / insight.summary 로
 *  잘못 읽어 "조사가 비어 있다" 는 왜곡된 평가를 만들었다. */
function digest(st) {
  const d = { mode: st.params.mode, searches: st.searches, finished: st.finished }
  d.crawl = (st.crawl ?? []).map(c => ({ brand: c.brand, items: c.items.length,
    sample: c.items.slice(0, 4).map(i => `${i.name} ${i.price ?? ''}${i.currency ?? ''}`) }))
  d.shops = (st.shops ?? []).map(s => ({ shop: s.name, items: s.items.length,
    sample: (s.items ?? []).slice(0, 3).map(i => `${i.brand ?? ''} ${i.name}`) }))
  if (st.trendReport) d.trendReport = {
    headline: st.trendReport.headline,
    summary: (st.trendReport.summary ?? '').slice(0, 1200),
    subQuestions: st.trendReport.sub_questions,
    elements: (st.trendReport.elements ?? []).map(e => ({
      axis: e.axis,
      trends: (e.trends ?? []).map(t => ({
        label: t.label, evidence: (t.evidence ?? '').slice(0, 220),
        mentions: t.mentions, sources: (t.source_urls ?? []).length,
      })),
    })),
    // 개수로 접으면 "출처가 없다" 는 억울한 감점이 나온다 · 실제 URL 을 몇 개 보여 준다
    sources: (st.trendReport.sources ?? []).slice(0, 8),
    sourcesTotal: (st.trendReport.sources ?? []).length,
  }
  if (st.forecast) d.forecast = { horizon: st.forecast.horizon, thesis: (st.forecast.thesis ?? '').slice(0, 300),
    predictions: (st.forecast.predictions ?? []).map(p => `${p.axis}: ${p.call} (${p.confidence}) — ${(p.why ?? '').slice(0, 90)}`) }
  if (st.runway) d.runway = { looks: (st.runway.looks ?? []).length,
    seasons: [...new Set((st.runway.looks ?? []).map(l => l.season))],
    sample: (st.runway.looks ?? []).slice(0, 4).map(l => `${l.brand ?? ''} ${l.season} · ${(l.note ?? l.title ?? '').slice(0, 70)}`) }
  if (st.adoption) d.adoption = (st.adoption ?? []).map(a => `${a.basis}: ${(a.note ?? a.signal ?? '').slice(0, 100)}`)
  if (st.insight) {
    const i = st.insight
    d.insight = {
      meaning: (i.meaning ?? '').slice(0, 500),
      cultural: (i.cultural ?? '').slice(0, 500),
      symbols: i.symbols, emotions: i.emotions, colors: i.colors,
      materials: i.materials, forms: i.forms, motion: i.motion,
      cliches: i.cliches, cautions: i.cautions,
      abstraction: i.abstraction,
      sources: (i.sources ?? []).slice(0, 8),
      sourcesTotal: (i.sources ?? []).length,
    }
  }
  if (st.sets) d.sets = (st.sets ?? []).map(s => ({
    name: s.name, concept: (s.concept ?? '').slice(0, 200), story: (s.story ?? '').slice(0, 200),
    metal: s.metal, surface: s.surface, stones: s.stones, silhouette: s.silhouette,
    motif: s.motif, palette: s.palette, avoid: (s.avoid ?? '').slice(0, 150),
    dna: (s.design_dna ?? '').slice(0, 300), lineup: !!s.lineup,
  }))
  d.references = (st.references ?? []).map(r => ({ slot: r.slot, title: r.title, subtitle: r.subtitle,
    hasPhoto: !!(r.shot || r.imageUrl), sourceUrl: r.sourceUrl,
    price: r.price ? `${r.price} ${r.currency ?? ''}` : null,
    reason: (r.reason ?? '').slice(0, 220), combo: r.trendCombo }))
  d.designs = (st.pairs ?? []).map(p => ({
    id: p.id, title: p.title, made: (p.versions?.length ?? 0) > 0, error: p.error ?? null,
    direction: p.direction ?? null,
    dna: p.dna ? JSON.stringify(p.dna).slice(0, 300) : null,
    prompt: (p.prompt ?? '').slice(0, 500),
  }))
  d.failedNote = st.failedNote ?? null
  return d
}

const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['scores', 'metExpectation', 'whatWorked', 'whatFailed', 'wouldUseAgain', 'topFixes'],
  properties: {
    scores: {
      type: 'object', additionalProperties: false,
      required: ['researchDepth', 'inputReflection', 'designFit', 'usability', 'trustworthiness'],
      properties: {
        researchDepth: { type: 'integer', minimum: 1, maximum: 5, description: '조사가 내 시장에 대해 실제로 쓸모 있는 깊이였는가' },
        inputReflection: { type: 'integer', minimum: 1, maximum: 5, description: '내가 넣은 조건(소재·가격·규격·지역)이 결과에 반영됐는가' },
        designFit: { type: 'integer', minimum: 1, maximum: 5, description: '생성된 디자인이 내가 원한 방향인가 (이미지를 실제로 보고)' },
        usability: { type: 'integer', minimum: 1, maximum: 5, description: '이 결과를 내 다음 업무에 바로 쓸 수 있는가' },
        trustworthiness: { type: 'integer', minimum: 1, maximum: 5, description: '근거가 확인 가능하고 지어낸 티가 없는가' },
      },
    },
    metExpectation: { type: 'boolean', description: '내 successLooksLike 기준을 충족했는가' },
    whatWorked: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } },
    whatFailed: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' }, description: '구체적으로 · 무엇이 어떻게 어긋났는지' },
    wouldUseAgain: { type: 'string', enum: ['yes', 'maybe', 'no'] },
    topFixes: {
      type: 'array', minItems: 1, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        required: ['fix', 'why', 'severity'],
        properties: {
          fix: { type: 'string', description: '무엇을 어떻게 고쳐야 하는지 · 실행 가능하게' },
          why: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
        },
      },
    },
  },
}

async function evaluate() {
  // 설정 파일이 곧 명단이다 · GPT 패널(persona_*)과 Gemini 패널(gpersona_*)을 함께 돈다
  const { readdirSync } = await import('node:fs')
  const cfgs = readdirSync(join(ROOT, '.sampleruns'))
    .filter(f => /^g?persona_.*\.cfg\.json$/.test(f)).sort()
  const prev = existsSync(join(OUT, 'reviews.json')) ? load('reviews.json').reviews : []
  const done = new Set(prev.map(r => r.slug))
  const reviews = [...prev]
  for (const cf of cfgs) {
    const cfg = JSON.parse(readFileSync(join(ROOT, '.sampleruns', cf), 'utf8'))
    const slug = cfg.name
    if (done.has(slug)) { console.log(`= ${slug} 이미 평가됨`); continue }
    const f = join(ROOT, 'src', 'samples', `${slug}.json`)
    if (!existsSync(f)) { console.log(`… ${slug} 결과 없음 · 건너뜀`); continue }
    const st = JSON.parse(readFileSync(f, 'utf8'))
    const p = cfg.persona
    const imgs = imagesOf(st)
    const text = `당신은 ${p.country} 의 ${p.role} 입니다. 이름은 ${p.name}.
${p.situation ? `오늘 이 도구를 연 상황: ${p.situation}` : ''}
이번에 얻고 싶었던 것: ${p.goal}
성공 기준(당신이 미리 적은 것): ${p.successLooksLike}

당신이 화면에서 고른 설정:
${JSON.stringify(cfg.params, null, 1)}

돌아온 결과(요약):
${JSON.stringify(digest(st), null, 1)}

첨부한 이미지는 이 실행이 실제로 만들어 낸 디자인입니다(있으면).

당신의 일로 돌아가서 냉정하게 평가하세요.
 · 당신이 넣은 구체 조건(소재·중량·가격대·규격·지역·연령)이 조사와 디자인에 실제로 반영됐습니까?
   반영 안 된 것이 있으면 어느 조건인지 이름을 대세요.
 · 이미지가 있으면 그것을 보고 판단하세요. 당신이 원한 형태·마감·볼륨감입니까?
 · 이 결과를 들고 내일 회의에 들어갈 수 있습니까? 없다면 무엇이 빠졌습니까?
 · 도구 설명("경쟁사·편집샵 크롤링 후 트렌드 리포트" / "런웨이를 주얼리 언어로 번역" /
   "하나의 Design DNA 를 공유하는 세트")이 약속한 것과 실제 결과가 같습니까?
 · 참고: 디자인 수는 검증 비용 때문에 원래 고른 수보다 줄여 실행했습니다. 수량 자체보다
   "내가 고른 수량이 화면 약속대로 해석됐는가" 를 보고, 나머지는 품질로 평가하세요.
 · 좋게 봐주지 마세요. 당신 돈과 시간이 들어간 도구입니다.`

    const input = imgs.length
      ? [{ role: 'user', content: [
          { type: 'input_text', text },
          ...imgs.map(i => ({ type: 'input_image', image_url: i.dataUrl })),
        ] }]
      : text
    process.stdout.write(`평가 ${slug} (${p.name}) 이미지 ${imgs.length} … `)
    try {
      const { data } = await ask(KEY, { input, schema: REVIEW_SCHEMA, name: 'review', web: false })
      reviews.push({ persona: { id: p.id, name: p.name, country: p.country, role: p.role,
        mode: cfg.params.mode, lang: cfg.params.analysisLang }, slug, review: data })
      const sc = data.scores
      console.log(`조사${sc.researchDepth} 반영${sc.inputReflection} 디자인${sc.designFit} 실용${sc.usability} 신뢰${sc.trustworthiness} · ${data.metExpectation ? '충족' : '미충족'}`)
      save('reviews.json', { reviews })
    } catch (e) {
      console.log('실패: ' + e.message.slice(0, 80))
    }
  }
  save('reviews.json', { reviews })
}

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['commonIssues', 'disagreements', 'verdict'],
  properties: {
    commonIssues: {
      type: 'array', minItems: 3, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'raisedBy', 'evidence', 'severity', 'fix', 'area'],
        properties: {
          title: { type: 'string' },
          raisedBy: { type: 'array', items: { type: 'string' }, description: '이 문제를 짚은 사람 이름들' },
          evidence: { type: 'string', description: '어느 실행에서 어떻게 드러났는지' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          area: { type: 'string', enum: ['research', 'prompt', 'design', 'ui', 'report', 'other'] },
          fix: { type: 'string', description: '구체적으로 무엇을 바꿔야 하는지' },
        },
      },
    },
    disagreements: { type: 'array', maxItems: 4, items: { type: 'string' }, description: '의견이 갈린 지점 · 왜 갈렸는지' },
    verdict: { type: 'string', description: '여섯 명의 합의 · 이 도구는 지금 어느 수준이고 무엇을 먼저 고쳐야 하는가' },
  },
}

async function debate() {
  const { reviews } = load('reviews.json')
  const input = `주얼리 기획 AI 도구를 서로 다른 나라·직군의 디자이너 ${reviews.length}명이 각자 써 보고 평가했습니다.
아래는 그들의 평가 전문입니다. 이제 여섯이 한자리에 모여 토론한다고 두고, 합의를 정리하세요.

${JSON.stringify(reviews, null, 1)}

규칙
 · 한 사람만 말한 불만은 "공통"이 아닙니다. 두 명 이상이 서로 다른 실행에서 같은 문제를 겪었을 때만 commonIssues 에 올리세요.
 · 각 문제에 어느 실행에서 어떻게 드러났는지(evidence) 를 붙이세요. 근거 없이 "부족하다" 는 쓰지 마세요.
 · fix 는 개발자가 바로 착수할 수 있는 수준으로 적으세요. "품질을 높인다" 같은 말은 금지.
 · 서로 어긋난 요구(예: 더 많은 디자인 vs 더 깊은 조사)가 있으면 disagreements 에 남기고, 어느 쪽을 먼저 할지 이유와 함께 정하세요.`
  const { data } = await ask(KEY, { input, schema: VERDICT_SCHEMA, name: 'verdict', web: false })
  save('verdict.json', data)
  console.log('\n── 공통 문제')
  for (const c of data.commonIssues) console.log(`  [${c.severity}] ${c.title} (${c.area}) · ${c.raisedBy.join(', ')}`)
  console.log('\n── 합의\n' + data.verdict)
}

const step = process.argv[2]
if (step === 'evaluate') await evaluate()
else if (step === 'debate') await debate()
else { console.error('evaluate | debate'); process.exit(1) }
