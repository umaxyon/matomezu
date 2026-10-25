// ページの線のビュー: 形より手前の層に、線（見える線・端の形・破線）とキャプションの札を描く（選んだ線はほかの線より手前）。道筋は drawLines（drawn.ts）が決めたものを描くだけ。
// 線を選べるのは選択の道具のときだけで、線の上（見える線より太い透明な当たり）を押すと線を選び、ダブルクリックで編集のダイアログ、右クリックで線のメニューを開く。
// ほかのときは、線はポインタを受けず、下の形と紙に届く。
// 1 本だけ選んでいる線（editing）には、両端をつまむ丸と、折れ線の途中の区間をつまむ透明な線を出す（区間は向きに合わせて左右か上下に動かす）。
// キャプションの札は選べるときに押せ、押すと線を選んでドラッグを始める。端が吸い付いた点（snap）には輪を出す
import type { MouseEvent, PointerEvent } from "react"
import type { Point } from "../../../plugin-api"
import type { DrawnLine } from "./drawn"
import styles from "./LinesView.module.css"

const pointsAttr = (pts: readonly Point[]) =>
  pts.map(({ x, y }) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`).join(" ")

interface Props {
  lines: readonly DrawnLine[]
  selection: readonly string[]
  selectable: boolean // 選択の道具で、置こうとしていないとき
  onPointerDown(e: PointerEvent<SVGGElement>, id: string): void
  onDoubleClick(id: string): void
  onContextMenu(e: MouseEvent<SVGGElement>, id: string): void
  editing: string | null // つまむ印を出す線
  snap: Point | null
  drag: {
    via(e: PointerEvent<Element>, id: string, index: number): void
    end(e: PointerEvent<Element>, id: string, end: "from" | "to"): void
    caption(e: PointerEvent<Element>, id: string): void
    move(e: PointerEvent<Element>): void
    up(e: PointerEvent<Element>): void
    cancel(e: PointerEvent<Element>): void
  }
}

export function LinesView({
  lines,
  selection,
  selectable,
  onPointerDown,
  onDoubleClick,
  onContextMenu,
  editing,
  snap,
  drag,
}: Props) {
  const follow = { onPointerMove: drag.move, onPointerUp: drag.up, onPointerCancel: drag.cancel }
  // 選んだ線は、ほかの線に隠れないよう手前（後ろの順）に描く
  const ordered = [...lines.filter(l => !selection.includes(l.id)), ...lines.filter(l => selection.includes(l.id))]
  return (
    <svg className={styles.lines} data-selectable={selectable} aria-hidden="true">
      {ordered.map(l => (
        // biome-ignore lint/a11y/noStaticElementInteractions: 線を選ぶのはポインタの操作で、キーの操作は選んだあとのコマンドが受ける
        <g
          key={l.id}
          data-item={l.id}
          className={styles.line}
          data-selected={selection.includes(l.id)}
          onPointerDown={e => onPointerDown(e, l.id)}
          onDoubleClick={() => onDoubleClick(l.id)}
          onContextMenu={e => onContextMenu(e, l.id)}
        >
          <polyline className={styles.stroke} data-dashed={l.dashed} points={pointsAttr(l.shown)} />
          {l.heads.fill && <path className={styles.fill} d={l.heads.fill} />}
          {l.heads.stroke && <path className={styles.headStroke} d={l.heads.stroke} />}
          <polyline className={styles.hit} points={pointsAttr(l.points)} />
          {l.caption && (
            <foreignObject
              className={styles.label}
              x={l.caption.box.x}
              y={l.caption.box.y}
              width={l.caption.box.w}
              height={l.caption.box.h}
            >
              <div className={styles.labelBox}>
                <span onPointerDown={e => drag.caption(e, l.id)} {...follow}>
                  {l.caption.text}
                </span>
              </div>
            </foreignObject>
          )}
          {editing === l.id &&
            l.segments.map(seg => {
              const p = l.points[seg.index + 1]
              const q = l.points[seg.index + 2]
              return (
                p &&
                q && (
                  <line
                    key={seg.index}
                    className={styles.bend}
                    data-axis={seg.axis}
                    x1={p.x}
                    y1={p.y}
                    x2={q.x}
                    y2={q.y}
                    onPointerDown={e => drag.via(e, l.id, seg.index)}
                    {...follow}
                  />
                )
              )
            })}
          {editing === l.id &&
            (["from", "to"] as const).map(end => {
              const { x, y } = (end === "from" ? l.points[0] : l.points[l.points.length - 1]) as Point
              return (
                <circle
                  key={end}
                  className={styles.end}
                  data-end={end}
                  cx={x}
                  cy={y}
                  r={5}
                  onPointerDown={e => drag.end(e, l.id, end)}
                  {...follow}
                />
              )
            })}
        </g>
      ))}
      {snap && <circle className={styles.snap} cx={snap.x} cy={snap.y} r={9} />}
    </svg>
  )
}
