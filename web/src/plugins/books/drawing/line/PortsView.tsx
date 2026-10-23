// 形から線を引く〇と、引いている間の、途中の線。〇は形の辺の真ん中の少し外に、画面の上で同じ大きさで出す（紙の倍率 --paper-zoom で打ち消す）。
// 途中の線は、引き始めた辺の真ん中からポインタまでの点線
import type { PointerEvent } from "react"
import type { Pt } from "./geom"
import styles from "./PortsView.module.css"
import type { Side } from "./route"

interface PortsProps {
  sides: readonly Side[] // 〇を出す辺
  active: boolean // 線を引いている間（出している〇は押した〇）
  onStart(e: PointerEvent<HTMLDivElement>, side: Side): void
  onPointerMove(e: PointerEvent<HTMLDivElement>): void
  onPointerUp(e: PointerEvent<HTMLDivElement>): void
  onPointerCancel(e: PointerEvent<HTMLDivElement>): void
}

export function Ports({ sides, active, onStart, ...handlers }: PortsProps) {
  return sides.map(side => (
    <div
      key={side}
      className={styles.port}
      data-port={side}
      data-on={active}
      onPointerDown={e => onStart(e, side)}
      {...handlers}
    />
  ))
}

export function LinkPreview({ from, to }: { from: Pt; to: Pt }) {
  return (
    <svg className={styles.preview} aria-hidden="true">
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />
    </svg>
  )
}
