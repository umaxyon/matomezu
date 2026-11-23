// 道具の切り替えのボタン（ウィジェット tool-switch）: ステージの道具の組の道具を輪に並べ、今の道具を手前に大きく、残りを奥に小さく薄く、少し下げて控えさせる
// （3 つなら左右の奥に）。
// 右が次（押すと来る）、左が前。道具が変わると、輪を近い向きへ 1 つ分回して入れ替える。押すとコマンド tool-next を呼ぶ

import { useEffect, useRef } from "react"
import type { ToolId } from "../../../core/catalog"
import { NO_STAGE } from "../../../core/stage"
import { NO_TOOL, toolDef, toolSetOf, toolsIn } from "../../../core/tools"
import { workspaceOf } from "../../../core/window"
import { useCommand } from "../../../ui/commands"
import { useMessages } from "../../../ui/i18n"
import { useStageHere } from "../../../ui/scope"
import { useCatalog, useUiCatalog } from "../../../ui/store-context"
import { useStage } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { TOOL_NEXT } from "."
import styles from "./ToolSwitchView.module.css"
import { unusableTools } from "./tools"

// 左右の控え（手前から 120 度）が、真ん中から 20px 横・4px 下になる輪の半径と、真後ろで下げる量（px）
const R = 20 / Math.sin(Math.PI / 3)
const DROP = 4 / 0.75
const TURN_MS = 260

// 角度（手前が 0、右回りに正）での見え方。奥ほど小さく薄く、少し下がって後ろに回る
function look(deg: number) {
  const a = (deg * Math.PI) / 180
  const front = (1 + Math.cos(a)) / 2 // 手前 1、真後ろ 0
  return {
    transform: `translate(${(R * Math.sin(a)).toFixed(2)}px, ${(DROP * (1 - front)).toFixed(2)}px) scale(${(0.6 + 0.4 * front).toFixed(3)})`,
    opacity: Number((0.22 + 0.78 * front ** 2).toFixed(3)),
    zIndex: Math.round(1 + 9 * front),
  }
}

// 手前から見た角度を -180〜180 に収める（道具が count 個なら、隣どうしは 360 / count 度）
const angle = (icon: number, front: number, count: number) =>
  (((((icon - front) * (360 / count) + 180) % 360) + 360) % 360) - 180

export function ToolSwitchView() {
  const t = useMessages(kit)
  const next = useCommand(TOOL_NEXT.id)
  const catalog = useCatalog().core
  const toolIcons = useUiCatalog().toolIcons
  const set = useStageHere(st => (st ? toolSetOf(catalog, st) : null))
  const order: readonly ToolId[] = set ? toolsIn(catalog, set) : []
  const stage = useStage()
  const now = stage === NO_STAGE ? NO_TOOL : stage.tool
  const tool = now !== NO_TOOL ? now : (order[0] ?? null)
  // 使えない道具（斜めの線を引く）。並びを文字で比べて、変わったときだけ描き直す
  const unusable = useStageHere((st, s) =>
    st ? unusableTools(catalog, workspaceOf(s.window, st.id), st.id, s).join("\n") : "",
  ).split("\n")
  const icons = useRef<(HTMLSpanElement | null)[]>([])
  const shown = useRef<ToolId | null>(tool)

  useEffect(() => {
    const from = shown.current === null ? -1 : order.indexOf(shown.current)
    const to = tool === null ? -1 : order.indexOf(tool)
    shown.current = tool
    if (from === to) return
    const step = to === (from + 1) % order.length ? 1 : -1 // 次なら右から、前なら左から
    icons.current.forEach((el, i) => {
      if (!el || typeof el.animate !== "function") return
      const a0 = angle(i, from, order.length)
      const frames = Array.from({ length: 7 }, (_, k) => {
        const { zIndex, ...rest } = look(a0 - (step * (360 / order.length) * k) / 6)
        return { ...rest, zIndex: String(zIndex) }
      })
      el.animate(frames, { duration: TURN_MS, easing: "cubic-bezier(0.3, 0.7, 0.3, 1)" })
    })
  }, [tool, order])

  if (!next.shown || !tool) return null
  const name = t(toolDef(catalog, tool).title)
  return (
    <button
      type="button"
      className={styles.wheel}
      aria-label={name}
      title={name}
      data-tool={tool}
      disabled={!next.enabled}
      onClick={() => next.run()}
    >
      {order.map((id, i) => (
        <span
          key={id}
          ref={el => {
            icons.current[i] = el
          }}
          className={styles.icon}
          data-unusable={unusable.includes(id)}
          style={look(angle(i, order.indexOf(tool), order.length))}
        >
          {toolIcons.get(id)}
        </span>
      ))}
    </button>
  )
}
