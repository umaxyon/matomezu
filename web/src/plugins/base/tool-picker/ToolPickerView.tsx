// 道具のアイコンのビュー（ウィジェット tool-picker）: 紙のあるステージで右ボタンを押し続けると、押している間はポインタの周りに輪が満ちていき、
// LONG_PRESS_MS で、そのステージの道具の組の道具のアイコンをポインタのすぐ近くに並べて出す（core/stage.ts の picker）。
// 押し続けている間に MOVE_SLOP より動いたら取り消す。長押しで出したら、右クリックのメニューは出さない。Space（コマンド tool-picker）でも開く。
// 出ている間は画面に薄い幕を掛けてほかの操作を止める。アイコンを押すとその道具にして閉じる。
// アイコンの外を押す・閉じるキー（menu-close。既定は Escape と Space）・並びから離れる・窓の大きさが変わる・窓から焦点が外れると、何もせずに閉じる。
// アイコンはポインタの位置から回りながら広がり、乗ると名前を出す。並びの外側の真ん中にはミニマップのボタンがあり、押すとアイコンを消して、
// その場所にミニマップ（base/minimap の MinimapView）と、その下に拡大縮小の帯（base/zoom の ZoomBar）を、ポインタと反対の側へ広げて出す（紙が収まっていても出す）。閉じ方はアイコンと同じで、
// 離れたかはミニマップの枠から測る（ボタンを押している間は、離れても閉じない。四角をドラッグするため）。押し続けの途中の様子・最後のポインタの位置・その場に出したミニマップの置き場所と枠だけはビューに持つ
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import type { ToolId } from "../../../core/catalog"
import type { Point, Rect } from "../../../core/geom"
import { paperOf } from "../../../core/stage"
import { toolDef, toolSetOf, toolsIn } from "../../../core/tools"
import { toolOf } from "../../../core/workspace"
import { suppressContextMenu } from "../../../ui/context-menu"
import { useMessages } from "../../../ui/i18n"
import { useActions, useCatalog, useMatomezuState, useUiCatalog } from "../../../ui/store-context"
import { kit } from "../kit"
import { MINIMAP } from "../minimap/icons"
import { MinimapView } from "../minimap/MinimapView"
import { ZoomBar } from "../zoom/ZoomBar"
import { TOOL_SET } from "."
import { ICON, leftBox, leftPicker, mapPlace, mapSlot, type PickerLayout, pickerSlots } from "./layout"
import styles from "./ToolPickerView.module.css"

export const LONG_PRESS_MS = 250 // 長押しの時間
const MOVE_SLOP = 5 // 長押しを取り消さない動きの遊び（px）
const RING_R = 14 // 押している間の輪の半径
const RING_SHOW = 120 // 輪を出し始めるまで（ふつうの右クリックで輪がちらつかないように）
const MAP_SIZE = 240 // その場に出すミニマップの、紙を収める大きさ（px）

// 右ボタンの押し続け
interface Press {
  stage: string
  start: Point
  at: Point
  timer: number
}

const typing = (el: Element | null) => !!el?.closest("input, textarea, select, [contenteditable]")
const stageEl = (id: string) => document.querySelector(`[data-stage="${CSS.escape(id)}"]`)

export function ToolPickerView() {
  const { openPicker, closeContextMenu } = useActions()
  const last = useRef<Point | null>(null)
  const press = useRef<Press | null>(null)
  const [ring, setRing] = useState<Point | null>(null)
  // 長押しで開けるステージ（紙があり、ダイアログも道具のアイコンも開いていない）。押したときに読むので ref に写す
  const pressable = useMatomezuState(
    useShallow(s =>
      s.dialog !== null || s.workspace.stages.some(st => st.picker !== null)
        ? []
        : s.workspace.stages.filter(st => paperOf(st) !== null).map(st => st.id),
    ),
  )
  const pressableRef = useRef(pressable)
  pressableRef.current = pressable

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
      }, LONG_PRESS_MS)
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
      {ring && <Ring at={ring} />}
      <Picker last={last} />
    </>
  )
}

// 押している間の輪（真上から満ちる）
function Ring({ at }: { at: Point }) {
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
          animationDuration: `${LONG_PRESS_MS - RING_SHOW}ms`,
        }}
      />
    </svg>
  )
}

// 開いている道具のアイコン。出す所は開いたときの値（無ければ最後のポインタの位置。ステージの外なら真ん中）
function Picker({ last }: { last: { current: Point | null } }) {
  const t = useMessages(kit)
  const opened = useMatomezuState(s => s.workspace.stages.find(st => st.picker !== null))
  const catalog = useCatalog().core
  const toolIcons = useUiCatalog().toolIcons
  const current = useMatomezuState(s => (opened ? toolOf(catalog, s.workspace, opened.id) : null))
  const set = opened ? toolSetOf(catalog, opened) : null
  const picks: readonly ToolId[] = set ? toolsIn(catalog, set) : []
  const { command, closePicker, showPickerMap } = useActions()
  const [hover, setHover] = useState<number | null>(null)
  const [mapBox, setMapBox] = useState<Rect | null>(null) // その場に出したミニマップの枠（置いてから決まる）
  if (!opened?.picker?.map && mapBox !== null) setMapBox(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const stage = opened?.id
  const asked = opened?.picker?.at ?? null
  const map = opened?.picker?.map ?? false
  // biome-ignore lint/correctness/useExhaustiveDependencies: 出す所と並べ方は、開いたときに 1 度だけ決める
  const placed = useMemo(() => {
    if (!stage) return null
    let at = asked
    if (!at) {
      const r = stageEl(stage)?.getBoundingClientRect()
      const p = last.current
      const inside = r && p && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
      at = inside ? p : r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 }
    }
    const layout = pickerSlots(at, picks.length, { w: window.innerWidth, h: window.innerHeight })
    const mapAt = mapSlot(layout, at)
    // 離れたかは、ミニマップのボタンも含めた並びで見る
    return { at, layout, mapAt, all: { ...layout, slots: [...layout.slots, mapAt] } }
  }, [stage])

  useEffect(() => {
    if (!placed) return
    const onMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return
      const p = { x: e.clientX, y: e.clientY }
      const left = map
        ? mapBox !== null && leftBox(mapBox, placed.layout.lay, placed.at, p)
        : leftPicker(placed.all, placed.at, p)
      if (left) closePicker()
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
  }, [placed, map, mapBox, closePicker])

  // ポインタの位置から、回りながら定位置へ広がる
  useLayoutEffect(() => {
    if (!placed) return
    buttons.current.forEach((el, i) => {
      const slot = placed.all.slots[i]
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
  }, [placed])

  if (!opened || !placed) return null
  const { layout } = placed
  const pick = (tool: ToolId) => {
    closePicker()
    if (tool !== current) command(opened.id, TOOL_SET.id, tool)
  }
  const tip = hover === null ? null : (placed.all.slots[hover] ?? null)
  const hovered = hover === null ? undefined : picks[hover]
  const tipName = hovered ? t(toolDef(catalog, hovered).title) : t("Minimap")
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
      onContextMenu={e => e.preventDefault()}
    >
      {map && <PickerMap stage={opened.id} at={placed.at} layout={placed.all} onPlaced={setMapBox} />}
      {!map &&
        picks.map((tool, i) => {
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
              style={{ left: slot.x, top: slot.y, width: ICON, height: ICON }}
              onClick={() => pick(tool)}
              onPointerMove={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              {toolIcons.get(tool)}
            </button>
          )
        })}
      {!map && (
        <button
          ref={el => {
            buttons.current[picks.length] = el
          }}
          type="button"
          className={styles.button}
          aria-label={t("Minimap")}
          style={{ left: placed.mapAt.x, top: placed.mapAt.y, width: ICON, height: ICON }}
          onClick={() => {
            setHover(null)
            showPickerMap(opened.id)
          }}
          onPointerMove={() => setHover(picks.length)}
          onPointerLeave={() => setHover(null)}
        >
          {MINIMAP}
        </button>
      )}
      {!map && tip && hover !== null && (
        <div className={styles.tip} data-lay={layout.lay} style={tipPlace(layout.lay, tip)}>
          {tipName}
        </div>
      )}
    </div>
  )
}

// 名前の位置: 横並びならアイコンの上（入らなければ下）、縦並びならポインタと反対の側
function tipPlace(lay: "row" | "left" | "right", slot: Point) {
  const g = 6
  if (lay === "left") return { left: slot.x - g, top: slot.y + ICON / 2 }
  if (lay === "right") return { left: slot.x + ICON + g, top: slot.y + ICON / 2 }
  const above = slot.y - g - 24 >= 6
  return { left: slot.x + ICON / 2, top: above ? slot.y - g : slot.y + ICON + g, ["--below" as string]: above ? 0 : 1 }
}

// その場に出すミニマップ: アイコンの並び layout があった所に、ポインタ at と反対の側へ広げて置く（layout.ts の mapPlace。大きさは描いてから測る）
// 置いた枠を onPlaced で知らせる
function PickerMap({
  stage,
  at,
  layout,
  onPlaced,
}: {
  stage: string
  at: Point
  layout: PickerLayout
  onPlaced: (box: Rect) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<CSSProperties>({ visibility: "hidden" })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const size = { w: el.offsetWidth, h: el.offsetHeight }
    const p = mapPlace(layout, at, size, { w: window.innerWidth, h: window.innerHeight })
    setPlace({ left: p.x, top: p.y })
    onPlaced({ ...p, ...size })
  }, [layout, at, onPlaced])
  return (
    <div ref={ref} className={styles.map} style={place} data-minimap="picker">
      <MinimapView stage={stage} width={MAP_SIZE} height={MAP_SIZE}>
        <ZoomBar stage={stage} />
      </MinimapView>
    </div>
  )
}
