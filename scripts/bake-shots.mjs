// 조사 사진 굽기 · 샘플 JSON의 경쟁사·베스트셀러 사진을 지금 내려받아
// public/samples/ 에 저장하고, image_urls[0]을 로컬 경로로 바꾼다.
// 외부 직링크는 썩고, 정적 배포(Pages)에는 프록시가 없다. 실물은 구워야 남는다.
//   node scripts/bake-shots.mjs            # src/samples/sample_*.json 전부
//   node scripts/bake-shots.mjs <file...>  # 지정 파일만
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'samples')

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept-Language': 'en-GB,en;q=0.9,ko;q=0.8',
}
const fetchImage = async (u) => {
  const r = await fetch(u, { headers: { ...UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8', Referer: new URL(u).origin + '/' }, redirect: 'follow' })
  if (!r.ok) throw new Error(String(r.status))
  const type = r.headers.get('content-type') || ''
  if (!type.startsWith('image/')) throw new Error('not image')
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length < 4000) throw new Error('too small')   // 트래킹 픽셀·아이콘 배제
  if (buf.length > 12e6) throw new Error('too large')
  return buf
}
const pageImage = async (u) => {
  const r = await fetch(u, { headers: { ...UA, Accept: 'text/html,*/*;q=0.8' }, redirect: 'follow' })
  if (!r.ok) throw new Error(String(r.status))
  const html = (await r.text()).slice(0, 800_000)
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    ?? html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i)
    ?? html.match(/"image"\s*:\s*"(https:[^"]+)"/)
    ?? html.match(/"image"\s*:\s*\[\s*"(https:[^"]+)"/)
  if (!m) throw new Error('no og:image')
  return m[1].replace(/&amp;/g, '&')
}

/** 후보를 차례로 시도한다: 직링크들 → 상품 페이지 og:image → 출처 페이지 og:image */
async function resolveShot(p) {
  const tried = []
  const candidates = [
    ...(p.image_urls ?? []).filter(u => /^https:/.test(u)).map(u => ({ kind: 'direct', u })),
    ...(p.product_url && /^https:/.test(p.product_url) ? [{ kind: 'page', u: p.product_url }] : []),
    ...(p.source_urls ?? []).filter(u => /^https:/.test(u)).slice(0, 2).map(u => ({ kind: 'page', u })),
  ]
  for (const c of candidates) {
    try {
      const buf = c.kind === 'direct' ? await fetchImage(c.u) : await fetchImage(await pageImage(c.u))
      return { buf, via: c.kind }
    } catch (e) { tried.push(`${c.kind}:${String(e.message).slice(0, 24)}`) }
  }
  return { buf: null, tried }
}

const args = process.argv.slice(2)
const files = args.length ? args
  : readdirSync(join(ROOT, 'src', 'samples')).filter(f => /^(sample_|qa_).*\.json$/.test(f)).map(f => join('src', 'samples', f))

let ok = 0, fail = 0, already = 0
for (const f of files) {
  const path = resolve(ROOT, f)
  const st = JSON.parse(readFileSync(path, 'utf8'))
  const items = [...(st.competitors ?? []), ...(st.bestsellers ?? [])]
  const report = []
  for (const p of items) {
    const cur = p.image_urls?.[0] ?? ''
    if (cur.startsWith('/samples/')) { already++; continue }
    const { buf, via, tried } = await resolveShot(p)
    const who = `${p.brand ?? p.retailer ?? '?'} ${(p.name ?? '').slice(0, 24)}`
    if (!buf) { fail++; report.push(`  MISS ${who} (${(tried ?? []).join(' / ')})`); continue }
    const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
    const rel = `/samples/shot_${hash}.webp`
    await sharp(buf).resize({ width: 720, withoutEnlargement: true }).webp({ quality: 80 }).toFile(join(OUT, `shot_${hash}.webp`))
    // 로컬 경로를 맨 앞에 · 원본 링크는 출처 증빙으로 뒤에 남긴다
    p.image_urls = [rel, ...(p.image_urls ?? []).filter(u => u !== rel)]
    ok++
    report.push(`  ok(${via}) ${who}`)
  }
  writeFileSync(path, JSON.stringify(st, null, 1))
  console.log(`${f} · ${items.length} items`)
  report.forEach(l => console.log(l))
}
console.log(`\nbaked ${ok} · miss ${fail} · already ${already}`)
