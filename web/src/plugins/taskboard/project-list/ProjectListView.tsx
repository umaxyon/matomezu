// コントロールセンターの左の列に置くプロジェクトの一覧: 見出しを押して開閉（最初は閉じている）。行ごとに、左のつまみのドラッグで並べ替え・タスクボードを出すチェック・名前。
// 並びと出しているタスクボードは利用者の設定。変えさせない設定のときは、つまみもチェックも押せない
import { useMessages, usePluginState, useRecords, useUpdatePluginState } from "../../../plugin-api/ui"
import { Band, Panel, useRowSlide } from "../../base/ui"
import { orderedProjects, shownProjects } from "../board/shown"
import { useBoardSettings } from "../board/useBoardSettings"
import { ChevronIcon } from "../icons"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { Grip } from "../reorder/Grip"
import { moved } from "../reorder/order"
import { useGripDrag } from "../reorder/useGripDrag"
import { LIST_OPEN } from "."
import styles from "./ProjectListView.module.css"

export function ProjectListView() {
  const t = useMessages(kit)
  const open = usePluginState(kit, LIST_OPEN)
  const updateOpen = useUpdatePluginState(kit, LIST_OPEN)
  const projects = useRecords(PROJECT.id, { where: [] })
  const settings = useBoardSettings()
  const ordered = orderedProjects(projects, settings.order)
  const ids = ordered.map(p => p.id)
  const shown = shownProjects(ordered, settings.shown).map(p => p.id)
  const { register, snapshot } = useRowSlide(ids, { from: "snapshot" })
  const { dragRowProps, gripProps, markClass } = useGripDrag((dragging, over) => {
    if (!settings.canChange) return
    snapshot()
    settings.setOrder(moved(ids, dragging, over), settings.shown === undefined ? shown : undefined)
  }, ids)
  const toggle = (id: string) => {
    if (!settings.canChange) return
    settings.setShown(shown.includes(id) ? shown.filter(s => s !== id) : [...shown, id])
  }
  return (
    <Panel className={styles.accordion}>
      <Band>
        <button type="button" className={styles.head} aria-expanded={open} onClick={() => updateOpen(now => !now)}>
          <span className={styles.chevron}>
            <ChevronIcon />
          </span>
          {t("Projects")}
        </button>
      </Band>
      <div className={styles.body} data-open={open}>
        <div className={styles.inner}>
          {ordered.length === 0 ? (
            <p className={styles.note}>{t("No projects")}</p>
          ) : (
            <ul className={styles.list}>
              {ordered.map(project => (
                <li
                  key={project.id}
                  ref={register(project.id)}
                  className={`${styles.row} ${markClass}`}
                  data-project={project.id}
                  {...(settings.canChange ? dragRowProps(project.id) : {})}
                >
                  {settings.canChange ? <Grip {...gripProps(project.id)} /> : null}
                  <input
                    type="checkbox"
                    aria-label={project.name}
                    checked={shown.includes(project.id)}
                    disabled={!settings.canChange}
                    onChange={() => toggle(project.id)}
                  />
                  <span className={styles.name}>{project.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  )
}
