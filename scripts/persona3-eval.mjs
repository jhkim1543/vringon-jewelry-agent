/* 페르소나 3명이 자기 실행 결과를 평가한다 ────────────────────────────
   글로만 물으면 "그럴듯한 말" 이 나온다. 실제로 만들어진 디자인 이미지를 함께 보여 주고,
   자기가 실행 전에 적어 둔 successLooksLike 를 잣대로 채점하게 한다.

   묻는 것 (사용자가 알고 싶어 한 것 그대로)
     · 내가 의도한 대로 돌았는가 · 어디서 어긋났는가
     · 쓰면서 느낀 단점·부담 (시간·비용·손이 더 가는 부분)
     · 디자인 자체가 쓸 만한가 (이미지를 보고)
     · 이걸 들고 내일 회의에 들어갈 수 있는가

   실행: node scripts/persona3-eval.mjs            → .personaqa/persona3-eval.json */
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

/** 생성 이미지 몇 장을 실제로 보여 준다 · 디자인 판단은 사진 없이 못 한다 */
function imagesOf(st, max = 4) {
  const out = []
  for (const p of st.pairs ?? []) {
    const url = p.versions?.[p.versions.length - 1]?.url
    if (!url?.startsWith('/samples/')) continue
    const f = join(ROOT, 'public', url.slice(1))
    if (!existsSync(f)) continue
    const ext = f.split('.').pop().toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    out.push({ id: p.id, title: p.title, dataUrl: `data:${mime};base64,${readFileSync(f).toString('base64')}` })
    if (out.length >= max) break
  }
  return out
}

/** 결과에서 사람이 판단할 재료만 · 필드 이름은 저장 구조를 그대로 따른다 */
function digest(st) {
  const d = { mode: st.params.mode, searches: st.searches, finished: st.finished }
  d.crawl = (st.crawl ?? []).map(c => ({ brand: c.brand, items: c.items.length,
    sample: c.items.slice(0, 5).map(i => `${i.name} ${i.price ?? ''}${i.currency ?? ''}`) }))
  d.shops = (st.shops ?? []).map(s => ({ shop: s.name, items: s.items.length,
    sample: (s.items ?? []).slice(0, 3).map(i => `${i.brand ?? ''} ${i.name} ${i.price ?? ''}`) }))
  if (st.trendReport) d.trendReport = {
    headline: st.trendReport.headline,
    summary: (st.trendReport.summary ?? '').slice(0, 1400),
    elements: (st.trendReport.elements ?? []).map(e => ({
      axis: e.axis,
      trends: (e.trends ?? []).map(t => ({ label: t.label, evidence: (t.evidence ?? '').slice(0, 200), mentions: t.mentions })),
    })),
    sources: (st.trendReport.sources ?? []).slice(0, 8),
    sourcesTotal: (st.trendReport.sources ?? []).length,
  }
  if (st.forecast) d.forecast = { horizon: st.forecast.horizon, thesis: (st.forecast.thesis ?? '').slice(0, 400),
    predictions: (st.forecast.predictions ?? []).map(p => `${p.axis}: ${p.call} (${p.confidence})`) }
  if (st.runway) d.runway = { looks: (st.runway.looks ?? []).length,
    seasons: [...new Set((st.runway.looks ?? []).map(l => l.season))],
    sample: (st.runway.looks ?? []).slice(0, 5).map(l => `${l.brand ?? ''} ${l.season} · ${(l.look_note ?? '').slice(0, 80)}`) }
  if (st.adoption) d.adoption = (st.adoption ?? []).slice(0, 10).map(a => `${a.basis}: ${(a.note ?? '').slice(0, 90)}`)
  if (st.insight) d.insight = {
    meaning: (st.insight.meaning ?? '').slice(0, 500), cultural: (st.insight.cultural ?? '').slice(0, 400),
    symbols: st.insight.symbols, forms: st.insight.forms, cliches: st.insight.cliches, cautions: st.insight.cautions,
    sourcesTotal: (st.insight.sources ?? []).length,
  }
  if (st.sets) d.sets = (st.sets ?? []).map(s => ({
    name: s.name, concept: (s.concept ?? '').slice(0, 200), metal: s.metal, surface: s.surface,
    stones: s.stones, motif: s.motif, dna: (s.design_dna ?? []).slice(0, 8), conceptArt: Object.keys(s.art ?? {}).length,
  }))
  d.references = (st.references ?? []).map(r => ({ slot: r.slot, title: r.title, subtitle: r.subtitle,
    hasPhoto: !!(r.shot || r.imageUrl), price: r.price ? `${r.price} ${r.currency ?? ''}` : null,
    reason: (r.reason ?? '').slice(0, 180) }))
  d.designs = (st.pairs ?? []).map(p => ({
    id: p.id, title: p.title, made: (p.versions?.length ?? 0) > 0,
    direction: p.direction ?? null, feature: p.feature ?? null,
    prompt: (p.prompt ?? '').slice(0, 600),
  }))
  return d
}

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ranAsIntended', 'whereItDiverged', 'painPoints', 'designVerdict', 'canTakeToMeeting', 'scores', 'wouldPayFor', 'topFixes'],
  properties: {
    ranAsIntended: { type: 'string', enum: ['yes', 'mostly', 'partly', 'no'], description: '내가 의도한 대로 돌았는가' },
    whereItDiverged: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' },
      description: '어긋난 지점 · 어느 필드/숫자를 보고 그렇게 판단했는지 대세요. 어긋난 게 없으면 그렇게 쓰세요.' },
    painPoints: {
      type: 'array', minItems: 1, maxItems: 4,
      items: {
        type: 'object', additionalProperties: false, required: ['what', 'howBad'],
        properties: {
          what: { type: 'string', description: '쓰면서 느낀 단점·부담 · 시간, 기다림, 손이 더 가는 부분, 비용 감각' },
          howBad: { type: 'string', enum: ['blocker', 'annoying', 'minor'] },
        },
      },
    },
    designVerdict: {
      type: 'object', additionalProperties: false, required: ['usable', 'howMany', 'why'],
      properties: {
        usable: { type: 'string', enum: ['yes', 'some', 'no'], description: '첨부 이미지를 실제로 보고 판단' },
        howMany: { type: 'string', description: '몇 개가 쓸 만한가 · "10개 중 3개" 처럼' },
        why: { type: 'string', description: '왜 그렇게 봤는가 · 형태·마감·볼륨·타깃 적합 중 무엇이 되고 무엇이 안 됐는지' },
      },
    },
    canTakeToMeeting: { type: 'boolean', description: '이 결과를 들고 내일 회의에 들어갈 수 있는가' },
    scores: {
      type: 'object', additionalProperties: false,
      required: ['intentMatch', 'researchDepth', 'designQuality', 'timeCost', 'trust'],
      properties: {
        intentMatch: { type: 'integer', minimum: 1, maximum: 5, description: '내 의도가 결과에 반영됐는가' },
        researchDepth: { type: 'integer', minimum: 1, maximum: 5 },
        designQuality: { type: 'integer', minimum: 1, maximum: 5, description: '이미지를 보고' },
        timeCost: { type: 'integer', minimum: 1, maximum: 5, description: '걸린 시간·수고 대비 얻은 것' },
        trust: { type: 'integer', minimum: 1, maximum: 5, description: '근거가 확인 가능하고 지어낸 티가 없는가' },
      },
    },
    wouldPayFor: { type: 'string', description: '내 돈으로 쓸 만한가 · 얼마면 쓸 것 같은지 감각으로' },
    topFixes: {
      type: 'array', minItems: 1, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false, required: ['fix', 'why'],
        properties: { fix: { type: 'string' }, why: { type: 'string' } },
      },
    },
  },
}

const personas = JSON.parse(readFileSync(join(OUT, 'persona3.json'), 'utf8'))
const LBL = { competitor: '경쟁사 트렌드', fashion: '패션 트렌드', collection: '주얼리 컬렉션' }
const took = { competitor: '약 53분', fashion: '약 43분', collection: '약 40분' }

const out = []
for (const [mode, p] of Object.entries(personas)) {
  const f = join(ROOT, 'src', 'samples', `run3_${mode}.json`)
  if (!existsSync(f)) { console.log(`… ${mode} 결과 없음`); continue }
  const st = JSON.parse(readFileSync(f, 'utf8'))
  const imgs = imagesOf(st)
  process.stdout.write(`${LBL[mode].padEnd(12)} ${p.name} · 이미지 ${imgs.length}장 … `)

  const text = `당신은 ${p.country} 의 ${p.role}, ${p.name} 입니다. ${p.years}년차.

당신의 브랜드: ${p.brandContext}
오늘의 상황: ${p.situation}
얻고 싶었던 것: ${p.goal}
실행 전에 당신이 적어 둔 성공 기준: ${p.successLooksLike}

당신이 화면에서 고른 설정:
${JSON.stringify(p.params, null, 1)}

이 실행은 ${took[mode]} 걸렸습니다.

돌아온 결과:
${JSON.stringify(digest(st), null, 1)}

첨부한 이미지는 이 실행이 실제로 만들어 낸 디자인입니다.

이제 당신의 일로 돌아가 냉정하게 답하세요.
 · 당신이 의도한 대로 돌았습니까? 어긋난 곳이 있으면 어느 필드·숫자를 보고 그렇게
   판단했는지 구체적으로 대세요.
 · 쓰면서 느낀 단점이나 부담은 무엇입니까? ${took[mode]} 을 기다린 것, 손이 더 가는 부분,
   비용 감각까지 솔직하게.
 · 디자인 자체는 쓸 만합니까? 이미지를 실제로 보고 판단하세요. 몇 개가 쓸 만한지 세어 주세요.
 · 이 결과를 들고 내일 회의에 들어갈 수 있습니까?
 · 좋게 봐주지 마세요. 당신 시간과 예산이 들어간 도구입니다.
 · 모든 답은 한국어로.`

  const input = imgs.length
    ? [{ role: 'user', content: [{ type: 'input_text', text }, ...imgs.map(i => ({ type: 'input_image', image_url: i.dataUrl }))] }]
    : text
  try {
    const { data } = await ask(KEY, { root: ROOT, input, schema: SCHEMA, name: `eval3_${mode}`, web: false })
    out.push({ mode, persona: { name: p.name, role: p.role, country: p.country }, review: data })
    const s = data.scores
    console.log(`의도 ${s.intentMatch} 조사 ${s.researchDepth} 디자인 ${s.designQuality} 시간 ${s.timeCost} 신뢰 ${s.trust} · ${data.designVerdict.howMany} · ${data.canTakeToMeeting ? '회의 가능' : '회의 불가'}`)
  } catch (e) { console.log('실패 · ' + String(e.message).slice(0, 90)) }
}

writeFileSync(join(OUT, 'persona3-eval.json'), JSON.stringify(out, null, 1))
console.log('\n→ .personaqa/persona3-eval.json')
