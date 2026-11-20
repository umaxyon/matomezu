// 参加者の一覧の、参加済みの行の下の 1 行: そのワークルームの今のチケット（更新の新しい 1 枚の番号と名前。2 枚以上なら「ほか N 件」を添える）。無ければ「（空き）」
import { useMessages } from "../../../plugin-api/ui"
import { kit } from "../kit"
import { ticketLabel } from "../ticket/label"
import { useCurrentTickets } from "./useCurrentTickets"
import styles from "./WorkroomColumns.module.css"

export function WorkroomRowLine({ workroom }: { workroom: string; admin: boolean }) {
  const t = useMessages(kit)
  const [first, ...rest] = useCurrentTickets(workroom)
  return (
    <span className={styles.line} data-current-line>
      {first
        ? `${ticketLabel(first.project.prefix, first.ticket.number)} ${first.ticket.name}${
            rest.length > 0 ? ` ${t("and {count} more", { count: rest.length })}` : ""
          }`
        : t("(idle)")}
    </span>
  )
}
