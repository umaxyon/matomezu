// コントロールセンターの画面: 左の列（利用者パネル・ワークルーム/参加者の一覧）と、右の領域（プロジェクト・書庫の画面を重ねて、前に出す方を替える）。
// 左の列の利用者パネルと参加者の一覧の間には base のスロット control-center-side、プロジェクトの画面の上のタスクボードの置き場には control-center-projects に置かれたウィジェットが入る（タスクボードなど）。
// プロジェクトの画面は上にタスクボードの置き場、下にワークルーム。書庫は最大化できる。最大化の間（書庫の最大化と、中身が名乗った最大化）は、枠が出ていく（retreatOf）。
// 前に出す画面は、このスクリーンの値として画面の場所に入る（FRONT_SCREEN。値が無ければプロジェクト）。選んだワークルームと書庫の最大化は、このスクリーンの中だけ
import { useState } from "react"
import { Slot, usePluginState, useSetPluginState } from "../../plugin-api/ui"
import {
  CONTROL_CENTER_PROJECTS,
  CONTROL_CENTER_SIDE,
  Panel,
  useControlCenterMaximized,
  useWorkroomRows,
} from "../base/ui"
import { FRONT_SCREEN, type FrontScreen, frontScreenOf, LIBRARY_MAXIMIZED, PICKED_ROOM } from "./control-center"
import { kit } from "./kit"
import { LibraryScreen } from "./LibraryScreen"
import { ParticipantListView } from "./ParticipantListView"
import { pickedRow, retreatOf } from "./rows"
import styles from "./Screen.module.css"
import { ScreenPane } from "./ScreenPane"
import { UserPanel } from "./UserPanel"
import { WorkroomView } from "./WorkroomView"

export function ControlCenterScreen() {
  const screen = frontScreenOf(usePluginState(kit, FRONT_SCREEN))
  const setFront = useSetPluginState(kit, FRONT_SCREEN)
  const setScreen = (to: FrontScreen) => setFront(to)
  const maximized = usePluginState(kit, LIBRARY_MAXIMIZED) === true
  const retreat = retreatOf(screen, maximized, useControlCenterMaximized())
  const setLibraryMaximized = useSetPluginState(kit, LIBRARY_MAXIMIZED)
  const setMaximized = (on: boolean) => setLibraryMaximized(on)
  const picked = pickedRow(useWorkroomRows(), usePluginState(kit, PICKED_ROOM))
  // 最初の表示では滑り込ませず、画面を替えたあとから滑り込ませる
  const [switched, setSwitched] = useState(false)
  const show = (to: FrontScreen) => {
    if (to === screen) return
    setSwitched(true)
    setScreen(to)
  }
  return (
    <div className={styles.screen}>
      <div className={styles.layout}>
        <div className={styles.left} data-max={retreat.left} aria-hidden={retreat.left} inert={retreat.left}>
          <UserPanel screen={screen} onShow={show} />
          <Slot name={CONTROL_CENTER_SIDE} props={{}} />
          <ParticipantListView />
        </div>
        <div className={styles.stage} data-max={retreat.left}>
          <ScreenPane front={screen === "projects"} slideIn={switched}>
            <div className={styles.projectScreen}>
              <Panel recess className={styles.boards} data-max={retreat.workroom} data-boards-area>
                <Slot name={CONTROL_CENTER_PROJECTS} props={{}} />
              </Panel>
              <WorkroomView row={picked} hidden={retreat.workroom} />
            </div>
          </ScreenPane>
          <ScreenPane front={screen === "library"} slideIn={switched}>
            <LibraryScreen maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} />
          </ScreenPane>
        </div>
      </div>
    </div>
  )
}
