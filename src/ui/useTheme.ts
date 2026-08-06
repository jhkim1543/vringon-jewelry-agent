// ── 테마 · 라이트/다크 (보드는 별도로 라이트 고정 가능) ─────────────
import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'vringon.theme'
const BOARD_KEY = 'vringon.boardTheme'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem(KEY) as Theme) || 'dark')
  // 보드는 발표용이라 흰 배경이 읽기 편하다. 기본값을 따로 둔다.
  const [boardTheme, setBoardTheme] = useState<Theme>(() =>
    (localStorage.getItem(BOARD_KEY) as Theme) || 'light')

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    localStorage.setItem(KEY, theme)
    // 브라우저가 attribute 변경만으로는 일부 요소의 커스텀 속성을 다시 계산하지 않는다.
    // (배경은 옛 테마 값이 남고 글자만 바뀌어 대비가 무너진다)
    // 한 프레임 강제 리플로우로 전체 재계산을 유도한다.
    const prev = root.style.display
    root.style.display = 'none'
    void root.offsetHeight
    root.style.display = prev
  }, [theme])

  useEffect(() => { localStorage.setItem(BOARD_KEY, boardTheme) }, [boardTheme])

  return { theme, setTheme, boardTheme, setBoardTheme }
}
