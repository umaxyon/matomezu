// チケットタグのバッヂ（カード・ワークルームの現在のタスク・履歴）: タグの色の役割（外観枠の代表色）で塗り、上の字は代表色の ink。タグなし・無いタグは出さない
import type { TagRecord } from "./board"
import styles from "./TagBadge.module.css"

export function TagBadge({ tag }: { tag: TagRecord | undefined }) {
  if (!tag) return null
  return (
    <span
      className={styles.badge}
      style={{ background: `var(--skin-palette-${tag.color})`, color: `var(--skin-palette-${tag.color}-ink)` }}
    >
      {tag.name}
    </span>
  )
}
