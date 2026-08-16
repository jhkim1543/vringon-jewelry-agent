// 새 룰이 실제로 물리는지 한 건씩 확인한다. 조건을 만들어 넣고 그 룰만 뜨는지 본다.
//   node scripts/rule-probe.mjs
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const root = process.cwd().split(String.fromCharCode(92)).join('/')
const dir = mkdtempSync(join(tmpdir(), 'ruleprobe-'))
const entry = join(dir, 'p.ts')
writeFileSync(entry, `
import { PACKS } from '${root}/src/core/packs'
import type { DesignSpec, LineProfile } from '${root}/src/core/types'
const pack = PACKS.jewelry
const base: Record<string, string | number | boolean> = {
  metal: '925 silver', plating: 'none', target_weight_g: 3, stone_count: 0, stone_size_mm: 0,
  setting_type: 'bezel', prong_count: 4, min_wall_thickness_mm: 1.3, chain_type: 'none',
  finish: 'matte', is_pair: false, is_new_mold: false, existing_mold_id: 'MLD-2024-5',
}
const mk = (itemType: string, over: Record<string, unknown>): DesignSpec =>
  ({ design_id: 'T', tier: 'push', category: 'jewelry', itemType, fields: { ...base, ...over } as any, fieldsLocked: [] })
const hit = (s: DesignSpec, l?: LineProfile | null) => pack.rules(s, l).map(r => r.rule + '/' + r.severity)
const cases: [string, string[]][] = [
  ['J-12 ring shank 0.9mm', hit(mk('band_ring', { min_wall_thickness_mm: 0.9 }))],
  ['J-13 polish stock 1.05', hit(mk('band_ring', { min_wall_thickness_mm: 1.05 }))],
  ['J-14 snake + pendant', hit(mk('pendant', { chain_type: 'snake', stone_count: 1, stone_size_mm: 2 }))],
  ['J-15 snake on chain necklace', hit(mk('chain_necklace', { chain_type: 'snake' }))],
  ['J-10 earring 7.5g', hit(mk('drop', { is_pair: true, target_weight_g: 7.5, stone_count: 1, stone_size_mm: 2 }))],
  ['J-10 earring 5.5g warn', hit(mk('drop', { is_pair: true, target_weight_g: 5.5, stone_count: 1, stone_size_mm: 2 }))],
  ['J-24 pave 3mm on 1.0 wall', hit(mk('band_ring', { setting_type: 'pave', stone_count: 10, stone_size_mm: 3, min_wall_thickness_mm: 1.0 }))],
  ['J-25 prong on 0.6 wall', hit(mk('pendant', { setting_type: 'prong', stone_count: 1, stone_size_mm: 3, min_wall_thickness_mm: 0.65 }))],
  ['J-27 prong wire 0.6', hit(mk('solitaire', { setting_type: 'prong', stone_count: 1, stone_size_mm: 4, prong_wire_mm: 0.6 }))],
  ['J-26 wide 7mm band 1.2', hit(mk('band_ring', { band_width_mm: 7, min_wall_thickness_mm: 1.2 }))],
  ['J-23 eternity channel', hit(mk('eternity', { setting_type: 'channel', stone_count: 16, stone_size_mm: 1.8 }))],
  ['J-28 post 0.6', hit(mk('stud', { post_diameter_mm: 0.6, stone_count: 1, stone_size_mm: 3 }))],
  ['J-29 pendant 1.2 gauge', hit(mk('pendant', { chain_type: 'cable', chain_gauge_mm: 1.2, stone_count: 1, stone_size_mm: 2 }))],
  ['J-17 vermeil on brass', hit(mk('band_ring', {}), { preset: 'x', baseMetal: 'plated_brass', coating: 'gold_vermeil', stone: 'none', coatingMicrons: 3 } as LineProfile)],
  ['J-17 vermeil 1.5um', hit(mk('band_ring', {}), { preset: 'x', baseMetal: '925_silver', coating: 'gold_vermeil', stone: 'none', coatingMicrons: 1.5 } as LineProfile)],
  ['J-19 rhodium 0.4um', hit(mk('band_ring', { plating: 'rhodium' }), { preset: 'x', baseMetal: '925_silver', coating: 'rhodium', stone: 'none', coatingMicrons: 0.4 } as LineProfile)],
  ['J-19 rhodium 2.6um', hit(mk('band_ring', { plating: 'rhodium' }), { preset: 'x', baseMetal: '925_silver', coating: 'rhodium', stone: 'none', coatingMicrons: 2.6 } as LineProfile)],
  ['J-20 ring 1.0um gold', hit(mk('band_ring', { plating: '18k gold' }), { preset: 'x', baseMetal: '925_silver', coating: 'gold_plated', stone: 'none', coatingMicrons: 1.0 } as LineProfile)],
  ['J-21 nickel-free on brass', hit(mk('band_ring', {}), { preset: 'x', baseMetal: 'plated_brass', coating: 'gold_plated', stone: 'none', compliance: ['nickel_free'] } as LineProfile)],
  ['J-22 silver 9g hallmark', hit(mk('cuff', { target_weight_g: 9, band_width_mm: 10, min_wall_thickness_mm: 1.6 }))],
  ['clean control', hit(mk('band_ring', { band_width_mm: 3, min_wall_thickness_mm: 1.4 }))],
]
for (const [name, hits] of cases) console.log(name.padEnd(30), hits.join(' ') || '(none)')
`)
try { console.log(execSync(`npx tsx "${entry}"`, { encoding: 'utf8' })) }
catch (e) { console.error(String(e.stdout||'')+String(e.stderr||e.message)); process.exitCode = 1 }
finally { rmSync(dir, { recursive: true, force: true }) }
