// ── 렌더 오류가 화면 전체를 날리지 않게 막는다 ────────────────────────
// 조사 결과에 예상 못 한 값이 섞여 컴포넌트가 던지면 React는 트리를 통째로
// 언마운트한다. 사용자 입장에서는 "튕겼다"로 보인다. 여기서 잡아 세운다.
import { t } from '../core/i18n'
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode; onReset?: () => void }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[VRINGON] render error', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="errpane">
        <div className="errbox">
          <h2>{t('Something broke while rendering')}</h2>
          <p>The run itself is saved. Reload and it will come back from where it stopped.</p>
          <pre>{String(error.message || error).slice(0, 400)}</pre>
          <div className="errbtns">
            <button className="btn btn-primary" onClick={() => location.reload()}>{t('Reload')}</button>
            <button className="btn btn-ghost" onClick={() => {
              this.setState({ error: null })
              this.props.onReset?.()
            }}>{t('Back to setup')}</button>
          </div>
        </div>
      </div>
    )
  }
}
