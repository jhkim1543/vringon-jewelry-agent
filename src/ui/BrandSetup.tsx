// ── 브랜드 아이덴티티 설정 · 모든 에이전트 결과에 공통으로 실린다 ──────
// 화면 문구는 전부 t() 를 지난다. 예전에는 이 파일만 i18n 을 import 하지 않아,
// 상단에서 KR 을 골라도 이 창만 영어로 남았다.
import { t } from '../core/i18n'
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
      <span className="lbl">{t(label)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="chiplist">
          {/* 사용자가 입력한 값은 번역하지 않는다 — 그 사람이 쓴 말 그대로가 맞다 */}
          {items.map(x => (
            <span className="chip-in" key={x}>
              {x}
              <button onClick={() => onChange(items.filter(y => y !== x))}
                aria-label={`${t('Remove')} ${x}`}>{t('Remove')}</button>
            </span>
          ))}
          {!items.length && <span className="hint">{t(hint)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input className="input" style={{ maxWidth: 280 }} placeholder={t(placeholder)}
            value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }} />
          <button className="btn btn-ghost btn-sm" onClick={add}>{t('Add')}</button>
        </div>
      </div>
    </div>
  )
}

export default function BrandSetup({ brand, onSave, onClose }: {
  brand: BrandIdentity
  /** 저장 결과를 돌려준다 · 실패하면 창을 닫지 않고 이유를 보여 준다 */
  onSave: (b: BrandIdentity) => { ok: true } | { ok: false; error: string }
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

  // 저장 실패를 화면에 남긴다 · 조용히 실패하면 저장된 줄 알고 창을 닫는다
  const [saveError, setSaveError] = useState('')
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
            <h2>{t('Brand identity')}</h2>
            <p className="hint">{t('Whatever you put here rides along with every result, whichever agent you run. The agent decides the spec first; your brand rules sit on top of it.')}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>{t('Close')}</button>
        </div>

        <div className="modal-body">
          <div className="wcard">
            <h3><span className="n">1</span> {t('Basics')}</h3>
            <div className="row"><span className="lbl">{t('Name')}</span>
              <input className="input" style={{ maxWidth: 280 }} value={b.brandName}
                placeholder={t('e.g. VRINGON')} onChange={e => set('brandName', e.target.value)} />
            </div>
            <div className="row"><span className="lbl">{t('One line')}</span>
              <input className="input" style={{ flex: 1 }} value={b.tagline}
                placeholder={t('The brand in one sentence')} onChange={e => set('tagline', e.target.value)} />
            </div>
          </div>

          <div className="wcard">
            <h3><span className="n">2</span> {t('Logo')}</h3>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span className="lbl">{t('File')}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {b.logo ? (
                  <div className="logo-row">
                    <div className="logo-prev"><img src={b.logo.dataUrl} alt={t('Logo')} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{b.logo.name}</div>
                      {/* 실제로는 합성을 위해 로컬 서버로 보내고, 합성본은 이미지 편집 API 로 나간다.
                          "브라우저에만 있다"고 적어 두면 사실과 다르다. */}
                      <div className="hint">
                        {b.applyLogoToImages
                          ? t('Sent to the local server to be composited onto each render. The composited image then goes to the image API like any other cut.')
                          : t('Stored with your brand. Not sent anywhere while this is off.')}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => set('logo', null)}>{t('Remove')}</button>
                  </div>
                ) : (
                  <label className="dropzone">
                    <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg" hidden
                      onChange={e => { const f = e.target.files?.[0]; if (f) readLogo(f) }} />
                    {t('Drop a logo file')}
                    <span className="dz-sub">{t('PNG or SVG. A transparent background composites cleanly.')}</span>
                  </label>
                )}
              </div>
            </div>

            {b.logo && (<>
              <div className="row"><span className="lbl">{t('Placement')}</span>
                <div className="chiprow">
                  {PLACEMENTS.map(p => (
                    <button key={p.id} className={`pick sm ${b.logo!.placement === p.id ? 'on' : ''}`}
                      onClick={() => set('logo', { ...b.logo!, placement: p.id })}>{t(p.label)}</button>
                  ))}
                </div>
              </div>
              <div className="row"><span className="lbl">{t('Weight')}</span>
                <div className="chiprow">
                  {(['subtle', 'normal', 'bold'] as const).map(s => (
                    <button key={s} className={`pick sm ${b.logo!.scale === s ? 'on' : ''}`}
                      onClick={() => set('logo', { ...b.logo!, scale: s })}>
                      {t(s === 'subtle' ? 'Subtle' : s === 'normal' ? 'Normal' : 'Bold')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="row">
                <label className="chk">
                  <input type="checkbox" checked={b.applyLogoToImages}
                    onChange={e => set('applyLogoToImages', e.target.checked)} />
                  {t('Put your logo on the generated images')}
                </label>
              </div>
              <div className="row">
                <span className="hint">
                  {t("Generators can't draw a logo accurately, so the prompt only asks for a clean area at the spot you picked, and your actual file is composited onto the render afterwards. With this off, the prompt forbids any mark and nothing is composited.")}
                </span>
              </div>
            </>)}
          </div>

          <div className="wcard">
            <h3><span className="n">3</span> {t('Brand rules')}</h3>
            <TokenList label="Signature" hint="The shapes people recognise you by"
              placeholder="e.g. angular bezel edge"
              items={b.signatureElements} onChange={v => set('signatureElements', v)} />
            <TokenList label="Materials" hint="What you use often"
              placeholder="e.g. recycled silver"
              items={b.materials} onChange={v => set('materials', v)} />
            <TokenList label="Feel" hint="How the result should read"
              placeholder="e.g. restrained, structural"
              items={b.toneWords} onChange={v => set('toneWords', v)} />
            {/* 검사 범위를 정확히 적는다 · 스펙 값에 그 낱말이 있으면 잡히고, 그림에 나타난 것은 못 잡는다 */}
            <TokenList label="Never" hint="Things you never do. Each one goes into the image prompt as something to avoid, and if it turns up in a design's spec the card is flagged."
              placeholder="e.g. pave, enamel, printed logo"
              items={b.forbidden} onChange={v => set('forbidden', v)} />

            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span className="lbl">{t('Palette')}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="chiplist">
                  {b.colorPalette.map(c => (
                    <span className="chip-in" key={c.hex}>
                      <i className="swatch" style={{ background: c.hex }} />
                      {c.name}
                      <button onClick={() => set('colorPalette', b.colorPalette.filter(x => x.hex !== c.hex))}>{t('Remove')}</button>
                    </span>
                  ))}
                  {!b.colorPalette.length && <span className="hint">{t('Brand colours')}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  <input type="color" className="colorpick" value={color.hex}
                    onChange={e => setColor(c => ({ ...c, hex: e.target.value }))} />
                  <input className="input" style={{ maxWidth: 180 }} placeholder={t('Colour name')}
                    value={color.name} onChange={e => setColor(c => ({ ...c, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addColor() }} />
                  <button className="btn btn-ghost btn-sm" onClick={addColor}>{t('Add')}</button>
                </div>
              </div>
            </div>
          </div>

          <div className="wcard">
            <h3><span className="n">4</span> {t('MD persona')}</h3>
            <p className="hint" style={{ marginBottom: 8 }}>
              {t('A merchandiser who reviews the design candidates at selection time, looking at the actual renders. What makes the feedback sharp is not scores but four things: who they sell to, what they check first (the order below is the importance), what makes them drop a design instantly, and what they look for in a photograph.')}
            </p>
            <div className="row"><span className="lbl">{t('Role')}</span>
              <input className="input" style={{ flex: 1 }} value={md.role}
                placeholder={t('e.g. Department store fine jewellery buyer, 12 years')}
                onChange={e => setMd({ role: e.target.value })} />
            </div>
            <div className="row"><span className="lbl">{t('Market')}</span>
              <input className="input" style={{ flex: 1 }} value={md.market}
                placeholder={t('e.g. Korean department stores plus own online mall')}
                onChange={e => setMd({ market: e.target.value })} />
            </div>
            <div className="row"><span className="lbl">{t('Customer')}</span>
              <input className="input" style={{ flex: 1 }} value={md.customer}
                placeholder={t('e.g. Women in their 30s buying for themselves, daily wear')}
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
            <div className="row"><span className="lbl">{t('Tone')}</span>
              <div className="chiprow">
                {(['direct', 'soft'] as const).map(tn => (
                  <button key={tn} className={`pick sm ${md.tone === tn ? 'on' : ''}`}
                    onClick={() => setMd({ tone: tn })}>
                    {t(tn === 'direct' ? 'Blunt, like an internal review' : 'Constructive, but honest')}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <span className="hint">
                {isMdConfigured(b.md)
                  ? t('Configured. At selection time this MD reviews every candidate with a verdict, a reason and one fix each.')
                  : t('Fill in at least the role plus priorities or auto-drop rules to activate the review.')}
              </span>
            </div>
            {/* 페르소나는 조사 언어로 전달된다 · 화면 언어를 바꾸면 리뷰 언어도 바뀐다는 것을 알려 준다 */}
            <div className="row">
              <span className="hint">{t('The review is written in the language you picked at the top of the screen.')}</span>
            </div>
          </div>

          <div className="wcard">
            <h3><span className="n">5</span> {t('Prompt preview')}</h3>
            <p className="hint" style={{ marginBottom: 8 }}>{t('This sentence is appended to every image prompt.')}</p>
            {/* 프롬프트 자체는 영어로 나간다 — 모델에 주는 문장이라 번역하면 안 된다 */}
            <pre className="promptprev">{brandPromptClause(b) || t('Nothing set yet')}</pre>
            <p className="hint">{t('Prompts are always sent in English, whichever screen language you use.')}</p>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost btn-sm" onClick={() => setB(EMPTY_BRAND)}>{t('Clear everything')}</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {saveError && <span className="hint" style={{ color: 'var(--warn)' }}>{saveError}</span>}
            {b.brandName && <Tag kind="ok">{b.brandName}</Tag>}
            <button className="btn btn-primary" onClick={() => {
              const r = onSave(b)
              if (r.ok) onClose(); else setSaveError(r.error)
            }}>{t('Save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
