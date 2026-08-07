// ── 봇 차단 우회 · 유료 언블로커 (선택) ─────────────────────────────
// 명품몰 일부(Net-a-Porter, Selfridges, Pandora 등)는 서버급 봇 차단을 쓴다.
// 평범한 요청으로는 403이라 제품 사진을 못 가져온다.
//
// 여기서는 "무료 경로가 실패한 요청"에만 유료 경로를 태운다. 성공당 과금이라
// 실패는 돈이 나가지 않고, 이미 잘 되던 사이트는 계속 공짜로 간다.
//
// 키가 없으면 이 모듈은 통째로 꺼진 것처럼 동작한다 (설정 없이도 앱은 그대로 돈다).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 하루 호출 상한 · 설정 실수나 무한 재시도로 요금이 새지 않게 막는다 */
const DEFAULT_DAILY_CAP = 300

// .env 는 process.env 로 올라가지 않는다 (키를 브라우저 번들에서 떼어 놓기 위한 구조).
// 그래서 서버가 자기 env 객체를 여기에 넣어 준다.
let ENV = process.env
export function configureUnlocker(envObj) { ENV = { ...process.env, ...envObj } }

function env(k, fallback = '') { return String(ENV[k] ?? fallback).trim() }

export function unlockerStatus() {
  const provider = env('UNLOCKER_PROVIDER').toLowerCase()
  const key = env('UNLOCKER_KEY')
  const urlTemplate = env('UNLOCKER_URL')
  if (!key) return { on: false, reason: 'no key' }
  if (provider === 'brightdata') return { on: true, provider, zone: env('UNLOCKER_ZONE', 'web_unlocker1') }
  if (urlTemplate.includes('{url}')) return { on: true, provider: 'url' }
  if (urlTemplate) return { on: false, reason: 'UNLOCKER_URL needs a {url} placeholder' }
  return { on: false, reason: 'set UNLOCKER_PROVIDER=brightdata or UNLOCKER_URL' }
}

// ── 하루 사용량 · 디스크에 남겨 서버를 재시작해도 이어진다 ──────────
function counterFile(root) {
  const d = join(root, '.cache')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return join(d, 'unlocker-usage.json')
}
export function unlockerUsage(root) {
  const f = counterFile(root)
  const today = new Date().toISOString().slice(0, 10)
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'))
    return j.date === today ? j : { date: today, calls: 0, billed: 0 }
  } catch { return { date: today, calls: 0, billed: 0 } }
}
function bump(root, ok) {
  const u = unlockerUsage(root)
  u.calls += 1
  if (ok) u.billed += 1          // 성공한 것만 과금된다
  try { writeFileSync(counterFile(root), JSON.stringify(u)) } catch { /* 집계 실패가 조사를 막지 않는다 */ }
  return u
}

/** 바이트 앞머리로 이미지인지 본다 · 언블로커는 content-type을 그대로 주지 않을 때가 있다 */
export function sniffImage(buf) {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf.toString('ascii', 1, 4) === 'PNG') return 'image/png'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
  if (buf.toString('ascii', 4, 8) === 'ftyp' && buf.toString('ascii', 8, 12).includes('avif')) return 'image/avif'
  if (buf.toString('ascii', 0, 5) === '<?xml' || buf.toString('ascii', 0, 4) === '<svg') return 'image/svg+xml'
  return null
}

/** HTML에서 대표 제품 사진을 찾는다.
 *  og:image가 정석이지만 없는 쇼핑몰이 많다. srcset·preload·JSON 필드까지 훑는다.
 *  주소는 `//host/…`(프로토콜 생략)나 `/path`(상대)로 오는 경우가 흔해 정규화한다. */
export function findProductImage(html, pageUrl = '') {
  const abs = (u) => {
    if (!u) return null
    let s = u.replace(/&amp;/g, '&').trim()
    if (s.startsWith('//')) return 'https:' + s
    if (s.startsWith('http')) return s
    if (s.startsWith('/') && pageUrl) { try { return new URL(s, pageUrl).href } catch { return null } }
    return null
  }
  // 신뢰도 높은 순서. 각 패턴은 후보를 여러 개 낼 수 있으므로 전부 훑는다
  // (첫 후보가 로고라고 그 패턴을 통째로 버리면 진짜 사진을 놓친다).
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/gi,
    /"(?:image|imageUrl|mainImage|primaryImage)"\s*:\s*"([^"]+)"/gi,
    /"image"\s*:\s*\[\s*"([^"]+)"/gi,
    /<link[^>]+as=["']image["'][^>]+href=["']([^"']+)/gi,
    /srcset=["']\s*([^"'\s,]+)/gi,
    /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)/gi,
    /((?:https?:)?\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?)/gi,
  ]
  // 로고·아이콘·픽셀은 제품 사진이 아니다
  const junk = /logo|sprite|icon|favicon|placeholder|1x1|pixel|badge|flag|banner/i
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const u = abs(m[1])
      if (u && !junk.test(u)) return u
    }
  }
  throw new Error('no product image')
}

/**
 * 유료 경로로 한 번 가져온다. 꺼져 있거나 상한을 넘으면 null을 준다.
 * @returns {Promise<{buf: Buffer, type: string|null} | null>}
 */
export async function unlockedFetch(target, { root = process.cwd(), timeoutMs = 60_000 } = {}) {
  const st = unlockerStatus()
  if (!st.on) return null
  const cap = Number(env('UNLOCKER_DAILY_CAP', String(DEFAULT_DAILY_CAP))) || DEFAULT_DAILY_CAP
  if (unlockerUsage(root).calls >= cap) return null

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    let r
    if (st.provider === 'brightdata') {
      r = await fetch('https://api.brightdata.com/request', {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${env('UNLOCKER_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone: st.zone, url: target, format: 'raw' }),
      })
    } else {
      // ScrapingBee · ScraperAPI · ZenRows 등은 모두 "GET 엔드포인트 + url 파라미터" 모양이다
      r = await fetch(env('UNLOCKER_URL').replace('{url}', encodeURIComponent(target)), {
        signal: ctrl.signal, redirect: 'follow',
      })
    }
    const ok = r.ok
    bump(root, ok)
    if (!ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (!buf.length) return null
    const header = r.headers.get('content-type') || ''
    return { buf, type: sniffImage(buf) ?? (header.startsWith('image/') ? header : null) }
  } catch {
    bump(root, false)
    return null
  } finally { clearTimeout(timer) }
}
