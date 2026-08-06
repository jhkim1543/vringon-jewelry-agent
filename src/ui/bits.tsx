// 공용 소형 컴포넌트
import { LANGS, setLang, useLang } from '../core/i18n'
import { useState } from 'react'
import type { ReactNode } from 'react'

/** 접힘 패널 · 기본은 요약 한 줄만, 펼쳐야 상세가 보인다 */
export function Collapse({ title, summary, children, defaultOpen = false }: {
  title: string; summary?: string; children: ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <button className="panel-h collapse-h" onClick={() => setOpen(v => !v)}>
        <span className={`chev ${open ? 'open' : ''}`}>▸</span>
        {title}
        {summary && <span className="sub">{summary}</span>}
      </button>
      {open && children}
    </div>
  )
}

export function VringonLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="VRINGON">
      <path d="M4 8 11.5 25 19 8" stroke="#F2F3F5" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="24.5" cy="16.5" r="5.8" stroke="#5B6BF0" strokeWidth="3.4" fill="none" />
    </svg>
  )
}

export function Seg<T extends string | number>({ options, value, onChange, format }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; format?: (v: T) => string
}) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={String(o)} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  )
}

/** 테마 토글 · 아이콘만 두고, 현재 상태가 아니라 "누르면 되는 상태"를 보여준다 */
export function ThemeToggle({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button className="iconbtn" onClick={onToggle}
      title={next === 'light' ? 'Switch to light' : 'Switch to dark'}
      aria-label={next === 'light' ? 'Switch to light' : 'Switch to dark'}>
      {next === 'light' ? (
        // 해 · 누르면 밝아진다
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="10" cy="10" r="3.6" />
          <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.6 4.6l1.4 1.4M14 14l1.4 1.4M15.4 4.6L14 6M6 14l-1.4 1.4" />
        </svg>
      ) : (
        // 달 · 누르면 어두워진다
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M16 11.6A6.6 6.6 0 0 1 8.4 4a6.8 6.8 0 1 0 7.6 7.6Z" />
        </svg>
      )}
    </button>
  )
}

export function Tag({ kind, children }: { kind?: 'accent' | 'ok' | 'warn' | 'danger'; children: ReactNode }) {
  return <span className={`tag${kind ? ` tag-${kind}` : ''}`}>{children}</span>
}

/** 언어 토글 · 두 개뿐이라 드롭다운 대신 두 칸짜리 스위치로 둔다 */
export function LangToggle() {
  const lang = useLang()
  return (
    <div className="langtoggle" role="group" aria-label="Language">
      {LANGS.map(l => (
        <button key={l.id} className={lang === l.id ? 'on' : ''}
          onClick={() => setLang(l.id)}
          aria-pressed={lang === l.id}
          title={l.label}>
          {l.short}
        </button>
      ))}
    </div>
  )
}
