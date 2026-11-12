// コントロールセンターのプロジェクトの画面に置くタスクボード: 出しているプロジェクトのタスクボードを縦に並べる（1 枚ずつ、題の帯・最大化のボタン・レーンの横並び）。
// タスクボードの出入りは useBoardPhases の様子（phase）で動かす。タスクボードかレーンを最大化すると、ほかのタスクボードは畳み、枠にも最大化を知らせる（左と下を退かせる）
import { useMessages, usePluginState, useRecords, useUpdatePluginState } from "../../plugin-api/ui"
import { TitledArea, useControlCenterMaximize } from "../base/ui"
import { lanesOf, orderedProjects, shownProjects, ticketsByLane } from "./board"
import { kit } from "./kit"
import { LaneView } from "./LaneView"
import { maximizedAmong, released, toggleBoard, toggleLane } from "./maximize"
import { PROJECT } from "./project"
import { MAXIMIZED } from "./states"
import styles from "./TaskboardView.module.css"
import { TICKET } from "./ticket"
import { useBoardPhases } from "./useBoardPhases"
import { useBoardSettings } from "./useBoardSettings"

export function TaskboardView() {
  const t = useMessages(kit)
  const projects = useRecords(PROJECT.id)
  const tickets = useRecords(TICKET.id)
  const workrooms = useRecords("@matomezu/base:workroom")
  const settings = useBoardSettings()
  const ordered = orderedProjects(projects, settings.order)
  const shownIds = shownProjects(ordered, settings.shown).map(p => p.id)
  const maximizedNow = usePluginState(kit, MAXIMIZED)
  const updateMaximized = useUpdatePluginState(kit, MAXIMIZED)
  const phases = useBoardPhases(shownIds, id => updateMaximized(now => released(now, id)))
  const maximized = maximizedAmong(maximizedNow, shownIds)
  useControlCenterMaximize(maximized !== undefined)
  const rendered = ordered.filter(p => p.id in phases)

  if (ordered.length === 0) return <p className={styles.empty}>{t("No projects")}</p>
  return (
    <div className={styles.root}>
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
              maximized={maximized?.board === project.id && laneMax === undefined}
              onToggleMaximize={() => updateMaximized(now => toggleBoard(now, project.id))}
            >
              <div className={styles.lanes} data-lane-max={laneMax !== undefined}>
                {lanesOf(project).map(lane => (
                  <LaneView
                    key={lane.id}
                    project={project}
                    lane={lane}
                    tickets={byLane[lane.id] ?? []}
                    workrooms={workrooms}
                    maximized={laneMax === lane.id}
                    folded={laneMax !== undefined && laneMax !== lane.id}
                    onToggleMaximize={() => updateMaximized(now => toggleLane(now, project.id, lane.id))}
                  />
                ))}
              </div>
            </TitledArea>
          </div>
        )
      })}
    </div>
  )
}
