// チケットタグのバッヂ（チケットカード・チケットスクリーン）: タグの色の役割（外観枠の代表色）で塗り、上の字は代表色の ink。
// onRemove を渡すと、名前の右に外すボタン（×）を出す
import { CloseIcon } from "../icons"
import type { TagRecord } from "./shown"
import styles from "./TagBadge.module.css"

export function TagBadge({
  tag,
  removeLabel,
  onRemove,
}: {
  tag: TagRecord
  removeLabel?: string
  onRemove?: () => void
}) {
  return (
    <span
      className={styles.badge}
      data-tag={tag.id}
      style={{ background: `var(--skin-palette-${tag.color})`, color: `var(--skin-palette-${tag.color}-ink)` }}
    >
      {tag.name}
      {onRemove ? (
        <button type="button" className={styles.remove} aria-label={removeLabel} title={removeLabel} onClick={onRemove}>
          <CloseIcon />
        </button>
      ) : null}
    </span>
  )
}
