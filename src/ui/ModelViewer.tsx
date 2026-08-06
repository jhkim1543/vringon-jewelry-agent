// ── 3D 뷰어 · 보드 카드 안에서 GLB를 돌려 본다 ──────────────────────
// 외부 CDN을 쓰지 않는다. 정적 배포에서도 그대로 돌아야 하므로 three를 번들에 넣는다.
//
// 카드가 열릴 때마다 WebGL을 켜지 않는다. 이유가 둘이다.
//  · 브라우저는 동시에 열 수 있는 WebGL 컨텍스트 수가 제한된다 (보통 16개)
//  · 보드는 노드를 자주 다시 그려서, 자동 초기화하면 컨텍스트를 만들자마자 버리게 된다
// 그래서 눌렀을 때만 띄우고, 닫으면 정리한다.
//
// 카드 안에서 못 띄우는 경우(컨텍스트 소진, 카드가 너무 작음)를 위해 팝업을 둔다.
// 팝업은 한 번에 하나만 열리므로 컨텍스트가 모자랄 일이 없다.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { t } from '../core/i18n'

function Stage({ url, height, light, onError }: {
  url: string; height: number; light?: boolean; onError: (m: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let frame = 0
    let disposed = false
    let renderer: THREE.WebGLRenderer | null = null
    let controls: OrbitControls | null = null

    let ro: ResizeObserver | null = null
    try {
      // 레이아웃이 아직 안 잡혔을 때 0으로 그리면 아무것도 안 보인다.
      // 바닥값을 두고, 실제 크기가 잡히면 ResizeObserver로 따라간다.
      const w = Math.max(160, el.clientWidth || 280)
      const h = Math.max(160, height)
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(light ? 0xf3f5f8 : 0x0f1217)

      const camera = new THREE.PerspectiveCamera(38, w / h, 0.01, 100)
      camera.position.set(0.9, 0.55, 1.6)

      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      renderer.setSize(w, h)
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      el.appendChild(renderer.domElement)

      // 스튜디오 조명 · 제품이니 형태가 읽혀야 한다
      scene.add(new THREE.HemisphereLight(0xffffff, light ? 0xd8dde4 : 0x1a1f26, 1.5))
      const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2.5, 3, 2); scene.add(key)
      const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(-2, 1, -1.5); scene.add(fill)

      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.enablePan = false
      controls.minDistance = 0.6
      controls.maxDistance = 4
      // 캔버스 위에서는 보드가 아니라 모델이 반응해야 한다
      const stop = (e: Event) => e.stopPropagation()
      renderer.domElement.addEventListener('wheel', stop, { passive: false })
      renderer.domElement.addEventListener('pointerdown', stop)

      ro = new ResizeObserver(() => {
        if (disposed || !renderer) return
        const nw = el.clientWidth, nh = el.clientHeight
        if (nw < 2 || nh < 2) return
        renderer.setSize(nw, nh)
        camera.aspect = nw / nh
        camera.updateProjectionMatrix()
      })
      ro.observe(el)

      new GLTFLoader().load(url, (gltf) => {
        if (disposed) return
        const root = gltf.scene
        // Tripo 결과는 스케일이 제각각이다. 화면에 맞게 정규화한다.
        const box = new THREE.Box3().setFromObject(root)
        const size = box.getSize(new THREE.Vector3())
        const centre = box.getCenter(new THREE.Vector3())
        const s = 1 / Math.max(size.x, size.y, size.z, 1e-4)
        root.scale.setScalar(s)
        root.position.sub(centre.multiplyScalar(s))
        scene.add(root)
        setReady(true)

        const tick = () => {
          if (disposed) return
          frame = requestAnimationFrame(tick)
          root.rotation.y += 0.0035        // 가만히 두면 천천히 돈다
          controls!.update()
          renderer!.render(scene, camera)
        }
        tick()
      }, undefined, (err) => {
        if (!disposed) onError(String((err as Error)?.message ?? err).slice(0, 80))
      })
    } catch (e) {
      // WebGL 컨텍스트를 못 얻으면 여기로 온다
      onError(String((e as Error)?.message ?? e).slice(0, 100))
    }

    return () => {
      disposed = true
      ro?.disconnect()
      cancelAnimationFrame(frame)
      controls?.dispose()
      renderer?.dispose()
      renderer?.domElement.parentElement?.removeChild(renderer.domElement)
    }
  }, [url, height, light, onError])

  return (
    <>
      <div ref={host} className="mv-canvas" />
      {!ready && <div className="mv-state">{t('Loading the model')}</div>}
      {ready && <div className="mv-hint">{t('Drag to turn · scroll to zoom')}</div>}
    </>
  )
}

/** 큰 화면으로 보는 팝업. 한 번에 하나만 열린다. */
function Popup({ url, light, onClose }: { url: string; light?: boolean; onClose: () => void }) {
  const [err, setErr] = useState('')
  const [h, setH] = useState(() => Math.max(360, Math.min(620, Math.round((window.innerHeight || 900) * 0.68))))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onResize = () => setH(Math.max(360, Math.min(620, Math.round((window.innerHeight || 900) * 0.68))))
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize) }
  }, [onClose])

  return createPortal(
    <div className="mv-pop" onPointerDown={e => e.stopPropagation()} onClick={onClose}>
      <div className="mv-pop-box" onClick={e => e.stopPropagation()}>
        <div className="mv-pop-head">
          <span>{t('3D showroom')}</span>
          <button onClick={onClose} aria-label={t('Close')}>✕</button>
        </div>
        <div className="mv-pop-stage" style={{ height: h }}>
          {err
            ? <div className="mv-state">{t('Could not load the model')} · {err}</div>
            : <Stage url={url} height={h} light={light} onError={setErr} />}
        </div>
        <div className="mv-pop-foot">
          <span>{t('Drag to turn · scroll to zoom')}</span>
          <a href={url} download>{t('Download GLB')}</a>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ModelViewer({ url, poster, height = 200, light }: {
  url: string
  poster?: string
  height?: number
  light?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pop, setPop] = useState(false)
  const [err, setErr] = useState('')

  // 카드 안에서 실패하면 거기서 끝내지 않고 팝업으로 넘긴다.
  // 대개 WebGL 컨텍스트가 모자라서인데, 팝업은 하나만 뜨므로 거기서는 열린다.
  const fail = (m: string) => { setErr(m); setOpen(false); setPop(true) }

  return (
    <div className="mv" style={{ height }}>
      {open && !err
        ? <Stage url={url} height={height} light={light} onError={fail} />
        : (
          <button className="mv-open" onPointerDown={e => e.stopPropagation()}
            onClick={() => { setErr(''); setOpen(true) }}>
            {poster && <img src={poster} alt="" />}
            <span className="mv-cta">{t('Open 3D')}</span>
          </button>
        )}
      {/* 인라인이 떠 있어도 크게 보고 싶을 수 있다 */}
      <button className="mv-expand" title={t('Open full size')}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setPop(true) }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 3.8H4.4v4.6M15 3.8h4.6v4.6M9 20.2H4.4v-4.6M15 20.2h4.6v-4.6" />
        </svg>
      </button>
      {pop && <Popup url={url} light={light} onClose={() => setPop(false)} />}
    </div>
  )
}
