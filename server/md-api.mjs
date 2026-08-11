// ── MD 리뷰 · 설정된 MD 페르소나가 셀렉 후보를 사진으로 보고 평가한다 ──
// 조사 API 와 달리 웹 검색이 필요 없다. 페르소나 + 스펙 + 실제 렌더를 주고
// 디자인마다 pick / hold / drop 과 그 이유, 고칠 점을 받는다.
// 페르소나의 우선순위는 "순서가 곧 중요도"로 전달한다 — 숫자 가중치보다 잘 동작한다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MD_MODEL = 'gpt-5'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          design_id: { type: 'string' },
          verdict: { type: 'string', enum: ['pick', 'hold', 'drop'] },
          reason: { type: 'string', description: 'Why, in the persona voice. 2-3 sentences, concrete, tied to what is visible or specified.' },
          fix: { type: 'string', description: 'The one change that would most improve it. Empty string if none.' },
        },
        required: ['design_id', 'verdict', 'reason', 'fix'],
      },
    },
    pick_rationale: { type: 'string', description: 'One short paragraph: what separated the picks from the rest, in the persona voice.' },
  },
  required: ['reviews', 'pick_rationale'],
}

function cacheDir(root) {
  const d = join(root, '.cache', 'research')
  mkdirSync(d, { recursive: true })
  return d
}

function personaText(p, langName) {
  const lines = [
    `You are a merchandiser (MD) reviewing jewellery design candidates before line adoption.`,
    `Your profile: ${p.role}.`,
    p.market ? `Your market and channel: ${p.market}.` : '',
    p.customer ? `Your core customer: ${p.customer}.` : '',
    p.priorities?.length ? `Your evaluation priorities, in strict order of importance (earlier outweighs later): ${p.priorities.map((x, i) => `${i + 1}) ${x}`).join(' ')}` : '',
    p.rejectRules?.length ? `Hard reject rules — if any of these applies, the verdict is drop regardless of other merits: ${p.rejectRules.join('; ')}.` : '',
    p.checkpoints?.length ? `What you actually check in the photographs: ${p.checkpoints.join('; ')}.` : '',
    p.tone === 'soft'
      ? 'Speak constructively and encouragingly, but never hide a problem.'
      : 'Speak bluntly, the way you would in an internal line review. No pleasantries.',
    `Write reasons and fixes in ${langName}.`,
    'Judge only from the provided images and specs. Never invent attributes you cannot see.',
    'Do not use markdown symbols like -, ##, or ** in any text.',
  ]
  return lines.filter(Boolean).join('\n')
}

/** 렌더 캐시에서 이미지를 읽어 data URL 로 만든다 · 없으면 그 디자인은 스펙만으로 평가된다 */
function imagePart(root, hash) {
  try {
    const file = join(root, '.cache', 'images', `${hash}.png`)
    if (!existsSync(file)) return null
    const b64 = readFileSync(file).toString('base64')
    return { type: 'input_image', image_url: `data:image/png;base64,${b64}` }
  } catch { return null }
}

export async function mdReview(apiKey, root, { persona, item, designs, langName = 'Korean' }) {
  if (!persona?.role) throw new Error('MD 페르소나가 비어 있습니다')
  if (!designs?.length) throw new Error('평가할 디자인이 없습니다')

  // 같은 후보 묶음 + 같은 페르소나는 캐시로 돌려준다 (재실행 재과금 방지)
  const key = createHash('sha256').update(JSON.stringify(['mdrev1', langName, persona, item, designs.map(d => [d.id, d.imageHash ?? ''])])).digest('hex').slice(0, 24)
  const file = join(cacheDir(root), `${key}.json`)
  if (existsSync(file)) return { ...JSON.parse(readFileSync(file, 'utf8')), cached: true }

  const content = [{ type: 'input_text', text: `Candidates for the ${item} line. For each design: verdict, reason, fix.` }]
  for (const d of designs) {
    content.push({
      type: 'input_text',
      text: `design_id: ${d.id} · tier: ${d.tier}${d.recipe ? ` · concept direction: ${d.recipe}` : ''}\nspec: ${d.spec}${d.costNote ? `\ncost: ${d.costNote}` : ''}`,
    })
    const img = d.imageHash ? imagePart(root, d.imageHash) : null
    if (img) content.push(img)
  }

  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MD_MODEL,
      reasoning: { effort: 'medium' },
      input: [
        { role: 'system', content: [{ type: 'input_text', text: personaText(persona, langName) }] },
        { role: 'user', content },
      ],
      text: { format: { type: 'json_schema', name: 'md_review', schema: SCHEMA, strict: true } },
    }),
  })
  if (!r.ok) throw new Error(`OpenAI md-review ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const j = await r.json()
  const msg = j.output?.find(o => o.type === 'message')
  const text = msg?.content?.[0]?.text
  if (!text) throw new Error('MD 리뷰 응답이 비어 있습니다')
  const data = JSON.parse(text)
  writeFileSync(file, JSON.stringify(data))
  return data
}
