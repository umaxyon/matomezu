// 参加者の一覧の、参加済みの行の下の 1 行: そのワークルームの今のチケット（番号と名前）。宣言が無いか、チケットが無ければ「（空き）」。
// 判定は作業の様子（workroomActivity）と同じ currentPairOf
import { useMessages, useRecord } from "../../../plugin-api/ui"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { TICKET } from "../ticket"
import { ticketLabel } from "../ticket/label"
import { CURRENT, currentPairOf, NO_TICKET } from "."
import styles from "./WorkroomColumns.module.css"

export function WorkroomRowLine({ workroom }: { workroom: string; admin: boolean }) {
  const t = useMessages(kit)
  const current = useRecord(CURRENT.id, workroom)
  const ticket = useRecord(TICKET.id, current && current.ticket !== NO_TICKET ? current.ticket : "-")
  const project = useRecord(PROJECT.id, ticket?.project ?? "-")
  const read: Record<string, unknown> = { [CURRENT.id]: current, [TICKET.id]: ticket, [PROJECT.id]: project }
  const pair = currentPairOf(workroom, (subject, id) => {
    const record = read[subject] as { id: string } | undefined
    return record?.id === id ? record : "none"
  })
  return (
    <span className={styles.line} data-current-line>
      {pair === "none" ? t("(idle)") : `${ticketLabel(pair.project.prefix, pair.ticket.number)} ${pair.ticket.name}`}
    </span>
  )
}
