// ── 아이콘 · 선(stroke) 한 벌 ───────────────────────────────────────
// 24 그리드, stroke 1.6, currentColor. 채우기를 쓰지 않으므로 테마를 타지 않는다.
// 신발/주얼리는 라벨 옆에 붙으니 정확한 도해보다 실루엣이 구분되는 쪽을 택했다.
import type { ReactNode } from 'react'

function I({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">{children}</svg>
  )
}

// ── 출발점 ──────────────────────────────────────────────────────────
export const IcTrend = () => <I><path d="M3.4 20.4V4M3.4 20.4H21" /><path d="M6.4 16.2l4.2-4.4 3 3 5.2-5.6" /><path d="M15.6 9.2h3.2v3.2" /></I>
export const IcSeries = () => <I><path d="M12 3.4l8.4 4.2-8.4 4.2-8.4-4.2z" /><path d="M3.6 12l8.4 4.2 8.4-4.2" /><path d="M3.6 16.2l8.4 4.2 8.4-4.2" /></I>
export const IcMoodboard = () => <I><rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2" /><path d="M3.6 16.4l4.4-4.2 3.4 3.1 3.4-3.7 5.6 5.2" /><circle cx="8.4" cy="9.2" r="1.4" /></I>

// ── 품목 ────────────────────────────────────────────────────────────
export const IcShoe = () => <I><path d="M2.8 13.4h4.4l3-2.6c.6-.5 1.5-.5 2.1 0l3 2.2 3.6 1.3c1.3.5 2 1.2 2 2.1 0 1-.8 1.6-2 1.6H4.3a1.5 1.5 0 0 1-1.5-1.5z" /><path d="M2.8 16.2h18" /></I>
export const IcGem = () => <I><path d="M7.6 4.4h8.8l3.8 5-8.2 10.2L3.8 9.4z" /><path d="M3.8 9.4h16.4" /><path d="M9.4 9.4L12 19.6l2.6-10.2" /><path d="M7.6 4.4l1.8 5M16.4 4.4l-1.8 5" /></I>

// ── 신발 계열 ───────────────────────────────────────────────────────
export const IcSneaker = () => <I><path d="M2.8 12.2h4.6l3-3.4a1.3 1.3 0 0 1 1.9 0l2.8 2.6 3.6 1.4c1.4.5 2.1 1.2 2.1 2.2 0 1-.8 1.6-2 1.6H4.3a1.5 1.5 0 0 1-1.5-1.5z" /><path d="M9.6 10.6l1.5 1.3M11.5 8.9l1.6 1.4" /><path d="M2.8 15h17.8" /></I>
export const IcDress = () => <I><path d="M2.8 13.4h4.4l3-2.6c.6-.5 1.5-.5 2.1 0l3 2.2 3.6 1.3c1.3.5 2 1.2 2 2.1 0 1-.8 1.6-2 1.6H4.3a1.5 1.5 0 0 1-1.5-1.5z" /><path d="M9.4 12.9h3.8" /></I>
export const IcHeel = () => <I><path d="M3.4 15.4c4.6 0 8-1.1 10.2-3.3 1.6-1.6 2.6-3.6 3-6" /><path d="M16.6 6.1c1.5 0 2.5.9 2.5 2.3 0 2.9-1 5.4-2.8 7.2" /><path d="M3.4 15.4h12.9" /><path d="M16 15.6v4h-2.7" /></I>
export const IcFlat = () => <I><path d="M2.9 15.2h4l2.6-1.8c.7-.5 1.6-.5 2.3 0l2.6 1.8h3.6c1.7 0 2.8.6 2.8 1.5s-1.1 1.5-2.8 1.5H4.3c-1 0-1.6-.6-1.6-1.5z" /><path d="M9.2 13.6c.6-1.1 1.6-1.6 2.8-1.6s2.2.5 2.8 1.6" /></I>
export const IcBoot = () => <I><path d="M7.4 4.8a1.4 1.4 0 0 1 1.4-1.4h2.8a1.4 1.4 0 0 1 1.4 1.4v7.3l3.9 1.6c1.3.6 2 1.2 2 2.1 0 .9-.7 1.5-1.9 1.5H9.2c-1.2 0-1.8-.7-1.8-1.9z" /><path d="M7.4 9.4h5.6" /></I>
export const IcSandal = () => <I><path d="M3.8 15.6h13.4c1.8 0 2.9.6 2.9 1.5s-1.1 1.5-2.9 1.5H3.8c-1.2 0-2-.6-2-1.5s.8-1.5 2-1.5z" /><path d="M6.4 15.4c0-3 1.9-4.8 4.6-4.8s4.6 1.8 4.6 4.8" /><path d="M4.6 15.4l2-3.6" /></I>

// ── 주얼리 계열 ─────────────────────────────────────────────────────
export const IcRing = () => <I><circle cx="12" cy="14.6" r="5.4" /><path d="M12 4.2l2.7 2.8-2.7 2.6-2.7-2.6z" /><path d="M9.3 7h5.4" /></I>
export const IcEarring = () => <I><circle cx="7.8" cy="7" r="2.6" /><circle cx="14.8" cy="14.8" r="5" /></I>
export const IcNecklace = () => <I><path d="M5 4.6c0 6 3.1 9.6 7 9.6s7-3.6 7-9.6" /><path d="M12 14.4l2 2.3-2 2.4-2-2.4z" /></I>
export const IcBracelet = () => <I><ellipse cx="12" cy="12.6" rx="7.6" ry="5.4" /><circle cx="12" cy="6.5" r="1.7" /></I>
export const IcBrooch = () => <I><path d="M10.4 3.2l1.8 4.8 4.8 1.8-4.8 1.8-1.8 4.8-1.8-4.8L3.8 9.8l4.8-1.8z" /><path d="M18.2 15.2l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z" /></I>

// ── 레일·조작 ───────────────────────────────────────────────────────
export const IcClock = () => <I><circle cx="12" cy="12" r="8.4" /><path d="M12 7.2V12l3.2 2" /></I>
export const IcStar = () => <I><path d="M12 3.8l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" /></I>
export const IcArrow = () => <I><path d="M4.4 12h14.4M13.2 6.4l5.6 5.6-5.6 5.6" /></I>
export const IcExternal = () => <I><path d="M13.6 4.4H19.6V10.4" /><path d="M19.6 4.4L11.2 12.8" /><path d="M18 13.8v4.4a1.6 1.6 0 0 1-1.6 1.6H5.8a1.6 1.6 0 0 1-1.6-1.6V7.6A1.6 1.6 0 0 1 5.8 6h4.4" /></I>
export const IcReport = () => <I><path d="M6.4 3.6h8.2l4.2 4.2v12.6a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 20.4V5a1.4 1.4 0 0 1 1.4-1.4z" /><path d="M14.4 3.6v4.4h4.4" /><path d="M8.4 12.6h7M8.4 16.2h4.6" /></I>

// 계열 id → 아이콘. 없으면 품목 기본 아이콘으로 떨어진다.
export const GROUP_ICON: Record<string, () => JSX.Element> = {
  sneaker: IcSneaker, dress: IcDress, heel: IcHeel, flat: IcFlat, boot: IcBoot, sandal: IcSandal,
  ring: IcRing, earring: IcEarring, necklace: IcNecklace, bracelet: IcBracelet, other: IcBrooch,
}

// 레일 조작
export const IcPlus = () => <I><path d="M12 5v14M5 12h14" /></I>
export const IcChevron = () => <I><path d="M7.6 10l4.4 4.4 4.4-4.4" /></I>
export const IcTrash = () => <I><path d="M4.4 6.6h15.2" /><path d="M9.4 6.6V5a1.4 1.4 0 0 1 1.4-1.4h2.4A1.4 1.4 0 0 1 14.6 5v1.6" /><path d="M6.4 6.6l.9 12.2a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.9-12.2" /><path d="M10.2 10.4v6M13.8 10.4v6" /></I>
