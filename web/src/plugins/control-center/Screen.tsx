// コントロールセンターの画面: 左の列（利用者パネル・ワークルーム/参加者の一覧）と、右の領域（プロジェクト・書庫の画面を重ねて、前に出す方を替える）。
// コントロールセンターの画面: 左の列（利用者パネル・ワークルーム/参加者の一覧）と、右の領域（プロジェクト・書庫の画面を重ねて、前に出す方を替える）。
// 左の列の利用者パネルと参加者の一覧の間には base のスロット control-center-side、プロジェクトの画面の上のタスクボードの置き場には control-center-projects に置かれたウィジェットが入る（タスクボードなど）。
// プロジェクトの画面は上にタスクボードの置き場、下にワークルーム。書庫は最大化できる。最大化の間（書庫の最大化と、中身が名乗った最大化）は、枠が出ていく（retreatOf）。
// スクリーン（チケットスクリーンなど）は、この画面の全体に重ねて出す（ScreenOverlay）。前に出す画面は画面の場所に入る（FRONT_SCREEN。値が無ければプロジェクト）。選んだワークルームと書庫の最大化は窓の中だけ
import { useState } from "react"
import { Slot, usePluginState, useScreen, useSetPluginState } from "../../plugin-api/ui"
import {
  CONTROL_CENTER_PROJECTS,
  CONTROL_CENTER_SIDE,
  Panel,
  ScreenOverlay,
  useControlCenterMaximized,
  useOpenedScreen,
  useWorkroomRows,
} from "../base/ui"
import {
  CONTROL_CENTER_SCREEN,
  FRONT_SCREEN,
  type FrontScreen,
  frontScreenOf,
  LIBRARY_MAXIMIZED,
  PICKED_ROOM,
} from "./control-center"
import { kit } from "./kit"
import { LibraryScreen } from "./LibraryScreen"
import { ParticipantListView } from "./ParticipantListView"
import { pickedRow, retreatOf } from "./rows"
import styles from "./Screen.module.css"
import { ScreenPane } from "./ScreenPane"
import { UserPanel } from "./UserPanel"
import { WorkroomView } from "./WorkroomView"

export function ControlCenterScreen() {
  const me = useScreen(CONTROL_CENTER_SCREEN).id
  const screen = frontScreenOf(usePluginState(kit, FRONT_SCREEN, me))
  const setFront = useSetPluginState(kit, FRONT_SCREEN)
  const setScreen = (to: FrontScreen) => setFront(me, to)
  const maximized = usePluginState(kit, LIBRARY_MAXIMIZED, me) === true
  const retreat = retreatOf(screen, maximized, useControlCenterMaximized())
  const setLibraryMaximized = useSetPluginState(kit, LIBRARY_MAXIMIZED)
  const setMaximized = (on: boolean) => setLibraryMaximized(me, on)
  // スクリーンが開いている間は、下の画面を操作も読み上げも受けないようにする
  const covered = useOpenedScreen() !== "none"
  const picked = pickedRow(useWorkroomRows(), usePluginState(kit, PICKED_ROOM, me))
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
        <div
          className={styles.left}
          data-max={retreat.left}
          aria-hidden={retreat.left || covered}
          inert={retreat.left || covered}
        >
          <UserPanel screen={screen} onShow={show} />
          <Slot name={CONTROL_CENTER_SIDE} props={{}} />
          <ParticipantListView />
        </div>
        <div className={styles.stage} data-max={retreat.left} aria-hidden={covered} inert={covered}>
          <ScreenPane front={screen === "projects"} slideIn={switched}>
            <div className={styles.projectScreen}>
              <Panel recess className={styles.boards}>
                <Slot name={CONTROL_CENTER_PROJECTS} props={{}} />
              </Panel>
              <WorkroomView row={picked} hidden={retreat.workroom} />
            </div>
          </ScreenPane>
          <ScreenPane front={screen === "library"} slideIn={switched}>
            <LibraryScreen maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} />
          </ScreenPane>
        </div>
        <ScreenOverlay />
      </div>
    </div>
  )
}
