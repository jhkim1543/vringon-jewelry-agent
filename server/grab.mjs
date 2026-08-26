// ── 제품 사진 가져오기 · 한 곳에서만 정의한다 ────────────────────────
//
// 예전에 이 로직이 두 벌이었다. /api/shot 쪽은 4단계 폴백을 제대로 갖췄고,
// 레퍼런스 DNA 쪽은 `unlockedFetch` 하나만 불렀는데, 그 함수는 Response 가 아니라
// { buf, type } 을 돌려준다. DNA 쪽이 `r.ok` 를 보고 있어서 언제나 undefined 였고,
// **레퍼런스 사진이 단 한 장도 비전 모델에 들어가지 않았다.** 오류도 안 났다 —
// 그냥 "이미지 미확인" 으로 조용히 넘어가서, 열 개 디자인이 설명글만 보고 나왔다.
// 그래서 경로를 하나로 합친다. 두 벌이면 한 벌은 반드시 썩는다.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findProductImage, unlockedFetch } from './unlock.mjs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const headersFor = (referer, accept) => ({
  'User-Agent': UA,
  Accept: accept,
  'Accept-Language': 'en-GB,en;q=0.9,ko;q=0.8',
  Referer: referer,
})

const IMG_ACCEPT = 'image/avif,image/webp,image/*,*/*;q=0.8'
const HTML_ACCEPT = 'text/html,*/*;q=0.8'

/** 직링크 한 방 · 핫링크 차단을 피하려고 그 사이트의 첫 페이지를 리퍼러로 둔다 */
async function fetchImage(imgUrl) {
  const r = await fetch(imgUrl, { headers: headersFor(new URL(imgUrl).origin + '/', IMG_ACCEPT), redirect: 'follow' })
  if (!r.ok) throw new Error(String(r.status))
  const type = r.headers.get('content-type') || ''
  if (!type.startsWith('image/')) throw new Error('not image')
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > 8e6) throw new Error('too large')
  return { buf, type }
}

/** 상품 페이지에서 대표 사진 주소를 캐낸다 */
async function pageImage(pageUrl) {
  const r = await fetch(pageUrl, { headers: headersFor(new URL(pageUrl).origin + '/', HTML_ACCEPT), redirect: 'follow' })
  if (!r.ok) throw new Error(String(r.status))
  return findProductImage((await r.text()).slice(0, 800_000), pageUrl)
}

/** 유료 언블로커 · 무료 경로가 전부 실패했을 때만 쓴다 (성공당 과금) */
async function paidImage(pageUrl, root) {
  const page = await unlockedFetch(pageUrl, { root })
  if (!page) return null
  if (page.type) return { buf: page.buf, type: page.type }   // 페이지 대신 이미지가 바로 오기도 한다
  const imgUrl = findProductImage(page.buf.toString('utf8').slice(0, 800_000), pageUrl)
  try { return await fetchImage(imgUrl) } catch { /* 이미지도 막히면 유료로 한 번 더 */ }
  const img = await unlockedFetch(imgUrl, { root })
  return img?.type ? { buf: img.buf, type: img.type } : null
}

const cacheDir = (root) => {
  const d = join(root, '.cache', 'shots')
  mkdirSync(d, { recursive: true })
  return d
}

/**
 * 직링크 → 페이지 og:image → 유료 언블로커 순으로 시도한다.
 * 디스크에 캐시하므로 같은 사진을 두 번 받지 않는다. 실패는 null 이다 (던지지 않는다).
 * @returns {Promise<{buf: Buffer, type: string} | null>}
 */
export async function grabImage({ src = '', pages = [], root = process.cwd() }) {
  const list = pages.filter(x => /^https?:\/\//.test(x))
  const direct = /^https?:\/\//.test(src) ? src : ''
  if (!direct && !list.length) return null

  const dir = cacheDir(root)
  const key = createHash('sha256').update(JSON.stringify(['grab1', direct, ...list])).digest('hex').slice(0, 24)
  const file = join(dir, `${key}.img`)
  // 실패도 기억한다 · 죽은 링크를 매번 다시 두드리면 한 건에 1분씩 샌다
  const miss = join(dir, `${key}.miss`)
  if (existsSync(file)) {
    const type = existsSync(file + '.type') ? readFileSync(file + '.type', 'utf8') : 'image/jpeg'
    return { buf: readFileSync(file), type }
  }
  if (existsSync(miss)) return null

  let got = null
  if (direct) { try { got = await fetchImage(direct) } catch { /* 페이지 폴백으로 */ } }
  for (const pg of list) {
    if (got) break
    try { got = await fetchImage(await pageImage(pg)) } catch { /* 다음 후보로 */ }
  }
  for (const pg of list) {
    if (got) break
    try { got = await paidImage(pg, root) } catch { /* 유료 경로도 실패하면 포기 */ }
  }
  if (!got) { writeFileSync(miss, ''); return null }
  writeFileSync(file, got.buf)
  writeFileSync(file + '.type', got.type)
  return got
}
