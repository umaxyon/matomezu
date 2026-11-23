// 参加者の一覧の、参加済みの行の名前の下: 頭に本を付けたカレントチケットの番号の行と、その下にチケットの名前。無ければ本を付けた「（空き）」（当てられているだけのチケットは出さない）。
// 本は、そのワークルームのワーカーブック（カレントチケットの物。空きならワークルーム自身の物）。番号の行ごと押せて、クリックで「開く／分割で開く」、ダブルクリックで全画面で開く。
// ワーカーブックにページが無ければ、本を薄くして押せない（押しは下の、行を選ぶボタンへ通る）
import { useMessages } from "../../../plugin-api/ui"
import { NO_WORKER_BOOK } from "../../base"
import { BookIcon, useBookOpenChoice, useWorkroomWorkerBook } from "../../base/ui"
import { kit } from "../kit"
import { ticketLabel } from "../ticket/label"
import { useCurrentTickets } from "./useCurrentTickets"
import styles from "./WorkroomColumns.module.css"

export function WorkroomRowLine({ workroom }: { workroom: string; admin: boolean }) {
  const t = useMessages(kit)
  const { current } = useCurrentTickets(workroom)
  const found = useWorkroomWorkerBook(workroom)
  const book = found === NO_WORKER_BOOK ? undefined : found.book
  const openable = found !== NO_WORKER_BOOK && found.pages.length > 0
  const choice = useBookOpenChoice({ book: book ?? "" })
  return (
    <>
      <button type="button" className={styles.bookLine} data-current-line disabled={!openable} onClick={choice.onClick}>
        <span className={styles.bookIcon}>
          <BookIcon size={13} />
        </span>
        <span className={styles.line}>
          {current ? ticketLabel(current.project.prefix, current.ticket.number) : t("(idle)")}
        </span>
      </button>
      {current ? <span className={styles.line}>{current.ticket.name}</span> : null}
      {choice.bubble}
    </>
  )
}
