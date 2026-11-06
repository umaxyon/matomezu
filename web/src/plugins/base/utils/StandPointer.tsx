// マークポインタ: edgePinned のスタンドのアンカーの上の辺が見える所の外にある間（useStandAway）、スタンドの中の点 center を真ん中に描いていた
// 大きさ size の丸を、縁に寄せて出すボタン。押すと付けた物を見せる。外に出ていなければ何も出さない（マークのびっくりマーク・伝言で使う）
import type { ReactNode } from "react"
import type { Point } from "../../../core/geom"
import { useStandAway } from "./anchors"
import { STAND_MARGIN } from "./stand-place"

export function StandPointer({
  center,
  size,
  label,
  className,
  children,
}: {
  center: Point
  size: number
  label: string // 押すと見せる物の名前（「〇〇を見せる」）
  className?: string
  children: ReactNode
}) {
  const away = useStandAway()
  if (!away) return null
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
        onClick={away.show}
        data-mark-pointer
      >
        {children}
      </button>
    </div>
  )
}
