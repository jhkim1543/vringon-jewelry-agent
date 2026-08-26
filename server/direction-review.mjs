// ── 조사 방향 반영도 검증 · Gemini 가 심사한다 ───────────────────────
// 유저가 적은 "트렌드 조사 방향"이 트렌드 리포트에 실제로 반영됐는지를
// 조사를 만든 모델(OpenAI)이 아닌 **다른 눈**(Gemini)으로 심사한다.
// 같은 모델에게 자기 결과를 심사시키면 후하게 나온다 — 남의 눈이 필요한 자리다.
//
// scripts/direction-review.mjs 가 이 함수를 불러 샘플들을 심사하고,
// 여기서 나온 개선점이 프롬프트에 반영된다 (반영 시 agr 캐시 버전을 올릴 것).
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://generativelanguage.googleapis.com/v1beta'

function loadKey() {
  for (const f of ['.env.local', '.env']) {
    const p = join(ROOT, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.*)\s*$/)
      if (m) return m[2].replace(/^["']|["']$/g, '')
    }
  }
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

/** 리포트 하나를 심사한다 · 방향 반영도 0~10 과 근거·놓친 것·개선 제안 */
export async function reviewDirection({ direction, itemKo, regions, report }) {
  const key = loadKey()
  if (!key) throw new Error('GEMINI_API_KEY 미설정')

  const digest = {
    headline: report.headline,
    summary: report.summary,
    axes: report.elements.map(e => ({
      axis: e.axis,
      trends: e.trends.map(t => ({ label: t.label, evidence: t.evidence.slice(0, 200) })),
    })),
  }

  const prompt = `당신은 주얼리 시장 조사 리포트의 감리자입니다. 아래는 유저가 적은 "조사 방향"과,
그 방향을 따르라고 지시받은 조사 에이전트가 만든 트렌드 리포트입니다.

조사 방향(유저 입력): "${direction}"
품목: ${itemKo} · 지역: ${regions}

리포트:
${JSON.stringify(digest, null, 1).slice(0, 14000)}

다음을 JSON 하나로만 답하세요 (다른 글 없이):
{
 "reflection_score": 0~10 정수. 방향이 조사 질문과 결과에 얼마나 실렸는가,
 "reflected": [방향의 어떤 요소가 어느 축·라벨에 실렸는지 구체적으로, 각 1문장, 최대 5개],
 "missed": [방향에 있었는데 리포트가 다루지 않은 요소, 각 1문장, 최대 4개. 없으면 빈 배열],
 "off_direction_honesty": "방향과 어긋나는 사실도 보고하고 있는가? 한 문장 판정",
 "prompt_improvements": [조사 지시문(프롬프트)을 어떻게 고치면 방향 반영이 나아질지, 실행 가능한 제안, 최대 4개]
}`

  const r = await fetch(`${BASE}/models/gemini-3.1-pro-preview:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  })
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const j = await r.json()
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini 응답 비어 있음')
  return JSON.parse(text)
}
