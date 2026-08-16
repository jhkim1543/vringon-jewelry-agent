// ── 비전 QA · 실제로 만든 컷을 보고 스펙과 대조한다 ────────────────────
// md-api 와 같은 방식이다. 캐시의 PNG 를 base64 로 실어 input_image 로 주고,
// strict json_schema 로 받는다. 다른 점은 여기서 모델이 판정을 하지 않는다는 것이다 —
// 모델은 무엇이 보이는지만 답하고, 통과 여부는 클라이언트의 결정적 규칙(visionQa.ts)이 정한다.
// 판정까지 모델에게 맡기면 검사가 아니라 두 번째 의견이 된다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const QA_MODEL = 'gpt-5'

const QA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['checks', 'cross_view', 'worst_view', 'overall_note'],
  properties: {
    checks: {
      type: 'array',
      description: 'One entry for every check_id you were given, in the same order. Never add a check that was not given and never drop one.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['check_id', 'observed', 'observed_value', 'verdict', 'evidence_view', 'note'],
        properties: {
          check_id: { type: 'string', description: 'The bare identifier from inside the quotes on the check line, such as stone_count. Never the whole line, never the label.' },
          observed: { type: 'string', description: 'What the pictures actually show, as a short phrase. Never repeat the target back unless you truly saw it.' },
          observed_value: {
            type: 'string',
            description: 'The same observation as one bare machine value. For a count, the integer. For a setting, one of prong, bezel, pave, channel, mixed, none. For metal tone, one of white_silver, yellow_gold, rose_gold, dark_metal, two_tone. For finish, one of polished, matte, hammered. For a chain, one of cable, box, snake, curb, wheat, other, none. For a pair, true or false. For stone size against the piece, one of accent, small, medium, large. Write unclear when you cannot tell.',
          },
          verdict: {
            type: 'string',
            enum: ['match', 'mismatch', 'unclear'],
            description: 'match only when the picture agrees with the target. unclear when the cut does not show it well enough to say. Never guess a match.',
          },
          evidence_view: { type: 'string', description: 'The view label you judged this from, copied from the labels given. Empty string when no cut showed it.' },
          note: { type: 'string', description: 'One sentence on what you saw and where. Empty string when the verdict is match and there is nothing to add.' },
        },
      },
    },
    cross_view: {
      type: 'object',
      additionalProperties: false,
      required: ['verdict', 'differences', 'note'],
      properties: {
        verdict: {
          type: 'string',
          enum: ['same_object', 'minor_differences', 'different_object'],
          description: 'minor_differences covers highlight and shadow shifts that come from the camera moving. different_object means a feature that belongs to the piece itself changed, such as the stone count, the setting, the metal tone or the number of links.',
        },
        differences: {
          type: 'array',
          items: { type: 'string' },
          description: 'Each concrete difference, naming both view labels. Empty array when the cuts show the same piece.',
        },
        note: { type: 'string' },
      },
    },
    worst_view: { type: 'string', description: 'The view label that departs most from the specification. Empty string when nothing is wrong.' },
    overall_note: { type: 'string', description: 'Two sentences at most on what these pictures do and do not let you verify.' },
  },
}

function qaSystemText(langName) {
  return [
    'You are a jewellery production QA inspector. You are given the written specification of one piece and the pictures that were generated for it. Your only job is to say whether the pictures show what the specification asked for.',
    '',
    'Judge only from the pixels. You are not reviewing taste, styling, lighting or commercial appeal, and you never repeat a target value back as if you had seen it.',
    '',
    'How to read jewellery pictures:',
    'A prong setting shows separate metal claws standing over the stone with daylight visible between them. A bezel setting shows one continuous metal rim wrapped around the whole girdle of the stone. Pave shows a field of many small stones sitting in a shared metal surface with tiny beads between them. Channel shows stones held in a row between two parallel metal walls, with no metal between neighbouring stones.',
    'Count only stones you can resolve as separate stones. When a field is too dense to count, say so instead of estimating. Count the stones on one piece, not on both pieces of a pair.',
    'Metal tone is what the colour reads as, not what the piece is made of. White silver, yellow gold, rose gold, dark oxidised metal, or two tone.',
    'Finish is read from the highlights. Polished throws a hard mirror reflection, matte scatters it into a soft even sheen, hammered breaks it into many small dents.',
    'A picture carries no ruler, so stone size is judged only against the piece itself. Accent means the stone barely interrupts the metal. Small means clearly visible while the metal still dominates. Medium means the stone is the focal point. Large means the stone dominates the piece.',
    '',
    'Rules:',
    'Every check you were given gets exactly one answer, using the check_id you were given. Do not invent checks and do not drop any.',
    'Use unclear whenever the cut does not show the feature well enough to be sure. Unclear is a correct answer here and it costs nothing. A wrong match is the one thing this check exists to prevent.',
    'The first cut is the reference. When cuts disagree, describe the disagreement rather than picking a winner.',
    `Write observed, note and overall_note in ${langName}. Keep observed_value in the machine vocabulary you were given.`,
    'Do not use markdown symbols like -, ##, or ** in any text.',
  ].join('\n')
}

function cacheDir(root) {
  const d = join(root, '.cache', 'research')
  mkdirSync(d, { recursive: true })
  return d
}

/** 렌더 캐시에서 컷을 읽어 data URL 로 · 샘플로 굳힌 런은 public/samples 에 있다.
 *  detail 을 high 로 둔다 — 작은 스톤은 저해상도로 보면 개수가 안 나온다. */
function imagePart(root, hash) {
  const tries = [
    [join(root, '.cache', 'images', `${hash}.png`), 'image/png'],
    [join(root, 'public', 'samples', `${hash}.png`), 'image/png'],
    [join(root, 'public', 'samples', `${hash}.webp`), 'image/webp'],
  ]
  for (const [file, mime] of tries) {
    if (!existsSync(file)) continue
    try {
      const b64 = readFileSync(file).toString('base64')
      return { type: 'input_image', image_url: `data:${mime};base64,${b64}`, detail: 'high' }
    } catch { /* 다음 후보로 */ }
  }
  return null
}

export async function visionQa(apiKey, root, { item, spec, surface = 'render', checks = [], views = [], langName = 'Korean' }) {
  if (!checks.length) throw new Error('검사 항목이 비어 있습니다')
  if (!views.length) throw new Error('검사할 컷이 없습니다')

  // 같은 컷 + 같은 검사 목록이면 캐시로 돌려준다 (재실행 재과금 방지).
  // 컷 해시가 키에 들어가므로, 이미지를 다시 만든 뒤의 재검사는 반드시 실제로 돈다.
  const key = createHash('sha256').update(JSON.stringify([
    'visqa2', langName, item, spec, surface,
    checks.map(c => [c.id, c.target]),
    views.map(v => [v.view, v.hash]),
  ])).digest('hex').slice(0, 24)
  const file = join(cacheDir(root), `${key}.json`)
  if (existsSync(file)) return { ...JSON.parse(readFileSync(file, 'utf8')), cached: true }

  const surfaceLine = surface === 'sketch'
    ? 'What follows is a black ink technical sketch, not a photograph. Judge geometry only, and answer unclear for anything that would need colour or surface finish.'
    : 'What follows are the studio pictures generated for this piece.'

  const head = [
    `Piece: ${item}.`,
    `Written specification: ${spec}.`,
    surfaceLine,
    `The first cut is the reference. Cuts, in order: ${views.map(v => v.view).join(', ')}.`,
    // id 를 따옴표로 감싸고 줄 앞에 둔다. 예전에는 줄 전체가 check_id 로 되돌아온 적이 있다.
    'Checks to answer. Each line starts with the check_id in quotes. Put that exact quoted string, and nothing else, in the check_id field:',
    ...checks.map(c => `"${c.id}" — ${c.label} — the specification asks for: ${c.target}`),
  ].join('\n')

  const content = [{ type: 'input_text', text: head }]
  const seen = []
  for (const v of views) {
    const img = imagePart(root, v.hash)
    if (!img) continue
    content.push({ type: 'input_text', text: `view label: ${v.view}${seen.length === 0 ? ' (reference cut)' : ''}` })
    content.push(img)
    seen.push(v.view)
  }
  if (!seen.length) throw new Error('컷 파일을 캐시에서 찾지 못했습니다')

  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: QA_MODEL,
      reasoning: { effort: 'medium' },
      input: [
        { role: 'system', content: [{ type: 'input_text', text: qaSystemText(langName) }] },
        { role: 'user', content },
      ],
      text: { format: { type: 'json_schema', name: 'vision_qa', schema: QA_SCHEMA, strict: true } },
    }),
  })
  if (!r.ok) throw new Error(`OpenAI vision-qa ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const j = await r.json()
  const msg = j.output?.find(o => o.type === 'message')
  const text = msg?.content?.[0]?.text
  if (!text) throw new Error('비전 QA 응답이 비어 있습니다')
  const data = JSON.parse(text)
  data.views_read = seen              // 무엇을 실제로 봤는지 남긴다
  writeFileSync(file, JSON.stringify(data))
  return data
}
