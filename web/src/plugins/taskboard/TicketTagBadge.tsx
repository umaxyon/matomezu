// チケットタグのバッヂ: タグの色の役割で塗り、その上の字の色（スキンの情報色の ink）で書く
import styles from "./TicketTagBadge.module.css"

export function TicketTagBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className={styles.badge}
      style={{ background: `var(--skin-palette-${color})`, color: `var(--skin-palette-${color}-ink)` }}
    >
      {name}
    </span>
  )
}
