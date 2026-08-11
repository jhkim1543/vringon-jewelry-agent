// ── 브랜드 아이덴티티 설정 · 모든 에이전트 결과에 공통으로 실린다 ──────
import { useRef, useState } from 'react'
import type { BrandIdentity, BrandLogo, MdPersona } from '../core/brand'
import { EMPTY_BRAND, EMPTY_MD, brandPromptClause, isMdConfigured } from '../core/brand'
import { Tag } from './bits'

const PLACEMENTS: { id: BrandLogo['placement']; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'clasp', label: 'Clasp' },
  { id: 'pendant', label: 'Pendant face' },
]

function TokenList({ label, hint, items, onChange, placeholder }: {
  label: string; hint: string; items: string[]
  onChange: (v: string[]) => void; placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v || items.includes(v)) return
    onChange([...items, v]); setDraft('')
  }
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <span className="lbl">{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="chiplist">
          {items.map(t => (
            <span className="chip-in" key={t}>
              {t}
              <button onClick={() => onChange(items.filter(x => x !== t))} aria-label={`Remove ${t}`}>Remove</button>
            </span>
          ))}
          {!items.length && <span className="hint">{hint}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input className="input" style={{ maxWidth: 280 }} placeholder={placeholder}
            value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }} />
          <button className="btn btn-ghost btn-sm" onClick={add}>Add</button>
        </div>
      </div>
    </div>
  )
}

export default function BrandSetup({ brand, onSave, onClose }: {
  brand: BrandIdentity
  onSave: (b: BrandIdentity) => void
  onClose: () => void
}) {
  const [b, setB] = useState<BrandIdentity>(brand)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof BrandIdentity>(k: K, v: BrandIdentity[K]) => setB(p => ({ ...p, [k]: v }))
  // MD 페르소나 · 옛 저장본에는 없으므로 빈 값에서 시작한다
  const md: MdPersona = b.md ?? EMPTY_MD
  const setMd = (patch: Partial<MdPersona>) => setB(p => ({ ...p, md: { ...(p.md ?? EMPTY_MD), ...patch } }))

  const readLogo = (f: File) => {
    const r = new FileReader()
    r.onload = () => set('logo', {
      name: f.name, dataUrl: String(r.result),
      placement: b.logo?.placement ?? 'none', scale: b.logo?.scale ?? 'subtle',
    })
    r.readAsDataURL(f)
  }

  const [color, setColor] = useState({ name: '', hex: '#444AE8' })
  const addColor = () => {
    const n = color.name.trim() || color.hex
    if (b.colorPalette.some(c => c.hex === color.hex)) return
    set('colorPalette', [...b.colorPalette, { name: n, hex: color.hex }])
    setColor({ name: '', hex: '#444AE8' })
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <div>
            <h2>Brand identity</h2>
            <p className="hint">Whatever you put here rides along with every result, whichever agent you run.
              The agent decides the spec first; your brand rules sit on top of it.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <div className="modal-body">
          <div className="wcard">
            <h3><span className="n">1</span> Basics</h3>
            <div className="row"><span className="lbl">Name</span>
              <input className="input" style={{ maxWidth: 280 }} value={b.brandName}
                placeholder="e.g. VRINGON" onChange={e => set('brandName', e.target.value)} />
            </div>
            <div className="row"><span className="lbl">One line</span>
              <input className="input" style={{ flex: 1 }} value={b.tagline}
                placeholder="The brand in one sentence" onChange={e => set('tagline', e.target.value)} />
            </div>
          </div>

          <div className="wcard">
            <h3><span className="n">2</span> Logo</h3>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span className="lbl">File</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {b.logo ? (
                  <div className="logo-row">
                    <div className="logo-prev"><img src={b.logo.dataUrl} alt="Logo" /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{b.logo.name}</div>
                      <div className="hint">Kept in this browser only. Never uploaded.</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => set('logo', null)}>Remove</button>
                  </div>
                ) : (
                  <label className="dropzone">
                    <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg" hidden
                      onChange={e => { const f = e.target.files?.[0]; if (f) readLogo(f) }} />
                    Drop a logo file
                    <span className="dz-sub">PNG or SVG. A transparent background composites cleanly.</span>
                  </label>
                )}
              </div>
            </div>

            {b.logo && (<>
              <div className="row"><span className="lbl">Placement</span>
                <div className="chiprow">
                  {PLACEMENTS.map(p => (
                    <button key={p.id} className={`pick sm ${b.logo!.placement === p.id ? 'on' : ''}`}
                      onClick={() => set('logo', { ...b.logo!, placement: p.id })}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div className="row"><span className="lbl">Weight</span>
                <div className="chiprow">
                  {(['subtle', 'normal', 'bold'] as const).map(s => (
                    <button key={s} className={`pick sm ${b.logo!.scale === s ? 'on' : ''}`}
                      onClick={() => set('logo', { ...b.logo!, scale: s })}>
                      {s === 'subtle' ? 'Subtle' : s === 'normal' ? 'Normal' : 'Bold'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="row">
                <label className="chk">
                  <input type="checkbox" checked={b.applyLogoToImages}
                    onChange={e => set('applyLogoToImages', e.target.checked)} />
                  Leave the logo area empty in generated images
                </label>
              </div>
              <div className="row">
                <span className="hint">
                  Generators can't reproduce a logo accurately. With this on, nothing is drawn there and
                  <b> the spot you picked is left clean.</b> Composite the real file onto it afterwards.
                </span>
              </div>
            </>)}
          </div>

          <div className="wcard">
            <h3><span className="n">3</span> Brand rules</h3>
            <TokenList label="Signature" hint="The shapes people recognise you by"
              placeholder="e.g. angular metal plate at the heel"
              items={b.signatureElements} onChange={v => set('signatureElements', v)} />
            <TokenList label="Materials" hint="What you use often"
              placeholder="e.g. brushed steel"
              items={b.materials} onChange={v => set('materials', v)} />
            <TokenList label="Feel" hint="How the result should read"
              placeholder="e.g. restrained, structural"
              items={b.toneWords} onChange={v => set('toneWords', v)} />
            <TokenList label="Never" hint="Things you never do. Breaking one flags the card."
              placeholder="e.g. patent leather, printed logo"
              items={b.forbidden} onChange={v => set('forbidden', v)} />

            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span className="lbl">Palette</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="chiplist">
                  {b.colorPalette.map(c => (
                    <span className="chip-in" key={c.hex}>
                      <i className="swatch" style={{ background: c.hex }} />
                      {c.name}
                      <button onClick={() => set('colorPalette', b.colorPalette.filter(x => x.hex !== c.hex))}>Remove</button>
                    </span>
                  ))}
                  {!b.colorPalette.length && <span className="hint">Brand colours</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  <input type="color" className="colorpick" value={color.hex}
                    onChange={e => setColor(c => ({ ...c, hex: e.target.value }))} />
                  <input className="input" style={{ maxWidth: 180 }} placeholder="Colour name"
                    value={color.name} onChange={e => setColor(c => ({ ...c, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addColor() }} />
                  <button className="btn btn-ghost btn-sm" onClick={addColor}>Add</button>
                </div>
              </div>
            </div>
          </div>

          <div className="wcard">
            <h3><span className="n">4</span> MD persona</h3>
            <p className="hint" style={{ marginBottom: 8 }}>
              A merchandiser who reviews the design candidates at selection time, looking at the actual renders.
              What makes the feedback sharp is not scores but four things: who they sell to, what they check first
              (the order below is the importance), what makes them drop a design instantly, and what they look for in a photograph.
            </p>
            <div className="row"><span className="lbl">Role</span>
              <input className="input" style={{ flex: 1 }} value={md.role}
                placeholder="e.g. Department store fine jewellery buyer, 12 years"
                onChange={e => setMd({ role: e.target.value })} />
            </div>
            <div className="row"><span className="lbl">Market</span>
              <input className="input" style={{ flex: 1 }} value={md.market}
                placeholder="e.g. Korean department stores plus own online mall"
                onChange={e => setMd({ market: e.target.value })} />
            </div>
            <div className="row"><span className="lbl">Customer</span>
              <input className="input" style={{ flex: 1 }} value={md.customer}
                placeholder="e.g. Women in their 30s buying for themselves, daily wear"
                onChange={e => setMd({ customer: e.target.value })} />
            </div>
            <TokenList label="Priorities" hint="In order — the first outweighs everything after it"
              placeholder="e.g. season fit, margin, production difficulty"
              items={md.priorities} onChange={v => setMd({ priorities: v })} />
            <TokenList label="Auto-drop" hint="If one of these applies, the design is out regardless"
              placeholder="e.g. wear-prone spots plating cannot cover"
              items={md.rejectRules} onChange={v => setMd({ rejectRules: v })} />
            <TokenList label="Checks" hint="What they actually verify in the photographs"
              placeholder="e.g. silhouette when worn, how solid the setting looks"
              items={md.checkpoints} onChange={v => setMd({ checkpoints: v })} />
            <div className="row"><span className="lbl">Tone</span>
              <div className="chiprow">
                {(['direct', 'soft'] as const).map(tn => (
                  <button key={tn} className={`pick sm ${md.tone === tn ? 'on' : ''}`}
                    onClick={() => setMd({ tone: tn })}>{tn === 'direct' ? 'Blunt, like an internal review' : 'Constructive, but honest'}</button>
                ))}
              </div>
            </div>
            <div className="row">
              <span className="hint">
                {isMdConfigured(b.md)
                  ? 'Configured. At selection time this MD reviews every candidate with a verdict, a reason and one fix each.'
                  : 'Fill in at least the role plus priorities or auto-drop rules to activate the review.'}
              </span>
            </div>
          </div>

          <div className="wcard">
            <h3><span className="n">5</span> Prompt preview</h3>
            <p className="hint" style={{ marginBottom: 8 }}>This sentence is appended to every image prompt.</p>
            <pre className="promptprev">{brandPromptClause(b) || 'Nothing set yet'}</pre>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost btn-sm" onClick={() => setB(EMPTY_BRAND)}>Reset</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {b.brandName && <Tag kind="ok">{b.brandName}</Tag>}
            <button className="btn btn-primary" onClick={() => { onSave(b); onClose() }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
