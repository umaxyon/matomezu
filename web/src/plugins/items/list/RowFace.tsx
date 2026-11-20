// リストの行のカードの中身（地・キャプション・線・本文）と、行のドラッグでポインタに付く行の写し
import type { CSSProperties } from "react"
import { RichText } from "../../base/ui"
import styles from "./ListView.module.css"
import type { ListRow } from "./list"
import type { GhostLook } from "./row-drag"
import type { RowLayout } from "./size"

// 行のカードの地と、キャプション・線・本文（チェックの印は除く）
export function RowFace({ row, look }: { row: ListRow; look: RowLayout | undefined }) {
  return (
    <>
      <div className={styles.cardShadow}>
        <div className={styles.card} />
      </div>
      <div className={styles.text}>
        <div className={styles.caption} data-align={row.props.captionAlign}>
          {row.props.caption}
        </div>
        {look?.rule && <hr className={styles.rule} />}
        {look && look.body.length > 0 && (
          <div data-align={row.props.bodyAlign} style={{ width: look.width }}>
            {look.body.map((line, n) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 行は折り返した順の並びで、並べ替えない
              <div key={n} className={styles.line}>
                <RichText line={line} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ポインタに付く行の写し: つかんだ所がポインタの下に来るように、行と同じ大きさ・倍率で描く。チェックの印は押せない飾り
export function Ghost(p: {
  row: ListRow
  look: GhostLook
  x: number
  y: number
  checklist: boolean
  lines: RowLayout | undefined
  done: boolean
}) {
  const { look } = p
  const { "--row-fill": fill, ...vars } = look.vars
  return (
    <div
      className={styles.ghost}
      style={
        {
          ...vars,
          left: p.x - look.grab.x,
          top: p.y - look.grab.y,
          width: look.w,
          height: look.h,
          transform: `scale(${look.scale})`,
        } as CSSProperties
      }
    >
      <div
        className={styles.row}
        data-done={p.done}
        style={{ height: look.h, ...(fill ? { "--row-fill": fill } : {}) } as CSSProperties}
      >
        {p.checklist && (
          <input
            type="checkbox"
            className={styles.check}
            checked={p.row.props.checked === true}
            readOnly
            tabIndex={-1}
          />
        )}
        <RowFace row={p.row} look={p.lines} />
      </div>
    </div>
  )
}
