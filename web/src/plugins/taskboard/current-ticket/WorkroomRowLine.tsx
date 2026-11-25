// 参加者の一覧の、参加済みと空室の行の名前の下: 頭に本を付けたカレントチケットの番号の行と、その下にチケットの名前。無ければ本を付けた「（空き）」、空室なら「（空室）」（当てられているだけのチケットは出さない）。
// 本は、そのワークルームのワーカーブック（カレントチケットの物。空きならワークルーム自身の物）。番号の行ごと押せて、クリックで「開く／分割で開く」、ダブルクリックで全画面で開く。
// ワーカーブックにページが無ければ、本を薄くして押せない（押しは下の、行を選ぶボタンへ通る）。
// カレントチケットがあれば、番号の行の右隣に照準を付ける（押すと、ワークルームの枠の［ボードで見る］と同じく、ボードでそのワークルームの鳥を出す。押せなければ薄くして、押しは下へ通る）
import { useMessages } from "../../../plugin-api/ui"
import { NO_WORKER_BOOK } from "../../base"
import { BookIcon, useBookOpenChoice, useWorkroomWorkerBook } from "../../base/ui"
import { useBoardVisit } from "../board/useBoardVisit"
import { TargetIcon } from "../icons"
import { kit } from "../kit"
import { ticketLabel } from "../ticket/label"
import { useCurrentTickets } from "./useCurrentTickets"
import styles from "./WorkroomColumns.module.css"

export function WorkroomRowLine({ workroom, empty }: { workroom: string; admin: boolean; empty: boolean }) {
  const t = useMessages(kit)
  const { current } = useCurrentTickets(workroom)
  const found = useWorkroomWorkerBook(workroom)
  const label = current ? ticketLabel(current.project.prefix, current.ticket.number) : t(empty ? "(empty)" : "(idle)")
  return (
    <>
      <span className={styles.numberRow}>
        {found !== NO_WORKER_BOOK && found.pages.length > 0 ? (
          <OpenableLine book={found.book} label={label} />
        ) : (
          <button type="button" className={styles.bookLine} data-current-line disabled>
            <LineFace label={label} />
          </button>
        )}
        {current ? <VisitMark workroom={workroom} ticket={current.ticket.id} project={current.project.id} /> : null}
      </span>
      {current ? <span className={styles.line}>{current.ticket.name}</span> : null}
    </>
  )
}

// 押せる番号の行（ページの在るワーカーブック book を開く）
function OpenableLine({ book, label }: { book: string; label: string }) {
  const choice = useBookOpenChoice({ book })
  return (
    <>
      <button type="button" className={styles.bookLine} data-current-line onClick={choice.onClick}>
        <LineFace label={label} />
      </button>
      {choice.bubble}
    </>
  )
}

// 照準（ボードで見る）
function VisitMark({ workroom, ticket, project }: { workroom: string; ticket: string; project: string }) {
  const t = useMessages(kit)
  const board = useBoardVisit(workroom, ticket, project)
  return (
    <button
      type="button"
      className={styles.visitMark}
      title={t("Show on the board")}
      aria-label={t("Show on the board")}
      data-visit-mark
      disabled={!board.can}
      onClick={board.visit}
    >
      <TargetIcon size={13} />
    </button>
  )
}

const LineFace = ({ label }: { label: string }) => (
  <>
    <span className={styles.bookIcon}>
      <BookIcon size={13} />
    </span>
    <span className={styles.line}>{label}</span>
  </>
)
