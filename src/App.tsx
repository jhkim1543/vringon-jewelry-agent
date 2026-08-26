// ── VRINGON Jewelry Agent · 앱 셸 (3-에이전트 개편) ──────────────────
// 실행이 끝나면 항상 분석 탭이 먼저다. 분석 내역에서 지난 결과를 열 때도
// 보드가 아니라 분석 탭의 요약부터 연다 — 결과의 근거를 먼저 보게 한다.
import { t, tf, useLang } from './core/i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesignPair, PipelineEvent, RunParams, RunState } from './core/types'
import { MODE_LABEL, ITEM_LABEL, freshState } from './core/types'
import { runPipeline, scoreFinishedPairs } from './core/pipeline'
import type { PipelineHandle } from './core/pipeline'
import Wizard from './ui/Wizard'
import RunView from './ui/RunView'
import Board from './ui/Board'
import { IcClock, IcPen, IcStar } from './ui/icons'
import { ThemeToggle, VringonLogo, LangToggle } from './ui/bits'
import { useTheme } from './ui/useTheme'
import Library from './ui/Library'
import ErrorBoundary from './ui/ErrorBoundary'
import { clearCurrent, firstImage, loadCurrent, newRunId, readAllRuns, saveCurrent, saveLastParams, saveRun, writeAllRuns } from './core/store'
import { ensureSampleRuns } from './core/sampleRun'
import { getRun } from './core/store'
import { pushShareTarget, readShareTarget } from './core/share'
import { hostInfo } from './core/host'
import { detectAccount, pullRuns } from './core/account'

type View = 'create' | 'run' | 'board' | 'library' | 'starred'

export default function App() {
  useLang()
  const host = hostInfo()
  const [view, setView] = useState<View>('create')
  const [st, setSt] = useState<RunState | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const handleRef = useRef<PipelineHandle | null>(null)
  const { theme, setTheme } = useTheme()
  const runIdRef = useRef<string>(newRunId())
  const [wizardKey, setWizardKey] = useState(0)
  const [shareMiss, setShareMiss] = useState<string | null>(null)
  const [modOpen, setModOpen] = useState(false)
  // 링크로 들어온 방문자 · 이 브라우저에 분석이 없어도 서버가 보드 문서를 가지고 있으면
  // 그 문서만으로 보드를 연다 (Board 가 st=null 을 받아 snodes 로 그린다).
  const [remoteBoard, setRemoteBoard] = useState<string | null>(null)

  // 샘플 적재 → 계정 확인 → 서버 내역 당겨오기. 이 순서를 지켜야 한다.
  // 샘플 적재가 비동기(동적 import)라, 계정 동기화가 먼저 끝나면 아직 없는 샘플을
  // "이 계정 것이 아니다" 라고 판단해 지워 버린다 — 실제로 그렇게 사라졌었다.
  const [account, setAccount] = useState<{ id: string; name?: string } | null>(null)
  const [synced, setSynced] = useState(0)
  useEffect(() => {
    let dead = false
    void (async () => {
      await ensureSampleRuns()
      if (dead) return
      const acc = await detectAccount()
      if (dead) return
      if (acc) {
        setAccount(acc)
        await pullRuns(readAllRuns, writeAllRuns)
      }
      if (!dead) setSynced(v => v + 1)          // 내역 화면을 다시 그린다
    })()
    return () => { dead = true }
  }, [])

  // 새로고침 복구 · 공유 링크(?run=…) 우선. 옛 알고리즘(algo 없음) 저장본은 열지 않는다.
  useEffect(() => {
    const target = readShareTarget()
    if (target) {
      const rec = getRun(target.runId)
      if (rec && rec.state.algo === 2) {
        runIdRef.current = rec.id
        setSt(rec.state)
        setView(target.view)
        return
      }
      // 로컬에 없다 · 서버 보드 문서로 열어 본다 (없거나 정적 배포면 안내로 떨어진다)
      fetch(`/api/board/doc?id=${encodeURIComponent(target.runId)}`)
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          if (j?.doc && Object.keys(j.doc.snodes ?? {}).length) {
            runIdRef.current = target.runId
            setRemoteBoard(target.runId)
            setView('board')
          } else setShareMiss(target.runId)
        })
        .catch(() => setShareMiss(target.runId))
      return
    }
    const prev = loadCurrent()
    if (prev && prev.state.algo === 2 && prev.state.pairs.length) {
      runIdRef.current = prev.id
      setSt(prev.state)
    }
  }, [])

  useEffect(() => {
    if (st && (view === 'board' || view === 'run')) pushShareTarget(runIdRef.current, view)
  }, [view, st])

  const onEvent = useCallback((e: PipelineEvent) => {
    setSt(prev => {
      if (!prev) return prev
      const next = { ...prev }
      switch (e.kind) {
        case 'log': next.logs = [...next.logs, { stage: e.stage, text: e.text, t: Date.now() }]; break
        case 'stage-start': next.stageStatus = { ...next.stageStatus, [e.stage]: 'running' }; break
        case 'stage-done': next.stageStatus = { ...next.stageStatus, [e.stage]: 'done' }; break
        case 'crawl': next.crawl = e.crawl; break
        case 'shops': next.shops = e.shops; break
        case 'runway': next.runway = e.runway; break
        case 'adoption': next.adoption = e.signals; break
        case 'trend-report': next.trendReport = e.report; break
        case 'forecast': next.forecast = e.forecast; break
        case 'insight': next.insight = e.insight; break
        case 'sets': next.sets = e.sets; break
        case 'set-art':
          next.sets = (next.sets ?? []).map(s => s.name === e.setName ? { ...s, art: e.art, lineup: e.lineup } : s); break
        case 'references': next.references = e.references; break
        case 'pair': next.pairs = [...next.pairs.filter(x => x.id !== e.pair.id), e.pair]; break
        case 'pair-update':
          next.pairs = next.pairs.map(x => x.id === e.pair.id ? e.pair : x); break
        case 'searches': next.searches = next.searches + e.n; break
        case 'failed': next.failedNote = e.note; break
        case 'done': next.finished = true; break
      }
      return next
    })
    if (e.kind === 'progress') setProgress(p => ({ ...p, [e.stage]: e.pct }))
  }, [])

  // 진행 상태를 계속 남긴다 · 끝나면 내역에 저장
  useEffect(() => {
    if (!st) return
    saveCurrent(runIdRef.current, st)
    if (st.finished) {
      saveRun({
        id: runIdRef.current, savedAt: Date.now(), favorite: false,
        title: `${MODE_LABEL[st.params.mode]} · ${st.params.mode === 'collection'
          ? st.params.direction.slice(0, 24)
          : (ITEM_LABEL[st.params.itemType] ?? st.params.itemType)}`,
        thumb: firstImage(st), state: st,
      })
    }
  }, [st])

  const start = useCallback((params: RunParams) => {
    handleRef.current?.cancel()
    runIdRef.current = newRunId()
    clearCurrent()
    setSt(freshState(params))
    setProgress({})
    setView('library')                   // 시작하면 내역으로 · 진행 중 카드가 단계와 함께 보인다
    saveLastParams(params)
    handleRef.current = runPipeline(params, onEvent)
  }, [onEvent])

  /** 분석 탭의 프롬프트 수정·재생성 결과 반영 */
  const onPairUpdate = useCallback((pair: DesignPair) => {
    setSt(prev => prev ? { ...prev, pairs: prev.pairs.map(x => x.id === pair.id ? pair : x) } : prev)
  }, [])

  /** 전체 사전 평가 · 텍스트 기준. 결과는 점수 배지로 붙는다 */
  const onScoreAll = useCallback(async () => {
    if (!st) return
    const scores = await scoreFinishedPairs(st.params, st.pairs)
    setSt(prev => prev ? {
      ...prev,
      pairs: prev.pairs.map(p => {
        const s = scores.get(p.id)
        return s ? { ...p, score: s.total, scoreNote: s.note } : p
      }),
    } : prev)
  }, [st])

  return (
    <ErrorBoundary onReset={() => setView('create')}>
    <div className="app">
      {/* VRINGON 안(iframe)에서는 이 앱의 상단바를 그리지 않는다 — 호스트 헤더가 이미 있어
          로고와 언어·테마가 두 벌로 보이기 때문이다. 주소를 직접 열면 예전처럼 나온다. */}
      <div className="topbar" hidden={host.framed}>
        {/* 로고 = 처음으로 · 픽커부터 다시 시작한다 (재마운트로 agentPicked 초기화) */}
        <button className="brand" onClick={() => { setView('create'); setWizardKey(k => k + 1) }} title={t('Back to the start')}>
          <VringonLogo />
          <span className="brand-word">VRINGON</span>
          <span className="module">{t('Jewelry Agent')}</span>
        </button>
        {/* 상단에는 탭을 두지 않는다 · 분석 결과와 보드는 그 분석을 연 뒤에 고르는 것이라
            아래 상세 헤더의 세그먼트로 옮겼다. 이동은 왼쪽 레일이 맡는다. */}
        {/* 언어·테마는 호스트(VRINGON)에서 한 번만 고른다 · Planning 으로 열렸으면 여기서는 감춘다.
            주소를 직접 연 독립 데모에서는 예전처럼 이 앱이 스스로 고른다. */}
        {!host.embedded && (
          <div className="right">
            <LangToggle />
            <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
          </div>
        )}
      </div>

      <div className="main">
        <aside className="siderail">
          {/* 지금 쓰는 에이전트 · VRINGON 안에서는 여기가 이 화면의 이름표가 된다.
              다른 기획 에이전트(신발 등)가 붙으면 이 자리에서 고른다. */}
          <div className="sr-mod">
            <button className="sr-modbtn" onClick={() => setModOpen(v => !v)} aria-expanded={modOpen}>
              <span>{t('Jewelry Agent')}</span>
              <i className={modOpen ? 'up' : ''} aria-hidden="true">⌄</i>
            </button>
            {modOpen && (
              <div className="sr-modmenu">
                <span className="on">{t('Jewelry Agent')}</span>
                <span className="soon">{t('Shoe Agent')} · {t('Coming soon')}</span>
              </div>
            )}
          </div>
          <nav>
            <button className={`sr-i ${view === 'create' ? 'on' : ''}`} title={t('Create')} aria-label={t('Create')}
              onClick={() => { setView('create'); setWizardKey(k => k + 1) }}>
              <IcPen /> <span>{t('Create')}</span>
            </button>
            <button className={`sr-i ${view === 'library' || view === 'run' || view === 'board' ? 'on' : ''}`} title={t('History')} aria-label={t('History')} onClick={() => setView('library')}>
              <IcClock /> <span>{t('History')}</span>
            </button>
            <button className={`sr-i ${view === 'starred' ? 'on' : ''}`} title={t('Starred')} aria-label={t('Starred')} onClick={() => setView('starred')}>
              <IcStar /> <span>{t('Starred')}</span>
            </button>
          </nav>
        </aside>

        {shareMiss && view === 'create' && (
          <div className="sharemiss">
            <b>{t('That shared board is not in this browser.')}</b>
            <span>{t('Boards are stored locally, so a link only opens one this browser already has. Ask for the exported file, or open the link on the machine that ran it.')}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShareMiss(null)}>{t('Close')}</button>
          </div>
        )}

        {view === 'create' && <Wizard key={wizardKey} onStart={start} />}

        {/* 열린 분석 · 머리(돌아가기 + 결과/보드 전환)와 본문을 한 열로 세운다 */}
        {(view === 'run' || view === 'board') && (st || remoteBoard) && (
          <div className="detailwrap">
          <div className="detailhead">
            <div className="dh-crumb">
              <button className="dh-back" onClick={() => setView('library')}>
                <span aria-hidden="true">‹</span> {t('History')}
              </button>
              <span className="dh-sep" aria-hidden="true">/</span>
              <span className="dh-where">
                {st ? `${t(ITEM_LABEL[st.params.mode === 'collection' ? st.params.items[0] ?? st.params.itemType : st.params.itemType])} · ${t(MODE_LABEL[st.params.mode])}` : t('Shared board')}
              </span>
            </div>
            <div className="dh-row">
              <div>
                <h1 className="dh-title">{st ? tf('{agent} report', { agent: t(MODE_LABEL[st.params.mode]) }) : t('Shared board')}</h1>
                {st && <p className="dh-sub">{st.finished ? t('Finished') : t('In progress')}</p>}
              </div>
              <div className="dh-seg" role="tablist">
                <button role="tab" aria-selected={view === 'run'} className={view === 'run' ? 'on' : ''}
                  disabled={!st} onClick={() => setView('run')}>{t('Analysis result')}</button>
                <button role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'on' : ''}
                  onClick={() => setView('board')}>{t('Board')}</button>
              </div>
            </div>
          </div>

          {view === 'run' && st && (
            <RunView st={st} progress={progress}
              onOpenBoard={() => setView('board')}
              onPairUpdate={onPairUpdate} onScoreAll={onScoreAll} />
          )}
          {view === 'board' && <Board st={st} runId={runIdRef.current} />}
          </div>
        )}
        {(view === 'run' || view === 'board') && !st && !remoteBoard && <div className="empty">{t('No run open. Start one from Run setup.')}</div>}
        {/* Library 에 key 를 붙여 뷰가 바뀔 때 다시 마운트한다 · Library 는 filter 를
            useState 의 초기값으로만 읽어서, 같은 인스턴스가 남으면 상단의 "즐겨찾기" 를
            눌러도 목록이 그대로였다 */}
        {(view === 'library' || view === 'starred') && (
          <Library key={`${view}-${synced}`} filter={view === 'starred' ? 'favorite' as const : 'all'}
            onCreate={() => { setView('create'); setWizardKey(k => k + 1) }}
            account={account}
            running={st && !st.finished ? st : null}
            onOpenRunning={() => setView('run')}
            onOpen={(rec, want) => {
              if (rec.state.algo !== 2) return   // 옛 알고리즘 저장본은 새 화면이 읽지 못한다
              runIdRef.current = rec.id
              setSt(rec.state)
              // 기본은 분석 결과 · 카드에서 보드를 직접 고른 경우만 보드로 연다
              setView(want === 'board' ? 'board' : 'run')
            }} />
        )}
      </div>
    </div>
    </ErrorBoundary>
  )
}
