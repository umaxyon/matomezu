// アンカーとスタンド: ビューは、id を持つ物（アイテム・リストの行・節・ディレクトリの行など）を描く要素に、その id のアンカーを付ける（useAnchorRef）。
// スタンド（Stand）は、アンカーの id を指して、その物のそばに立つ。スタンドはスタンドのレイヤー（スロット book-layers）に描かれ、
// 倍率では大きさを変えない。パン・倍率・リストのスクロールで物が動けば、付いて動く。
// 置ける範囲（スタンドのレイヤー）に入らなければ、範囲の中へ寄せる。edgePinned のスタンドは、アンカーの上の辺が見える所（範囲と、アンカーを囲む
// Revealable（リストの行の並びなど）の重なり）の外に出たら寄せずに付いて行き、中の物は useStandAway で、縁に寄せる点と、その物を見せる
// （囲む物の中のスクロールと、紙をずらしてアンカーを真ん中へ）関数を受け取る。
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
import type { Point, Rect, Size } from "../../../core/geom"
import { useActions } from "../../../ui/store-context"
import { useStage, useStagePan } from "../../../ui/view-hooks"
import styles from "./anchors.module.css"
import { glidePan } from "./glide-pan"
import { useClearRevealRequest, useRevealRequest } from "./reveal-request"
import { revealAround, revealablesAround } from "./revealable"
import { stageElement } from "./stage-element"
import {
  intersectRect,
  pointInto,
  revealShift,
  STAND_MARGIN,
  type StandSide,
  standAt,
  standBeside,
  topEdgeOut,
  unionRect,
} from "./stand-place"
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
          if (el) {
            elements.set(id, el)
            el.setAttribute(ANCHOR_ATTR, id)
          } else elements.delete(id)
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

// アンカーを付けた要素は、その id を属性に持つ（押された要素から、アンカーの付いた物を探すため）
const ANCHOR_ATTR = "data-anchor"

// 要素 el か、その外側で一番近い、アンカーの付いた物の id（無ければ undefined）
export function anchorOf(el: Element | null): string | undefined {
  return el?.closest(`[${ANCHOR_ATTR}]`)?.getAttribute(ANCHOR_ATTR) ?? undefined
}

// ステージ stage の表示領域（ステージのビューの要素）と、その中で id のアンカーが付いた要素（どちらか無ければ null。
// アンカーの表はステージの中にあるので、ステージの外の物は、付けた属性で探す）
export function anchorElementIn(stage: string, id: string): { view: Element; el: Element } | null {
  const view = stageElement(stage)
  const el = view?.querySelector(`[${ANCHOR_ATTR}="${CSS.escape(id)}"]`)
  return view && el ? { view, el } : null
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
  return (
    <Context.Provider value={value}>
      {children}
      <RevealRequested ctx={value} />
    </Context.Provider>
  )
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

// edgePinned のスタンドのアンカーの上の辺が、見える所の外に出ている間に、中の物が受け取る物
export interface StandAway {
  // スタンドの中の点 p（スタンドの左上から）を、アンカーを囲む Revealable の端から、続けて置ける範囲の端から、pad（既定はスタンドと端のすき間）の
  // 内側に寄せた点（スタンドの左上から）。囲む物が範囲の中にあればその物の縁に、外に出ていれば範囲の縁に来る
  pin(p: Point, pad?: number): Point
  // アンカーを見せる: 物を囲む Revealable に頼んでから、紙をずらしてアンカーを表示領域の真ん中へ動かす（倍率は変えない。紙の端で、ずらせる所まで）
  show(): void
}
const AwayContext = createContext<StandAway | null>(null)

// スタンドの中で、アンカーの上の辺が見える所の外に出ていれば StandAway（edgePinned でないか、外に出ていなければ null）
export const useStandAway = (): StandAway | null => useContext(AwayContext)

// アンカー anchor（いくつも指せば、まとめた範囲）の side に立つスタンド。アンカーが描かれていなければ出さない。
// span なら、幅をアンカーの幅（画面の上の幅）にそろえる。edgePinned なら、アンカーの上の辺が見える所の外に出たとき、範囲の中へ寄せずに付いて行く
export function Stand({
  anchor,
  side = "below",
  span = false,
  edgePinned = false,
  label,
  children,
}: {
  anchor: string | readonly string[]
  side?: StandSide
  span?: boolean
  edgePinned?: boolean
  label?: string
  children: ReactNode
}) {
  const ctx = useContext(Context)
  const { panStageBy } = useActions()
  const ids = useMemo(() => (typeof anchor === "string" ? [anchor] : anchor), [anchor])
  const measured = useAnchorRect(ctx, ids, edgePinned)
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
  if (!ctx?.layer || !measured) return null
  const { rect, clip } = measured
  const area = { w: ctx.layer.clientWidth, h: ctx.layer.clientHeight }
  const whole = { x: 0, y: 0, ...area }
  const out = edgePinned && topEdgeOut(rect, clip ? intersectRect(clip, whole) : whole)
  const at = !size
    ? { x: rect.x, y: rect.y + rect.h }
    : out
      ? standBeside(rect, size, side)
      : standAt(rect, size, area, side)
  const away: StandAway | null = out
    ? {
        pin: (p, pad = STAND_MARGIN) => {
          const inStand = { x: at.x + p.x, y: at.y + p.y }
          const pinned = pointInto(clip ? pointInto(inStand, clip, pad) : inStand, whole, pad)
          return { x: pinned.x - at.x, y: pinned.y - at.y }
        },
        show: () => {
          showAnchors(ctx, ids, panStageBy)
        },
      }
    : null
  return createPortal(
    // biome-ignore lint/a11y/useSemanticElements: スタンドは中身を束ねる箱で、入力Formのまとまり（fieldset）ではない
    <div
      ref={ref}
      className={styles.stand}
      role="group"
      aria-label={label}
      style={{ left: at.x, top: at.y, width: span ? rect.w : undefined, visibility: size ? undefined : "hidden" }}
      data-stand
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onContextMenu={stop}
      onWheel={stop}
      onKeyDown={stop}
    >
      <AwayContext.Provider value={away}>{children}</AwayContext.Provider>
    </div>,
    ctx.layer,
  )
}

// 物の要素 found（要素とアンカーの id）を、ステージの表示領域 view の中で囲む Revealable に見えるようにと頼んでから、まとめて囲む四角（base の左上から。無ければ null）
// ステージのアンカーの表 ctx で、アンカー ids の物を見せる: 物を囲む Revealable に頼んでから、紙をなめらかにずらして物を表示領域の真ん中へ動かす
// （倍率は変えない。紙の端で、ずらせる所まで）。どれも描かれていなければ何もせず false
function showAnchors(
  ctx: StandContext,
  ids: readonly string[],
  panStageBy: (stage: string, dx: number, dy: number) => void,
): boolean {
  const layer = ctx.layer
  const view = stageElement(ctx.stage)
  if (!layer || !view) return false
  const found = ids.flatMap(id => {
    const el = ctx.anchors.element(id)
    return el ? [{ el, id }] : []
  })
  const now = revealedRect(layer, view, found)
  if (!now) return false
  const by = revealShift(now, { w: layer.clientWidth, h: layer.clientHeight })
  glidePan((dx, dy) => panStageBy(ctx.stage, dx, dy), by.x, by.y)
  return true
}

// 見せてと頼まれた物（ステージの画面の状態の revealing。伝言一覧の行を押したときなど）を、描かれたら見せて、頼みを消す（ほかのページを開いたあとは、描かれるのを待つ）
function RevealRequested({ ctx }: { ctx: StandContext }) {
  const ids = useRevealRequest(ctx.stage)
  const clear = useClearRevealRequest()
  const { panStageBy } = useActions()
  const version = useSyncExternalStore(ctx.anchors.subscribe, ctx.anchors.snapshot)
  // biome-ignore lint/correctness/useExhaustiveDependencies: アンカーが描かれるたび（version）に見直す
  useEffect(() => {
    if (ids && showAnchors(ctx, ids, panStageBy)) clear(ctx.stage)
  }, [ids, ctx, panStageBy, clear, version])
  return null
}

export function revealedRect(base: Element, view: Element, found: readonly { el: Element; id: string }[]): Rect | null {
  for (const { el, id } of found) revealAround(el, view, id)
  return (
    measureIn(
      base,
      found.map(f => f.el),
    )?.rect ?? null
  )
}

// アンカーの要素の四角と、clipped なら囲む Revealable の見える所（どちらもスタンドのレイヤーの左上から）。パン・倍率・大きさ・スクロールで動けば測り直す
function useAnchorRect(ctx: StandContext | null, ids: readonly string[], clipped: boolean): Measured | null {
  const stage = useStage(ctx?.stage ?? "")
  const pan = useStagePan(ctx?.stage ?? "")
  const version = useSyncExternalStore(ctx?.anchors.subscribe ?? noSubscribe, ctx?.anchors.snapshot ?? zero)
  const [tick, setTick] = useState(0)
  const measure = useCallback((): Measured | null => {
    if (!ctx?.layer) return null
    return measureIn(
      ctx.layer,
      ids.map(id => ctx.anchors.element(id)),
      clipped ? (stageElement(ctx.stage) ?? undefined) : undefined,
    )
  }, [ctx, ids, clipped])
  const [measured, setMeasured] = useState<Measured | null>(null)
  // パン・倍率・アンカーが替わったとき、紙が動き終えるまで（なめらかに移す間も）コマごとに測る
  // biome-ignore lint/correctness/useExhaustiveDependencies: パン・倍率・アンカーの表・スクロールが変わるたびに測り直す
  useLayoutEffect(() => {
    let frame = 0
    const until = performance.now() + ZOOM_MS + 50
    const step = () => {
      setMeasured(prev => same(prev, measure()))
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
  return measured
}

// 測ったアンカー: 要素をまとめて囲む四角（rect）と、要素を囲む Revealable の見える所（clip。測らないか、囲む物が無ければ null）
interface Measured {
  rect: Rect
  clip: Rect | null
}

// 要素 elements（描かれていない物は undefined）をまとめて囲む四角（layer の左上から。どれも無ければ null）。
// outer を渡せば、要素を囲む Revealable（outer の内側だけ。中の物の見え方を自分で変える物）の四角を重ねて、要素ごとの見える所をまとめた物も測る
function measureIn(layer: Element, elements: readonly (Element | undefined)[], outer?: Element): Measured | null {
  const els = elements.filter((e): e is Element => e !== undefined)
  if (els.length === 0) return null
  const base = layer.getBoundingClientRect()
  const local = (r: DOMRect): Rect => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height })
  const rect = unionRect(els.map(el => local(el.getBoundingClientRect())))
  if (!outer) return { rect, clip: null }
  const clips = els.flatMap(el => {
    const boxes = revealablesAround(el, outer).map(at => local(at.getBoundingClientRect()))
    return boxes.length > 0 ? [boxes.reduce(intersectRect)] : []
  })
  return { rect, clip: clips.length === els.length ? unionRect(clips) : null }
}

// スタンドの中の操作は、スタンドを描いたビュー（React の上の物）に渡さない
const stop = (e: { stopPropagation(): void }) => e.stopPropagation()
const noSubscribe = () => () => {}
const zero = () => 0
const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)
const same = (a: Measured | null, b: Measured | null): Measured | null =>
  a && b && sameRect(a.rect, b.rect) && sameRect(a.clip, b.clip) ? a : b
