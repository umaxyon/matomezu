// アンカーとスタンド: ビューは、id を持つ物（アイテム・リストの行・節・ディレクトリの行など）を描く要素に、その id のアンカーを付ける（useAnchorRef）。
// スタンド（Stand）は、アンカーの id を指して、その物のそばに立つ。スタンドはスタンドのレイヤー（スロット book-layers）に描かれ、
// 倍率では大きさを変えない。パン・倍率・リストのスクロールで物が動けば、付いて動く。
// アンカーの表（id → 要素）はステージごとに 1 つで、ステージのビューが渡す。ブックのデータにも画面の状態にも入れず、描いている間だけ持つ
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"
import type { Rect, Size } from "../../../core/geom"
import { useStage, useStagePan } from "../../../ui/view-hooks"
import styles from "./anchors.module.css"
import { type StandSide, standAt, unionRect } from "./stand-place"
import { ZOOM_MS } from "./useZoomMotion"

// ステージのアンカーの表: id → 要素と、変わったときに知らせる先
interface Anchors {
  ref(id: string): (el: Element | null) => void // id のアンカーを付ける ref（id ごとに同じ関数なので、付け直しで描き直さない）
  element(id: string): Element | undefined
  subscribe(listener: () => void): () => void
  snapshot(): number // 変わるたびに増える数
}

function newAnchors(): Anchors {
  const elements = new Map<string, Element>()
  const refs = new Map<string, (el: Element | null) => void>()
  const listeners = new Set<() => void>()
  let version = 0
  const changed = () => {
    version++
    for (const l of listeners) l()
  }
  return {
    ref: id => {
      let r = refs.get(id)
      if (!r) {
        r = el => {
          if (el) elements.set(id, el)
          else elements.delete(id)
          changed()
        }
        refs.set(id, r)
      }
      return r
    },
    element: id => elements.get(id),
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot: () => version,
  }
}

interface StandContext {
  stage: string
  anchors: Anchors
  layer: HTMLDivElement | null
  setLayer: (el: HTMLDivElement | null) => void
}
const Context = createContext<StandContext | null>(null)

// ステージのビューが、開いたブックのレイヤーを包む
export function AnchorsProvider({ stage, children }: { stage: string; children: ReactNode }) {
  const anchors = useMemo(newAnchors, [])
  const [layer, setLayer] = useState<HTMLDivElement | null>(null)
  const value = useMemo(() => ({ stage, anchors, layer, setLayer }), [stage, anchors, layer])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

// id のアンカーを付ける ref を返す関数（アンカーの表の外では何もしない）
const NO_REF = () => {}
export function useAnchorRef(): (id: string) => (el: Element | null) => void {
  const anchors = useContext(Context)?.anchors
  return useCallback((id: string) => (anchors ? anchors.ref(id) : NO_REF), [anchors])
}

// スタンドのレイヤー（ウィジェット stand-layer）: スタンドを描く所。ポインタは、中のスタンドだけが受ける
export function StandLayer() {
  const setLayer = useContext(Context)?.setLayer
  return <div ref={setLayer} className={styles.layer} data-stand-layer />
}

// アンカー anchor（いくつも指せば、まとめた範囲）の side に立つスタンド。アンカーが描かれていなければ出さない
export function Stand({
  anchor,
  side = "below",
  label,
  children,
}: {
  anchor: string | readonly string[]
  side?: StandSide
  label?: string
  children: ReactNode
}) {
  const ctx = useContext(Context)
  const ids = useMemo(() => (typeof anchor === "string" ? [anchor] : anchor), [anchor])
  const rect = useAnchorRect(ctx, ids)
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () =>
      setSize(s =>
        s && s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight },
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  })
  if (!ctx?.layer || !rect) return null
  const area = { w: ctx.layer.clientWidth, h: ctx.layer.clientHeight }
  const at = size ? standAt(rect, size, area, side) : { x: rect.x, y: rect.y + rect.h }
  return createPortal(
    // biome-ignore lint/a11y/useSemanticElements: スタンドは中身を束ねる箱で、入力Formのまとまり（fieldset）ではない
    <div
      ref={ref}
      className={styles.stand}
      role="group"
      aria-label={label}
      style={{ left: at.x, top: at.y, visibility: size ? undefined : "hidden" }}
      data-stand
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onContextMenu={stop}
      onWheel={stop}
      onKeyDown={stop}
    >
      {children}
    </div>,
    ctx.layer,
  )
}

// アンカーの要素の四角（スタンドのレイヤーの左上から）。パン・倍率・大きさ・スクロールで動けば測り直す
function useAnchorRect(ctx: StandContext | null, ids: readonly string[]): Rect | null {
  const stage = useStage(ctx?.stage ?? "")
  const pan = useStagePan(ctx?.stage ?? "")
  const version = useSyncExternalStore(ctx?.anchors.subscribe ?? noSubscribe, ctx?.anchors.snapshot ?? zero)
  const [tick, setTick] = useState(0)
  const measure = useCallback((): Rect | null => {
    if (!ctx?.layer) return null
    const els = ids.map(id => ctx.anchors.element(id)).filter((e): e is Element => e !== undefined)
    if (els.length === 0) return null
    const base = ctx.layer.getBoundingClientRect()
    return unionRect(
      els.map(el => {
        const r = el.getBoundingClientRect()
        return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }
      }),
    )
  }, [ctx, ids])
  const [rect, setRect] = useState<Rect | null>(null)
  // パン・倍率・アンカーが替わったとき、紙が動き終えるまで（なめらかに移す間も）コマごとに測る
  // biome-ignore lint/correctness/useExhaustiveDependencies: パン・倍率・アンカーの表・スクロールが変わるたびに測り直す
  useLayoutEffect(() => {
    let frame = 0
    const until = performance.now() + ZOOM_MS + 50
    const step = () => {
      setRect(prev => same(prev, measure()))
      if (performance.now() < until) frame = requestAnimationFrame(step)
    }
    step()
    return () => cancelAnimationFrame(frame)
  }, [measure, pan, stage?.zoom, version, tick])
  // 中のスクロール（リストなど）と、表示領域の大きさの変化
  useEffect(() => {
    const again = () => setTick(n => n + 1)
    window.addEventListener("scroll", again, true)
    window.addEventListener("resize", again)
    return () => {
      window.removeEventListener("scroll", again, true)
      window.removeEventListener("resize", again)
    }
  }, [])
  return rect
}

// スタンドの中の操作は、スタンドを描いたビュー（React の上の物）に渡さない
const stop = (e: { stopPropagation(): void }) => e.stopPropagation()
const noSubscribe = () => () => {}
const zero = () => 0
const same = (a: Rect | null, b: Rect | null): Rect | null =>
  a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h ? a : b
