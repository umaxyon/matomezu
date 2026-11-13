// コントロールセンターのプロジェクトの画面に置くタスクボード: 出しているプロジェクトのタスクボードを縦に並べる（1 枚ずつ、題の帯・歯車〈プロジェクト設定。直せないプロジェクトには出さない〉・最大化のボタン・レーンの横並び）。
// タスクボードの出入りは useBoardPhases の様子（phase）で動かす。タスクボードかレーンを最大化すると、ほかのタスクボードは畳み、枠にも最大化を知らせる（左と下を退かせる）
import { useState } from "react"
import { useAllowedOn, useMessages, usePluginState, useRecords, useUpdatePluginState } from "../../../plugin-api/ui"
import { IconButton, TitledArea, useControlCenterMaximize } from "../../base/ui"
import { GearIcon } from "../icons"
import { kit } from "../kit"
import { PROJECT } from "../project"
import { PROJECT_UPDATE } from "../project/actions"
import { useOpenProjectSettings } from "../project-settings/useOpenProjectSettings"
import scroll from "../scrollbar.module.css"
import { TICKET } from "../ticket"
import { MAXIMIZED } from "."
import { BoardLanes } from "./BoardLanes"
import { CardVisitView } from "./CardVisitView"
import { maximizedAmong, released, toggleBoard, toggleLane } from "./maximize"
import { orderedProjects, shownProjects, ticketsByLane } from "./shown"
import styles from "./TaskboardView.module.css"
import { useBoardPhases } from "./useBoardPhases"
import { useBoardSettings } from "./useBoardSettings"

export function TaskboardView() {
  const t = useMessages(kit)
  const projects = useRecords(PROJECT.id)
  const tickets = useRecords(TICKET.id)
  const workrooms = useRecords("@matomezu/base:workroom")
  const settings = useBoardSettings()
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const ordered = orderedProjects(projects, settings.order)
  const shownIds = shownProjects(ordered, settings.shown).map(p => p.id)
  const maximizedNow = usePluginState(kit, MAXIMIZED)
  const updateMaximized = useUpdatePluginState(kit, MAXIMIZED)
  const phases = useBoardPhases(shownIds, id => updateMaximized(now => released(now, id)))
  const maximized = maximizedAmong(maximizedNow, shownIds)
  useControlCenterMaximize(maximized !== undefined)
  const rendered = ordered.filter(p => p.id in phases)
  const openSettings = useOpenProjectSettings()

  if (ordered.length === 0) return <p className={styles.empty}>{t("No projects")}</p>
  return (
    <div ref={setRoot} className={`${styles.root} ${scroll.thin}`}>
      {rendered.map(project => {
        const phase = phases[project.id] ?? "idle"
        const hidden = maximized !== undefined && maximized.board !== project.id
        const byLane = ticketsByLane(tickets, project)
        const laneMax = maximized?.board === project.id ? maximized.lane : undefined
        return (
          <div
            key={project.id}
            className={styles.slot}
            data-state={hidden && phase === "idle" ? "hidden" : phase}
            data-board={project.id}
          >
            <TitledArea
              className={styles.board}
              title={project.name}
              actions={<SettingsGear project={project.id} onOpen={() => openSettings(project.id)} />}
              maximized={maximized?.board === project.id && laneMax === undefined}
              onToggleMaximize={() => updateMaximized(now => toggleBoard(now, project.id))}
            >
              <BoardLanes
                project={project}
                byLane={byLane}
                workrooms={workrooms}
                laneMax={laneMax}
                onToggleMaximize={lane => updateMaximized(now => toggleLane(now, project.id, lane))}
              />
            </TitledArea>
          </div>
        )
      })}
      <CardVisitView root={root} />
    </div>
  )
}

// プロジェクト設定を開く歯車（プロジェクトを直せないとき〈閉じたプロジェクトなど〉は出さない）
function SettingsGear({ project, onOpen }: { project: string; onOpen: () => void }) {
  const t = useMessages(kit)
  const allowed = useAllowedOn(PROJECT_UPDATE.id, {}, { record: project }).ok
  if (!allowed) return null
  return (
    <IconButton small label={t("Project settings")} onClick={onOpen}>
      <GearIcon />
    </IconButton>
  )
}
