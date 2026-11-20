// ワークルームの枠の、情報の列の右に並べる 2 列: 今のチケット（更新の新しい順に全部。プロジェクト・番号と名前・最新の履歴）と、それらのチケット履歴（混ぜて新しい順。
// 2 枚以上なら行の頭にチケットの番号）。中身が無ければ「なし」
import { Fragment } from "react"
import { useMessages, useRecords, useSetPluginState } from "../../../plugin-api/ui"
import { Elapsed } from "../../base/ui"
import { CARD_VISIT } from "../board"
import { orderedProjects, shownProjects } from "../board/shown"
import { useBoardSettings } from "../board/useBoardSettings"
import { canVisit } from "../board/visit"
import { TargetIcon } from "../icons"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { ticketLabel } from "../ticket/label"
import { HISTORY, newestFirst } from "../ticket-history"
import { useCurrentTickets } from "./useCurrentTickets"
import styles from "./WorkroomColumns.module.css"

export function WorkroomColumns({ workroom }: { workroom: string }) {
  const t = useMessages(kit)
  const currents = useCurrentTickets(workroom)
  const projects = useRecords(PROJECT.id, { where: [] })
  const entries = useRecords(HISTORY.id, { where: [] })
  const settings = useBoardSettings()
  const setVisit = useSetPluginState(kit, CARD_VISIT)
  const shown = shownProjects(orderedProjects(projects, settings.order), settings.shown).map(p => p.id)
  const labels = new Map(currents.map(c => [c.ticket.id, ticketLabel(c.project.prefix, c.ticket.number)]))
  const lines = newestFirst(entries.filter(h => labels.has(h.ticket)))
  return (
    <>
      <div className={styles.column} data-column="task">
        <span className={styles.heading}>{t("Current task")}</span>
        <div className={styles.scroll}>
          {currents.length === 0 ? (
            <p className={styles.note}>{t("None")}</p>
          ) : (
            currents.map(({ ticket, project }, i) => {
              const latest = newestFirst(entries.filter(h => h.ticket === ticket.id))[0]
              return (
                <Fragment key={ticket.id}>
                  {i > 0 ? <hr className={styles.split} /> : null}
                  <p className={styles.note}>
                    {t("Project:")} {project.name}
                  </p>
                  <p className={styles.strong}>
                    {labels.get(ticket.id)} {ticket.name}
                  </p>
                  <button
                    type="button"
                    className={styles.visit}
                    disabled={!canVisit(shown, project.id, settings.canChange)}
                    onClick={() => setVisit({ seq: Date.now(), ticket: ticket.id, workroom, phase: "seeking" })}
                  >
                    <TargetIcon />
                    {t("Show on the board")}
                  </button>
                  {latest ? (
                    <p className={styles.note}>
                      {t("Latest")}: {latest.text}
                    </p>
                  ) : null}
                </Fragment>
              )
            })
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
                  {currents.length > 1 ? <span className={styles.label}>{labels.get(h.ticket)}</span> : null}
                  {currents.length > 1 ? " " : null}
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
