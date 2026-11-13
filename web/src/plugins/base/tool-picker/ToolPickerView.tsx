// 道具のアイコンのビュー（ウィジェット tool-picker）: 紙のあるステージで右ボタンを押し続けると、押している間はポインタの周りに輪が満ちていき、
// 利用者の設定の長押しの時間（hold.ts）で、そのステージの道具の組の道具のアイコンをポインタのすぐ近くに並べて出す（core/stage.ts の picker）。
// 押し続けている間に MOVE_SLOP より動いたら取り消す。長押しで出したら、右クリックのメニューは出さない。Space（コマンド tool-picker）でも開く。
// 出ている間は画面に薄い幕を掛けてほかの操作を止める。アイコンを押すとその道具にして閉じる。
// アイコンの外を押す・閉じるキー（menu-close。既定は Escape と Space）・並びから離れる・窓の大きさが変わる・窓から焦点が外れると、何もせずに閉じる。
// アイコンはポインタの位置から回りながら広がり、乗るとポインタの側に名前を出す。並びの外側（ポインタと反対の側）には、ミニマップ（base/minimap の MinimapView）と、
// その下に拡大縮小の帯（base/zoom の ZoomBar）を一緒に出し、少し遅れて浮かび上がらせる（紙が収まっていても出す。入らなければ出さない。置き方は layout.ts）。
// 離れたかはアイコンとミニマップを合わせた枠から測る（ボタンを押している間は、離れても閉じない。四角をドラッグするため）。押し続けの途中の様子と最後のポインタの位置だけはビューに持つ
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import type { ToolId } from "../../../core/catalog"
import type { Point } from "../../../core/geom"
import { paperOf } from "../../../core/stage"
import { toolDef, toolSetOf, toolsIn } from "../../../core/tools"
import { allStages, bookScreenCurrent, screenOf, workspaceOf } from "../../../core/window"
import { useCommand } from "../../../ui/commands"
import { suppressContextMenu } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import { useActions, useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { useStage, useUserSetting } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { MINIMAP_SIZE } from "../minimap/geometry"
import { MinimapView } from "../minimap/MinimapView"
import { unusableTools } from "../tool-switch/tools"
import { stageElement } from "../utils/stage-element"
import { ZoomBar } from "../zoom/ZoomBar"
import { TOOL_SET } from "."
import { holdMsOf, TOOL_PICKER_HOLD } from "./hold"
import { ICON, type Lay, leftPicker, pickerSlots } from "./layout"
import styles from "./ToolPickerView.module.css"

const MOVE_SLOP = 5 // 長押しを取り消さない動きの遊び（px）
const RING_R = 14 // 押している間の輪の半径
const RING_SHOW = 120 // 輪を出し始めるまで（ふつうの右クリックで輪がちらつかないように）
// ミニマップの台の大きさ: 絵の枠に、台の内側の余白（6px）と線（1px）、拡大縮小の帯（上の間 6px と高さ 20px）を足す（ToolPickerView.module.css の .map と合わせる）
const MAP_CARD = { w: MINIMAP_SIZE.w + 14, h: MINIMAP_SIZE.h + 14 + 26 }

// 右ボタンの押し続け
interface Press {
  stage: string
  start: Point
  at: Point
  timer: number
}

const typing = (el: Element | null) => !!el?.closest("input, textarea, select, [contenteditable]")

export function ToolPickerView() {
  const { openPicker, closeContextMenu } = useActions()
  const last = useRef<Point | null>(null)
  const press = useRef<Press | null>(null)
  const [ring, setRing] = useState<Point | null>(null)
  // 長押しで開けるステージ（ブックスクリーンが前に出ていて、紙があり、ダイアログも道具のアイコンも開いていない）。押したときに読むので ref に写す
  const pressable = useMatomezuState(
    useShallow(s =>
      s.dialog !== null || !bookScreenCurrent(s.window) || allStages(s.window).some(st => st.picker !== null)
        ? []
        : screenOf(s.window)
            .stages.filter(st => paperOf(st) !== null)
            .map(st => st.id),
    ),
  )
  const pressableRef = useRef(pressable)
  pressableRef.current = pressable
  const holdMs = holdMsOf(useUserSetting(TOOL_PICKER_HOLD.id))
  const holdRef = useRef(holdMs)
  holdRef.current = holdMs

  useEffect(() => {
    const end = () => {
      if (press.current) clearTimeout(press.current.timer)
      press.current = null
      setRing(null)
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 2 || e.pointerType !== "mouse") return
      end()
      const target = e.target instanceof Element ? e.target : null
      const stage = target?.closest("[data-stage]")?.getAttribute("data-stage")
      if (!stage || typing(target) || !pressableRef.current.includes(stage)) return
      const at = { x: e.clientX, y: e.clientY }
      const timer = window.setTimeout(() => {
        const p = press.current
        if (!p || p.timer !== timer) return
        end()
        suppressContextMenu()
        closeContextMenu()
        openPicker(p.stage, p.at)
      }, holdRef.current)
      press.current = { stage, start: at, at, timer }
      setRing(at)
    }
    const onMove = (e: PointerEvent) => {
      last.current = { x: e.clientX, y: e.clientY }
      const p = press.current
      if (!p) return
      p.at = last.current
      if (Math.hypot(p.at.x - p.start.x, p.at.y - p.start.y) > MOVE_SLOP) end()
      else setRing(p.at)
    }
    const onUp = (e: MouseEvent) => {
      if (e.button === 2) end()
    }
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("mouseup", onUp)
    window.addEventListener("blur", end)
    return () => {
      end()
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("blur", end)
    }
  }, [openPicker, closeContextMenu])

  return (
    <>
      {ring && <Ring at={ring} holdMs={holdMs} />}
      <Picker last={last} />
    </>
  )
}

// 押している間の輪（真上から満ちる）
function Ring({ at, holdMs }: { at: Point; holdMs: number }) {
  const size = RING_R * 2 + 6
  const len = 2 * Math.PI * RING_R
  return (
    <svg
      className={styles.ring}
      width={size}
      height={size}
      style={{ left: at.x - size / 2, top: at.y - size / 2, ["--len" as string]: len }}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={RING_R}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{
          strokeDasharray: len,
          animationDelay: `${RING_SHOW}ms`,
          animationDuration: `${holdMs - RING_SHOW}ms`,
        }}
      />
    </svg>
  )
}

// 開いている道具のアイコン。出す所は開いたときの値（無ければ最後のポインタの位置。ステージの外なら真ん中）
function Picker({ last }: { last: { current: Point | null } }) {
  const t = useMessages(kit)
  const opened = useMatomezuState(s => allStages(s.window).find(st => st.picker !== null))
  const catalog = useCatalog().core
  const toolIcons = useUiCatalog().toolIcons
  const current = useStage(opened?.id ?? "")?.tool ?? null
  const set = opened ? toolSetOf(catalog, opened) : null
  const picks: readonly ToolId[] = set ? toolsIn(catalog, set) : []
  // 使えない道具（開いているページで、行うアクションをどれも認可ステップに止められる）。並びを文字で比べて、変わったときだけ描き直す
  const unusable = useMatomezuState(s =>
    opened ? unusableTools(catalog, workspaceOf(s.window, opened.id), opened.id, s.books).join("\n") : "",
  ).split("\n")
  const { closePicker } = useActions()
  const setTool = useCommand(opened?.id ?? "", TOOL_SET.id)
  const [hover, setHover] = useState<number | null>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const mapRef = useRef<HTMLDivElement>(null)
  const stage = opened?.id
  const asked = opened?.picker?.at ?? null
  // biome-ignore lint/correctness/useExhaustiveDependencies: 出す所と並べ方は、開いたときに 1 度だけ決める
  const placed = useMemo(() => {
    if (!stage) return null
    let at = asked
    if (!at) {
      const r = stageElement(stage)?.getBoundingClientRect()
      const p = last.current
      const inside = r && p && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
      at = inside ? p : r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 }
    }
    return { at, layout: pickerSlots(at, picks.length, MAP_CARD, { w: window.innerWidth, h: window.innerHeight }) }
  }, [stage])

  useEffect(() => {
    if (!placed) return
    const onMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return
      if (leftPicker(placed.layout, placed.at, { x: e.clientX, y: e.clientY })) closePicker()
    }
    const onWheel = (e: WheelEvent) => e.preventDefault()
    window.addEventListener("pointermove", onMove)
    window.addEventListener("wheel", onWheel, { capture: true, passive: false })
    window.addEventListener("resize", closePicker)
    window.addEventListener("blur", closePicker)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("wheel", onWheel, { capture: true })
      window.removeEventListener("resize", closePicker)
      window.removeEventListener("blur", closePicker)
    }
  }, [placed, closePicker])

  // アイコンはポインタの位置から、回りながら定位置へ広がる。ミニマップは、アイコンが広がり終わる頃に浮かび上がる
  useLayoutEffect(() => {
    if (!placed) return
    buttons.current.forEach((el, i) => {
      const slot = placed.layout.slots[i]
      if (!el || !slot || typeof el.animate !== "function") return
      const dx = placed.at.x - (slot.x + ICON / 2)
      const dy = placed.at.y - (slot.y + ICON / 2)
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) rotate(-180deg) scale(0.3)`, opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 200, delay: i * 35, easing: "cubic-bezier(0.2, 0.8, 0.3, 1.1)", fill: "backwards" },
      )
    })
    const map = mapRef.current
    if (map && typeof map.animate === "function")
      map.animate(
        [
          { transform: "scale(0.96)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        {
          duration: 160,
          delay: 120,
          easing: "ease-out",
          fill: "backwards",
        },
      )
  }, [placed])

  if (!opened || !placed) return null
  const { layout } = placed
  const pick = (tool: ToolId) => {
    closePicker()
    if (tool !== current) setTool.run(tool)
  }
  const tip = hover === null ? null : (layout.slots[hover] ?? null)
  const hovered = hover === null ? undefined : picks[hover]
  return (
    <div
      className={styles.overlay}
      role="toolbar"
      aria-label={t("Tool picker")}
      onPointerDown={e => {
        if (e.target !== e.currentTarget) return
        if (e.button === 2) suppressContextMenu()
        closePicker()
      }}
    >
      {picks.map((tool, i) => {
        const slot = layout.slots[i]
        if (!slot) return null
        return (
          <button
            key={tool}
            ref={el => {
              buttons.current[i] = el
            }}
            type="button"
            className={styles.button}
            aria-label={t(toolDef(catalog, tool).title)}
            aria-pressed={current === tool}
            disabled={unusable.includes(tool)}
            style={{ left: slot.x, top: slot.y, width: ICON, height: ICON }}
            onClick={() => pick(tool)}
            onPointerMove={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            {toolIcons.get(tool)}
          </button>
        )
      })}
      {layout.map && (
        <div
          ref={mapRef}
          className={styles.map}
          data-minimap="picker"
          style={{
            left: layout.map.x,
            top: layout.map.y,
            width: layout.map.w,
            height: layout.map.h,
            ["--map-w" as string]: `${MINIMAP_SIZE.w}px`,
            ["--map-h" as string]: `${MINIMAP_SIZE.h}px`,
          }}
        >
          <MinimapView stage={opened.id} width={MINIMAP_SIZE.w} height={MINIMAP_SIZE.h} className={styles.mapView} />
          <ZoomBar stage={opened.id} />
        </div>
      )}
      {tip && hovered && (
        <div
          className={styles.tip}
          data-side={tipSide(layout.lay, tip, placed.at)}
          style={tipPlace(layout.lay, tip, placed.at)}
        >
          {t(toolDef(catalog, hovered).title)}
        </div>
      )}
    </div>
  )
}

// 名前を出す側: アイコンから見てポインタ at のある側（横並びなら上か下、縦並びなら左か右）
function tipSide(lay: Lay, slot: Point, at: Point): "above" | "below" | "left" | "right" {
  if (lay === "left") return "right"
  if (lay === "right") return "left"
  return slot.y < at.y ? "below" : "above"
}

// 名前の位置（出す側の、アイコンの辺の真ん中から間を空けた所）
function tipPlace(lay: Lay, slot: Point, at: Point) {
  const g = 6
  switch (tipSide(lay, slot, at)) {
    case "right":
      return { left: slot.x + ICON + g, top: slot.y + ICON / 2 }
    case "left":
      return { left: slot.x - g, top: slot.y + ICON / 2 }
    case "below":
      return { left: slot.x + ICON / 2, top: slot.y + ICON + g }
    case "above":
      return { left: slot.x + ICON / 2, top: slot.y - g }
  }
}
