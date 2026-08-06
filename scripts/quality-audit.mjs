// 품질 감사 · 완료된 분석 JSON을 Gemini에 보여 주고 결함과 보완점을 받는다.
//   node scripts/quality-audit.mjs src/samples/sample_jewel_labdiamond.json
// 여러 건을 돌리면 서로 다른 단계·카테고리의 품질을 비교할 수 있다.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(resolve(ROOT, '.env'), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const KEY = env.GEMINI_API_KEY
if (!KEY) { console.error('GEMINI_API_KEY 가 .env 에 없다'); process.exit(1) }

const file = process.argv[2]
if (!file) { console.error('사용법: node scripts/quality-audit.mjs <run.json>'); process.exit(1) }
const st = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8'))

// 모델이 평가할 수 있게 압축한다. 이미지 자체가 아니라 구조와 문장을 본다.
const d = st.dossier ?? {}
const digest = {
  params: { itemType: st.params.itemType, line: st.params.line, endStage: st.params.endStage, lang: st.params.researchLang },
  competitors: st.competitors.map(c => ({ brand: c.brand, name: c.name, price: c.price_krw, class: c.competitor_class, traits: (c.design_traits ?? []).slice(0, 3), evidence: c.evidence_strength })),
  signals: st.signals.map(s => ({ label: s.label, axis: s.axis, confidence: s.confidence, sources: s.observed_count })),
  forecast: { from: d.evidence_season, to: d.forecast_season, title: d.season_title, powershift: d.powershift },
  macros: (d.macrotrends ?? []).map(m => ({ name: m.name, grade: m.grade, confidence: m.confidence, call: m.next_season_call, paletteLayers: [...new Set((m.palette ?? []).map(c => c.layer))] })),
  designs: st.designs.map(x => ({ id: x.spec.design_id, tier: x.spec.tier, rejected: x.rejected, images: x.images.map(i => i.view), promptSample: x.images.find(i => i.promptUsed)?.promptUsed?.slice(0, 140), has3d: !!x.model })),
}

const prompt = `당신은 주얼리 상품기획 20년차 심사위원입니다. 아래는 AI 디자인 에이전트가 한 번의 분석에서 만든 결과의 요약입니다.
실무(라인 기획·바잉·생산 의사결정) 관점에서 평가하세요.

${JSON.stringify(digest, null, 1)}

JSON 으로만 답하세요:
{"overall_score": 1~10, "strengths": ["..."], "defects": [{"where":"...","what":"...","severity":"high|mid|low"}], "improvements": [{"action":"구체적 수정 지시 (프롬프트/스키마/UI 중 무엇을 어떻게)","impact":"high|mid|low"}]}`

const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
})
const j = await r.json()
const text = j.candidates?.[0]?.content?.parts?.[0]?.text
if (!text) { console.error('Gemini 응답 없음:', JSON.stringify(j).slice(0, 300)); process.exit(1) }
console.log(text)
