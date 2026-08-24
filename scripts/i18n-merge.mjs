// ── 번역 조각 병합 ──────────────────────────────────────────────
// 조각 JSON( { "영문 원문": ["한국어", "日本語"] } )을 KO·JA 사전 끝에 붙인다.
// 이미 있는 키는 건드리지 않는다 — 손으로 다듬어 둔 번역을 덮어쓰면 안 된다.
//
//   node scripts/i18n-merge.mjs <조각.json> [조각2.json ...]
//
// 붙인 뒤에는 반드시 `node scripts/i18n-audit.mjs` 를 돌릴 것.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FRAGS = process.argv.slice(2)
if (!FRAGS.length) {
  console.error('쓰는 법: node scripts/i18n-merge.mjs <조각.json> [...]')
  process.exit(2)
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const map = {}
for (const f of FRAGS) {
  if (!existsSync(f)) { console.log('없음:', f); continue }
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(f, 'utf8')))) {
    if (!map[k]) map[k] = v
  }
}

function merge(file, idx, banner) {
  const path = join(process.cwd(), file)
  let s = readFileSync(path, 'utf8')
  const lines = []
  let skipped = 0
  for (const [en, pair] of Object.entries(map)) {
    const v = Array.isArray(pair) ? pair[idx] : ''
    if (!v) continue
    if (s.includes(`'${esc(en)}':`)) { skipped++; continue }
    lines.push(en.length > 60 ? `  '${esc(en)}':\n    '${esc(v)}',` : `  '${esc(en)}': '${esc(v)}',`)
  }
  if (!lines.length) { console.log(`${file}  추가 0 · 기존 ${skipped}`); return }
  const i = s.lastIndexOf('\n}')
  s = s.slice(0, i) + '\n\n  ' + banner + '\n' + lines.join('\n') + s.slice(i)
  writeFileSync(path, s, 'utf8')
  console.log(`${file}  추가 ${lines.length} · 기존 ${skipped}`)
}

merge('src/core/i18n.ts', 0, '// ── 추가 번역 ────────────────────────────────────────────────')
merge('src/core/i18n.ja.ts', 1, '// ── 追加の翻訳 ────────────────────────────────────────────────')
