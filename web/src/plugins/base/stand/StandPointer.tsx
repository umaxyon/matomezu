// マークポインタ: edgePinned のスタンドのアンカーの上の辺が見える所の外にある間（useStandAway）、スタンドの中の点 center を真ん中に描いていた
// 大きさ size の丸を、縁に寄せて出すボタン。押すと付けた物を見せる（onPress を渡せば、その代わりに onPress）。外に出ていなければ何も出さない（伝言で使う）
import type { MouseEvent, ReactNode } from "react"
import type { Point } from "../../../core/geom"
import { NOT_AWAY, useStandAway } from "./anchors"
import { STAND_MARGIN } from "./stand-place"

export function StandPointer({
  center,
  size,
  label,
  className,
  onPress,
  children,
}: {
  center: Point
  size: number
  label: string // 押すと何をするか（「〇〇を見せる」など）
  className?: string
  onPress?: (e: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  const away = useStandAway()
  if (away === NOT_AWAY) return null
  const at = away.pin(center, size / 2 + STAND_MARGIN)
  return (
    <div
      data-away="true"
      style={{ transform: `translate(${(at.x - size / 2).toString()}px, ${(at.y - size / 2).toString()}px)` }}
    >
      <button
        type="button"
        className={className}
        aria-label={label}
        title={label}
        onClick={onPress ?? away.show}
        data-mark-pointer
      >
        {children}
      </button>
    </div>
  )
}
