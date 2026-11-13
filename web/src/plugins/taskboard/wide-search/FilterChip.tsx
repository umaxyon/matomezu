// チケットモードの選びのボタン: チケットタグのバッヂ（board/TagBadge）と同じ大きさの小さなボタン。入っている間は縁取りで強調し、外れている間は薄くする。
// color を渡すと、その色の役割（タグの色）で塗る。渡さなければ skin のボタンの色
import type { TagRecord } from "../board/shown"
import styles from "./FilterChip.module.css"

export function FilterChip({
  pressed,
  color,
  onClick,
  children,
}: {
  pressed: boolean
  color?: TagRecord["color"]
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={pressed}
      data-colored={color !== undefined || undefined}
      style={
        color ? { background: `var(--skin-palette-${color})`, color: `var(--skin-palette-${color}-ink)` } : undefined
      }
      onClick={onClick}
    >
      {children}
    </button>
  )
}
