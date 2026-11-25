// ワークルームの枠の、情報の列の右に並べる 2 列: 現在のタスク（カレントチケットのプロジェクト・番号と名前・最新の履歴。線の下に、当てられているだけのチケットを薄い文字で 1 行ずつ）と、
// カレントチケットの履歴（新しい順）。中身が無ければ「なし」
import { useMessages, useRecords } from "../../../plugin-api/ui"
import { Elapsed } from "../../base/ui"
import { useBoardVisit } from "../board/useBoardVisit"
import { TargetIcon } from "../icons"
import { kit } from "../kit"
import { ticketLabel } from "../ticket/label"
import { HISTORY, newestFirst } from "../ticket-history"
import { useCurrentTickets } from "./useCurrentTickets"
import styles from "./WorkroomColumns.module.css"

export function WorkroomColumns({ workroom }: { workroom: string }) {
  const t = useMessages(kit)
  const { current, assigned } = useCurrentTickets(workroom)
  const entries = useRecords(HISTORY.id, { where: [] })
  const lines = current ? newestFirst(entries.filter(h => h.ticket === current.ticket.id)) : []
  const latest = lines[0]
  return (
    <>
      <div className={styles.column} data-column="task">
        <span className={styles.heading}>{t("Current task")}</span>
        <div className={styles.scroll}>
          {current ? (
            <>
              <p className={styles.note}>
                {t("Project:")} {current.project.name}
              </p>
              <p className={styles.strong}>
                {ticketLabel(current.project.prefix, current.ticket.number)} {current.ticket.name}
              </p>
              <VisitButton workroom={workroom} ticket={current.ticket.id} project={current.project.id} />
              {latest ? (
                <p className={styles.note}>
                  {t("Latest")}: {latest.text}
                </p>
              ) : null}
            </>
          ) : (
            <p className={styles.note}>{t("None")}</p>
          )}
          {assigned.length > 0 ? (
            <div data-assigned>
              <hr className={styles.split} />
              <p className={styles.note}>{t("Assigned")}</p>
              {assigned.map(({ ticket, project }) => (
                <p key={ticket.id} className={styles.assigned}>
                  {ticketLabel(project.prefix, ticket.number)} {ticket.name}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.column} data-column="history">
        <span className={styles.heading}>{t("History")}</span>
        <div className={styles.scroll}>
          {lines.length === 0 ? (
            <p className={styles.note}>{t("None")}</p>
          ) : (
            <ul className={styles.history}>
              {lines.map(h => (
                <li key={h.id}>
                  <span className={styles.when}>
                    <Elapsed at={h.at} />
                  </span>{" "}
                  {h.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}

// ［ボードで見る］
function VisitButton({ workroom, ticket, project }: { workroom: string; ticket: string; project: string }) {
  const t = useMessages(kit)
  const board = useBoardVisit(workroom, ticket, project)
  return (
    <button type="button" className={styles.visit} disabled={!board.can} onClick={board.visit}>
      <TargetIcon />
      {t("Show on the board")}
    </button>
  )
}
