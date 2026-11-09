// アンカーとスタンド: ビューは、id を持つ物（アイテム・リストの行・節・ディレクトリの行など）を描く要素に、その id のアンカーを付ける（useAnchorRef）。
// スタンド（Stand）は、アンカーの id を指して、その物のそばに立つ。スタンドはスタンドのレイヤー（スロット book-layers）に描かれ、
// 倍率では大きさを変えない。パン・倍率・リストのスクロールで物が動けば、付いて動く。
// 置ける範囲（スタンドのレイヤー）に入らなければ、反対の側へ回すか（StandAt の turn が none なら回さず）、範囲の中へ寄せる。edgePinned のスタンドは、アンカーの上の辺が見える所（範囲と、アンカーを囲む
// Revealable（リストの行の並びなど）の重なり）の外に出たら（StandAt の minRoom より、いつもの立ち位置から範囲の端までが狭いときも）寄せずに付いて行き、中の物は useStandAway で、縁に寄せる点と、その物を見せる
// （囲む物の中のスクロールと、紙をずらしてアンカーを真ん中へ）関数を受け取る。
// 線のように形を持つ物は、形の要素（SVG の polyline）を useAnchorShapeRef で同じ id に知らせる。スタンドの中の物は useStandShape で、形の点（スタンドの左上から）を受け取る。
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
import { useBook, useStage, useStagePan } from "../../../ui/view-hooks"
import styles from "./anchors.module.css"
import { glidePan } from "./glide-pan"
import { KEEP_INSIDE } from "./keep-inside"
import { useClearRevealRequest, useRevealRequest } from "./reveal-request"
import { revealAround, revealablesAround } from "./revealable"
import { stageElement } from "./stage-element"
import {
  intersectRect,
  pointInto,
  revealShift,
  roomBeside,
  STAND_MARGIN,
  type StandPlace,
  type StandSide,
  type StandTurn,
  standAt,
  standBeside,
  topEdgeOut,
  unionRect,
} from "./stand-place"
import { ZOOM_MS } from "./useZoomMotion"

// ステージのアンカーの表: id → 要素と、変わったときに知らせる先
interface Anchors {
  ref(id: string): (el: Element | null) => void // id のアンカーを付ける ref（id ごとに同じ関数なので、付け直しで描き直さない）
  shapeRef(id: string): (el: Element | null) => void // id のアンカーの形の要素を付ける ref
  element(id: string): Element | undefined
  shape(id: string): Element | undefined
  subscribe(listener: () => void): () => void
  snapshot(): number // 変わるたびに増える数
}

function newAnchors(): Anchors {
  const elements = new Map<string, Element>()
  const shapes = new Map<string, Element>()
  const refs = new Map<string, (el: Element | null) => void>()
  const shapeRefs = new Map<string, (el: Element | null) => void>()
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
    shapeRef: id => {
      let r = shapeRefs.get(id)
      if (!r) {
        r = el => {
          if (el) shapes.set(id, el)
          else shapes.delete(id)
          changed()
        }
        shapeRefs.set(id, r)
      }
      return r
    },
    element: id => elements.get(id),
    shape: id => shapes.get(id),
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

// id のアンカーの形の要素（SVG の polyline）を付ける ref を返す関数。要素の点が、その物の形（アンカーを 1 つだけ指すスタンドが useStandShape で受け取る）
export function useAnchorShapeRef(): (id: string) => (el: Element | null) => void {
  const anchors = useContext(Context)?.anchors
  return useCallback((id: string) => (anchors ? anchors.shapeRef(id) : NO_REF), [anchors])
}

// スタンドのレイヤー（ウィジェット stand-layer）: スタンドを描く所。ポインタは、中のスタンドだけが受ける
export function StandLayer() {
  const setLayer = useContext(Context)?.setLayer
  return <div ref={setLayer} className={styles.layer} data-stand-layer />
}

// アンカー anchor の物に重ねる枠（スタンドのレイヤーに描き、ポインタは通す）。物が動けば付いて動く。見た目は className が決める。アンカーが描かれていなければ出さない
export function AnchorFrame({ anchor, className }: { anchor: string; className: string | undefined }) {
  const ctx = useContext(Context)
  const ids = useMemo(() => [anchor], [anchor])
  const measured = useAnchorRect(ctx, ids, false)
  if (!ctx?.layer || !measured) return null
  const { rect } = measured
  return createPortal(
    <div
      className={className}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      data-anchor-frame
    />,
    ctx.layer,
  )
}

// edgePinned のスタンドのアンカーの上の辺が、見える所の外に出ている間に、中の物が受け取る物
export interface StandAway {
  // スタンドの中の点 p（スタンドの左上から）を、アンカーを囲む Revealable の端から、続けて置ける範囲の端から、pad（既定はスタンドと端のすき間）の
  // 内側に寄せた点（スタンドの左上から）。囲む物が範囲の中にあればその物の縁に、外に出ていれば範囲の縁に来る
  pin(p: Point, pad?: number): Point
  // アンカーを見せる: 物を囲む Revealable に頼んでから、紙をずらしてアンカーを表示領域の真ん中へ動かす（倍率は変えない。紙の端で、ずらせる所まで）
  show(): void
  // 見せたあと、スタンドに戻るか（stand）、真ん中へ動かしても StandAt の minRoom の余地が無く、縁に寄せたままか（pointer。物が範囲より広いとき）
  afterShow: "stand" | "pointer"
}
const AwayContext = createContext<StandAway | null>(null)

// スタンドを置いた所から見たアンカーの四角（スタンドの左上から）と、スタンドの大きさと、side のいつもの立ち位置から置ける範囲の端までの余地 room（roomBeside）。
// 中の物が、アンカーの方を指したり（吹き出しの尾など）、幅を合わせたりするのに使う（測り終えるまで null）
export interface StandFacing {
  anchor: Rect
  size: Size
  room: number
}
const FacingContext = createContext<StandFacing | null>(null)
export const useStandFacing = (): StandFacing | null => useContext(FacingContext)

// スタンドが指すアンカーが 1 つで、形の要素を知らせてあれば、その形の点（スタンドの左上から。線の両端と折れ目の並び）。無ければ null
const ShapeContext = createContext<readonly Point[] | null>(null)
export const useStandShape = (): readonly Point[] | null => useContext(ShapeContext)

// スタンドの中で、アンカーの上の辺が見える所の外に出ていれば StandAway（edgePinned でないか、外に出ていなければ null）
export const useStandAway = (): StandAway | null => useContext(AwayContext)

// アンカー anchor（いくつも指せば、まとめた範囲）の side に立つスタンド。アンカーが描かれていなければ出さない。
// span なら、幅をアンカーの幅（画面の上の幅）にそろえる。edgePinned なら、アンカーの上の辺が見える所の外に出たとき、範囲の中へ寄せずに付いて行く。
// プラグイン API の Stand は角（corner）に立てられない（角はコーナーステータスで出す）。角に立てるのは base の角のスタンドだけで、StandAt を使う。
// StandAt の minRoom は、side のいつもの立ち位置から範囲の端までの余地（roomBeside）がそれより狭ければ、上の辺が外に出たのと同じにする（edgePinned のときだけ。範囲の端に押されて縮める吹き出しが、縮めきれないとき）。
// StandAt の turn は、side に入らないときに反対の側へ回すか（opposite）、回さずに範囲の端で止めるか（none）。
// StandAt の through は、スタンドの箱そのものはポインタを受けず（下の物に届く）、中の物が自分で受けるとき（物の上の辺を歩く鳥など）に付ける
export const Stand: (props: StandProps & { side?: StandSide; through?: boolean }) => ReactNode = props => (
  <StandAt {...props} />
)

interface StandProps {
  anchor: string | readonly string[]
  span?: boolean
  edgePinned?: boolean
  label?: string
  children: ReactNode
}

export function StandAt({
  anchor,
  side = "below",
  span = false,
  edgePinned = false,
  label,
  turn = "opposite",
  minRoom = 0,
  through = false,
  children,
}: StandProps & { side?: StandPlace; turn?: StandTurn; minRoom?: number; through?: boolean }) {
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
  const { rect, clip, area } = measured
  const whole = { x: 0, y: 0, ...area }
  const room = roomBeside(rect, area, side)
  const out = edgePinned && (topEdgeOut(rect, clip ? intersectRect(clip, whole) : whole) || room < minRoom)
  const centered = { ...rect, x: (area.w - rect.w) / 2, y: (area.h - rect.h) / 2 }
  const at = !size
    ? { x: rect.x, y: rect.y + rect.h }
    : out
      ? standBeside(rect, size, side)
      : standAt(rect, size, area, side, turn)
  const shape = measured.path ? measured.path.map(p => ({ x: p.x - at.x, y: p.y - at.y })) : null
  const facing = size
    ? {
        anchor: { x: rect.x - at.x, y: rect.y - at.y, w: rect.w, h: rect.h },
        size,
        room,
      }
    : null
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
        afterShow: roomBeside(centered, area, side) < minRoom ? "pointer" : "stand",
      }
    : null
  return createPortal(
    // biome-ignore lint/a11y/useSemanticElements: スタンドは中身を束ねる箱で、入力Formのまとまり（fieldset）ではない
    <div
      ref={ref}
      className={styles.stand}
      role="group"
      aria-label={label}
      style={{
        left: at.x,
        top: at.y,
        width: span ? rect.w : undefined,
        visibility: size ? undefined : "hidden",
        ...(through ? { pointerEvents: "none" } : {}),
      }}
      data-stand
      {...KEEP_INSIDE}
    >
      <AwayContext.Provider value={away}>
        <ShapeContext.Provider value={shape}>
          <FacingContext.Provider value={facing}>{children}</FacingContext.Provider>
        </ShapeContext.Provider>
      </AwayContext.Provider>
    </div>,
    ctx.layer,
  )
}

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

// 見せてと頼まれた物（ステージの画面の状態の revealing。送信トレイの行を押したときなど）を、描かれたら見せて、頼みを消す（ほかのページを開いたあとは、描かれるのを待つ）
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

// 物の要素 found（要素とアンカーの id）を、ステージの表示領域 view の中で囲む Revealable に見えるようにと頼んでから、まとめて囲む四角（base の左上から。無ければ null）
export function revealedRect(base: Element, view: Element, found: readonly { el: Element; id: string }[]): Rect | null {
  for (const { el, id } of found) revealAround(el, view, id)
  return (
    measureIn(
      base,
      found.map(f => f.el),
    )?.rect ?? null
  )
}

// アンカーの要素の四角と、clipped なら囲む Revealable の見える所（どちらもスタンドのレイヤーの左上から）と、レイヤー（置ける範囲）の大きさ。
// パン・倍率・大きさ・スクロールと、レイヤーの大きさ（ステージの幅が動くなど）が変われば測り直す
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
      ids.length === 1 ? ctx.anchors.shape(ids[0] as string) : undefined,
    )
  }, [ctx, ids, clipped])
  const [measured, setMeasured] = useState<Measured | null>(null)
  // 開いているブックのデータ（物の位置や大きさが変わる）
  const book = useBook(ctx?.stage ?? "")
  // パン・倍率・アンカー・ブックのデータが替わったとき、紙が動き終えるまで（なめらかに移す間も）コマごとに測る
  // biome-ignore lint/correctness/useExhaustiveDependencies: パン・倍率・アンカーの表・ブックのデータ・スクロールが変わるたびに測り直す
  useLayoutEffect(() => {
    let frame = 0
    const until = performance.now() + ZOOM_MS + 50
    const step = () => {
      setMeasured(prev => same(prev, measure()))
      if (performance.now() < until) frame = requestAnimationFrame(step)
    }
    step()
    return () => cancelAnimationFrame(frame)
  }, [measure, pan, stage?.zoom, version, tick, book])
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
  // アンカーの物の大きさの変化（リストの大きさを変えて行の幅が変わったなど）と、レイヤーの大きさの変化（右サイドパネルの開け閉めでステージの幅が動くなど）
  // biome-ignore lint/correctness/useExhaustiveDependencies: アンカーの表が変わるたびに見張り直す
  useEffect(() => {
    if (!ctx || typeof ResizeObserver === "undefined") return
    const watch = new ResizeObserver(() => setTick(n => n + 1))
    if (ctx.layer) watch.observe(ctx.layer)
    for (const id of ids) {
      const el = ctx.anchors.element(id)
      if (el) watch.observe(el)
    }
    return () => watch.disconnect()
  }, [ctx, ids, version])
  return measured
}

// 測ったアンカー: 要素をまとめて囲む四角（rect）と、要素を囲む Revealable の見える所（clip。測らないか、囲む物が無ければ null）と、形の点（path。layer の左上から。形が無ければ null）と、
// layer（スタンドを置ける範囲）の大きさ（area。アンカーが動かずに範囲の幅だけが変わっても、置き直すため）
interface Measured {
  rect: Rect
  clip: Rect | null
  path: readonly Point[] | null
  area: Size
}

// 要素 elements（描かれていない物は undefined）をまとめて囲む四角（layer の左上から。どれも無ければ null）。
// outer を渡せば、要素を囲む Revealable（outer の内側だけ。中の物の見え方を自分で変える物）の四角を重ねて、要素ごとの見える所をまとめた物も測る
function measureIn(
  layer: Element,
  elements: readonly (Element | undefined)[],
  outer?: Element,
  shape?: Element,
): Measured | null {
  const els = elements.filter((e): e is Element => e !== undefined)
  if (els.length === 0) return null
  const base = layer.getBoundingClientRect()
  const local = (r: DOMRect): Rect => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height })
  const rect = unionRect(els.map(el => local(el.getBoundingClientRect())))
  const path = shape ? shapePath(shape, base) : null
  const area = { w: layer.clientWidth, h: layer.clientHeight }
  if (!outer) return { rect, clip: null, path, area }
  const clips = els.flatMap(el => {
    const boxes = revealablesAround(el, outer).map(at => local(at.getBoundingClientRect()))
    return boxes.length > 0 ? [boxes.reduce(intersectRect)] : []
  })
  return { rect, clip: clips.length === els.length ? unionRect(clips) : null, path, area }
}

// 形の要素（SVG の polyline）の点を、画面の位置にして layer の左上から測った点の並び（点が 2 つに満たなければ null）
function shapePath(shape: Element, base: DOMRect): readonly Point[] | null {
  if (!(shape instanceof SVGPolylineElement)) return null
  const matrix = shape.getScreenCTM()
  if (!matrix || shape.points.numberOfItems < 2) return null
  const out: Point[] = []
  for (let i = 0; i < shape.points.numberOfItems; i++) {
    const p = shape.points.getItem(i).matrixTransform(matrix)
    out.push({ x: p.x - base.left, y: p.y - base.top })
  }
  return out
}

const noSubscribe = () => () => {}
const zero = () => 0
const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h)
const samePath = (a: readonly Point[] | null, b: readonly Point[] | null) =>
  a === b ||
  (a !== null && b !== null && a.length === b.length && a.every((p, i) => p.x === b[i]?.x && p.y === b[i]?.y))
const same = (a: Measured | null, b: Measured | null): Measured | null =>
  a &&
  b &&
  sameRect(a.rect, b.rect) &&
  sameRect(a.clip, b.clip) &&
  samePath(a.path, b.path) &&
  a.area.w === b.area.w &&
  a.area.h === b.area.h
    ? a
    : b
