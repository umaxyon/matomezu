// 参加者の一覧の、参加済みの行の下の 1 行: そのワークルームのカレントチケットの番号と名前。無ければ「（空き）」（当てられているだけのチケットは出さない）
import { useMessages } from "../../../plugin-api/ui"
import { kit } from "../kit"
import { ticketLabel } from "../ticket/label"
import { useCurrentTickets } from "./useCurrentTickets"
import styles from "./WorkroomColumns.module.css"

export function WorkroomRowLine({ workroom }: { workroom: string; admin: boolean }) {
  const t = useMessages(kit)
  const { current } = useCurrentTickets(workroom)
  return (
    <span className={styles.line} data-current-line>
      {current ? `${ticketLabel(current.project.prefix, current.ticket.number)} ${current.ticket.name}` : t("(idle)")}
    </span>
  )
}
