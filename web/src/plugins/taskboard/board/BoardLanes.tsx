// タスクボード 1 枚のレーンの横並び。レーンのタイトル帯をドラッグすると、レーンを左右に入れ替える（プロジェクトのレーンの並びを書き換える。直せないプロジェクトと、レーンを最大化している間は動かせない）
import { Slot, useActions, useAllowedOn } from "../../../plugin-api/ui"
import type { Project } from "../project"
import { PROJECT_UPDATE } from "../project/actions"
import { useGripDrag } from "../reorder/useGripDrag"
import type { Ticket } from "../ticket"
import { LaneView } from "./LaneView"
import { laneKeyOf, movedLanes } from "./lane-order"
import { lanesOf, type WorkroomRecord } from "./shown"
import { PLUGIN_FRAMES } from "./slots"
import styles from "./TaskboardView.module.css"

export function BoardLanes({
  project,
  byLane,
  workrooms,
  laneMax,
  onToggleMaximize,
}: {
  project: Project
  byLane: Readonly<Record<string, Ticket[]>>
  workrooms: readonly WorkroomRecord[]
  laneMax: string | undefined // 最大化しているレーンの id
  onToggleMaximize: (lane: string) => void
}) {
  const actions = useActions()
  const canMove = useAllowedOn(PROJECT_UPDATE.id, {}, { record: project.id }).ok && laneMax === undefined
  const lanes = lanesOf(project)
  const { dragRowProps, gripProps, markClass } = useGripDrag(
    (dragging, over) => {
      actions.perform(PROJECT_UPDATE.id, { lanes: movedLanes(project.lanes, dragging, over) }, { record: project.id })
    },
    project.lanes.map(laneKeyOf),
    "x",
  )
  return (
    <div className={styles.lanes} data-lane-max={laneMax !== undefined}>
      {lanes.map(lane => (
        <LaneView
          key={lane.id}
          project={project}
          lane={lane}
          tickets={byLane[lane.id] ?? []}
          workrooms={workrooms}
          maximized={laneMax === lane.id}
          folded={laneMax !== undefined && laneMax !== lane.id}
          onToggleMaximize={() => onToggleMaximize(lane.id)}
          drag={canMove ? { rowProps: dragRowProps(lane.id), gripProps: gripProps(lane.id), markClass } : undefined}
        />
      ))}
      <Slot name={PLUGIN_FRAMES} props={{ project: project.id }} />
    </div>
  )
}
