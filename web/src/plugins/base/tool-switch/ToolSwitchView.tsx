// 道具の切り替えのボタン（ウィジェット tool-switch）: ステージの道具の組の 3 つの道具を輪に並べ、今の道具を手前に大きく、残りの 2 つを左右の奥に小さく薄く、少し下げて控えさせる。
// 右が次（押すと来る）、左が前。道具が変わると、輪を近い向きへ 1 つ分回して入れ替える。押すとコマンド tool.next を呼ぶ
import { useEffect, useRef } from "react"
import { TOOL_SETS, type Tool, toolSetOf } from "../../../core/tools"
import { toolOf } from "../../../core/workspace"
import { useCommand } from "../../../ui/commands"
import { useT } from "../../../ui/i18n"
import { useApp, useRegistry } from "../../../ui/store-context"
import { TOOL_ICONS, TOOL_NAMES } from "./icons"
import styles from "./ToolSwitchView.module.css"

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

// 手前から見た角度を -180〜180 に収める
const angle = (icon: number, front: number) => (((((icon - front) * 120 + 180) % 360) + 360) % 360) - 180

export function ToolSwitchView({ stage }: { stage: string }) {
  const t = useT()
  const next = useCommand(stage, "tool.next")
  const registry = useRegistry()
  const tool = useApp(s => toolOf(registry, s.workspace, stage)) ?? "select"
  const set = useApp(s => {
    const st = s.workspace.stages.find(x => x.id === stage)
    return st ? toolSetOf(registry, st) : null
  })
  const order: readonly Tool[] = set ? TOOL_SETS[set] : []
  const icons = useRef<(HTMLSpanElement | null)[]>([])
  const shown = useRef<Tool>(tool)

  useEffect(() => {
    const from = order.indexOf(shown.current)
    const to = order.indexOf(tool)
    shown.current = tool
    if (from === to) return
    const step = to === (from + 1) % order.length ? 1 : -1 // 次なら右から、前なら左から
    icons.current.forEach((el, i) => {
      if (!el || typeof el.animate !== "function") return
      const a0 = angle(i, from)
      const frames = Array.from({ length: 7 }, (_, k) => {
        const { zIndex, ...rest } = look(a0 - (step * 120 * k) / 6)
        return { ...rest, zIndex: String(zIndex) }
      })
      el.animate(frames, { duration: TURN_MS, easing: "cubic-bezier(0.3, 0.7, 0.3, 1)" })
    })
  }, [tool, order])

  if (!next.shown) return null
  const name = t(TOOL_NAMES[tool])
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
          style={look(angle(i, order.indexOf(tool)))}
        >
          {TOOL_ICONS[id]}
        </span>
      ))}
    </button>
  )
}
