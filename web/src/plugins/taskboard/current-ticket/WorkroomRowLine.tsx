// 参加者の一覧の、参加済みの行の下の 1 行: そのワークルームの今のチケット（番号と名前）。宣言が無いか、チケットが無ければ「（空き）」
import { useMessages, useRecord } from "../../../plugin-api/ui"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { TICKET } from "../ticket"
import { ticketLabel } from "../ticket/label"
import { CURRENT, NO_TICKET } from "."
import styles from "./WorkroomColumns.module.css"

export function WorkroomRowLine({ workroom }: { workroom: string; admin: boolean }) {
  const t = useMessages(kit)
  const current = useRecord(CURRENT.id, workroom)
  const ticket = useRecord(TICKET.id, current && current.ticket !== NO_TICKET ? current.ticket : "-")
  const project = useRecord(PROJECT.id, ticket?.project ?? "-")
  return (
    <span className={styles.line} data-current-line>
      {ticket && project ? `${ticketLabel(project.prefix, ticket.number)} ${ticket.name}` : t("(idle)")}
    </span>
  )
}
