// ワークルームの枠の、情報の列の右に並べる 2 列: 今のチケット（プロジェクト・番号と名前・最新の履歴）と、そのチケットの履歴（新しい順）。中身が無ければ「なし」
import { useMessages, useRecords, useSetPluginState } from "../../../plugin-api/ui"
import { Elapsed } from "../../base/ui"
import { CARD_VISIT } from "../board"
import { orderedProjects, shownProjects } from "../board/shown"
import { useBoardSettings } from "../board/useBoardSettings"
import { canVisit } from "../board/visit"
import { TargetIcon } from "../icons"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { TICKET } from "../ticket"
import { ticketLabel } from "../ticket/label"
import { HISTORY, newestFirst } from "../ticket-history"
import { CURRENT } from "."
import { currentTaskOf } from "./task"
import styles from "./WorkroomColumns.module.css"

export function WorkroomColumns({ workroom }: { workroom: string }) {
  const t = useMessages(kit)
  const currents = useRecords(CURRENT.id, { where: [] })
  const tickets = useRecords(TICKET.id, { where: [] })
  const projects = useRecords(PROJECT.id, { where: [] })
  const entries = useRecords(HISTORY.id, { where: [] })
  const settings = useBoardSettings()
  const setVisit = useSetPluginState(kit, CARD_VISIT)
  const task = currentTaskOf(workroom, currents, tickets, projects, entries)
  const lines = task ? newestFirst(entries.filter(h => h.ticket === task.ticket.id)) : []
  return (
    <>
      <div className={styles.column} data-column="task">
        <span className={styles.heading}>{t("Current task")}</span>
        <div className={styles.scroll}>
          {task ? (
            <>
              <p className={styles.note}>
                {t("Project:")} {task.project.name}
              </p>
              <p className={styles.strong}>
                {ticketLabel(task.project.prefix, task.ticket.number)} {task.ticket.name}
              </p>
              <button
                type="button"
                className={styles.visit}
                disabled={
                  !canVisit(
                    shownProjects(orderedProjects(projects, settings.order), settings.shown).map(p => p.id),
                    task.project.id,
                    settings.canChange,
                  )
                }
                onClick={() => setVisit({ seq: Date.now(), ticket: task.ticket.id, workroom, phase: "seeking" })}
              >
                <TargetIcon />
                {t("Show on the board")}
              </button>
              {task.latest ? (
                <p className={styles.note}>
                  {t("Latest")}: {task.latest.text}
                </p>
              ) : null}
            </>
          ) : (
            <p className={styles.note}>{t("None")}</p>
          )}
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
