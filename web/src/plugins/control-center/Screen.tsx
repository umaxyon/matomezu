// コントロールセンターの画面: 左の列（利用者パネル・ワークルーム/参加者の一覧）と、コンテンツエリア（プロジェクト・書庫の画面を重ねて、出す方を替える）。
// 左の列の利用者パネルと参加者の一覧の間には スロット side、プロジェクトの画面の上のタスクボードの置き場にはスロット projects に置かれたウィジェットが入る（タスクボードなど）。
// プロジェクトの画面は上にタスクボードの置き場、下にワークルーム。書庫は最大化できる。最大化の間（書庫の最大化と、中身が名乗った最大化）は、枠が出ていく（retreatOf）。
// コンテンツエリアに出す画面は、このスクリーンの値として画面の場所に入る（CONTENT_AREA。値が無ければプロジェクト）。選んだワークルームと書庫の最大化は、このスクリーンの中だけ
import { useState } from "react"
import { Slot, usePluginState, useSetPluginState } from "../../plugin-api/ui"
import { Panel, useControlCenterMaximized, useVisitorRows, useWorkroomRows } from "../base/ui"
import {
  CONTENT_AREA,
  type ContentArea,
  contentAreaOf,
  LIBRARY_MAXIMIZED,
  PICKED_ROOM,
  PICKED_VISITOR,
} from "./control-center"
import { kit } from "./kit"
import { LibraryArea } from "./LibraryArea"
import { ParticipantListView } from "./ParticipantListView"
import { pickedRow, retreatOf } from "./rows"
import styles from "./Screen.module.css"
import { ScreenPane } from "./ScreenPane"
import { PROJECTS, SIDE } from "./slots"
import { UserPanel } from "./UserPanel"
import { WorkroomView } from "./WorkroomView"

export function ControlCenterScreen() {
  const screen = contentAreaOf(usePluginState(kit, CONTENT_AREA))
  const setContentArea = useSetPluginState(kit, CONTENT_AREA)
  const setScreen = (to: ContentArea) => setContentArea(to)
  const maximized = usePluginState(kit, LIBRARY_MAXIMIZED) === true
  const retreat = retreatOf(screen, maximized, useControlCenterMaximized())
  const setLibraryMaximized = useSetPluginState(kit, LIBRARY_MAXIMIZED)
  const setMaximized = (on: boolean) => setLibraryMaximized(on)
  const picked = pickedRow(useWorkroomRows(), usePluginState(kit, PICKED_ROOM))
  const pickedVisitorId = usePluginState(kit, PICKED_VISITOR)
  const visitor = useVisitorRows().find(v => v.participant.id === pickedVisitorId)
  // 最初の表示では滑り込ませず、画面を替えたあとから滑り込ませる
  const [switched, setSwitched] = useState(false)
  const show = (to: ContentArea) => {
    if (to === screen) return
    setSwitched(true)
    setScreen(to)
  }
  return (
    <div className={styles.screen}>
      <div className={styles.layout}>
        <div className={styles.left} data-max={retreat.left} aria-hidden={retreat.left} inert={retreat.left}>
          <UserPanel screen={screen} onShow={show} />
          <Slot name={SIDE} props={{}} />
          <ParticipantListView />
        </div>
        <div className={styles.stage} data-max={retreat.left}>
          <ScreenPane front={screen === "projects"} slideIn={switched}>
            <div className={styles.projectScreen}>
              <Panel recess className={styles.boards} data-max={retreat.workroom} data-boards-area>
                <Slot name={PROJECTS} props={{}} />
              </Panel>
              <WorkroomView row={picked} visitor={visitor} hidden={retreat.workroom} />
            </div>
          </ScreenPane>
          <ScreenPane front={screen === "library"} slideIn={switched}>
            <LibraryArea maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} />
          </ScreenPane>
        </div>
      </div>
    </div>
  )
}
