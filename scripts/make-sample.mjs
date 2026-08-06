// 샘플 Run 생성 · 실제 파이프라인 대신 서버 API를 그대로 써서 결과를 만든다.
// 브라우저 없이 돌려 JSON으로 떠 두면, 앱은 API 호출 없이 그 결과를 보여줄 수 있다.
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'http://localhost:5188'

const post = async (path, body) => {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  return j
}

const BRANDS = ['아식스', '아디다스', '나이키']

async function main() {
  console.log('1/4 competitors')
  const comp = await post('/api/research/competitors', {
    brands: BRANDS, categoryKo: '신발', typeKo: '러닝화', priceMin: 150000, priceMax: 450000,
  })
  console.log('   ', comp.products.length, 'products,', comp.searches, 'searches')

  console.log('2/4 trends')
  const tr = await post('/api/research/trends', {
    categoryKo: '신발', typeKo: '러닝화', brands: BRANDS, season: '2026 F/W',
    priceBandKo: '15만~45만원', wantReport: false,
  })
  console.log('   ', tr.signals.length, 'signals')

  console.log('3/4 images')
  const shots = []
  const prompts = [
    ['sketch', 'Technical fashion design sketch of one running shoe, strict lateral side view. Round toe, 31mm cushioned midsole stack, engineered mesh upper in 6 panels, lace closure. Flat line drawing on white, no text, no logo.'],
    ['render', 'One running shoe, strict lateral side view, studio product photography on seamless white. Round toe, 31mm midsole, engineered mesh upper, lace closure, soft even light, contact shadow. No text, no logo.'],
    ['q34', 'One running shoe, three-quarter front angle, studio product photography on seamless white. Engineered mesh upper, thick cushioned midsole. No text, no logo.'],
    ['top', 'One running shoe, top-down view showing the opening and toe shape, studio product photography on seamless white. No text, no logo.'],
    ['wear1', 'A person from mid-calf down wearing running shoes, walking on a plain light grey studio floor, side angle, natural daylight, shoes in sharp focus. No text, no logo, no brand marks.'],
    ['wear2', 'Close-up of running shoes worn by a person standing on a plain light grey studio floor, three-quarter angle, natural daylight. No text, no logo, no brand marks.'],
  ]
  for (const [key, prompt] of prompts) {
    const engine = key.startsWith('wear') ? 'detail' : key === 'sketch' ? 'fast' : 'detail'
    const r = await post('/api/image/generate', { prompt, engine })
    shots.push({ key, url: r.url, hash: r.hash, model: r.model })
    console.log('   ', key, r.model, r.cached ? '(cached)' : '')
  }

  console.log('4/4 writing json')
  mkdirSync(join(ROOT, 'src', 'samples'), { recursive: true })
  writeFileSync(join(ROOT, 'src', 'samples', 'raw.json'), JSON.stringify({ comp, tr, shots }, null, 2))
  console.log('done →', join('src', 'samples', 'raw.json'))
}

main().catch(e => { console.error('FAILED', e.message); process.exit(1) })
