// コントロールセンターの画面: 左の列（利用者パネル・ワークルーム/参加者の一覧）と、右の領域（プロジェクト・書庫の画面を重ねて、前に出す方を替える）。
// プロジェクトの画面は上にボードの置き場（ボードを置く領域）、下にワークルーム。書庫は最大化できる（最大化の間、左の列は出ていく）。
// 前に出す画面は画面の場所に入る（FRONT_SCREEN。値が無ければプロジェクト）。選んだワークルームと書庫の最大化は窓の中だけ
import { useState } from "react"
import { usePluginState, useSetPluginState } from "../../plugin-api/ui"
import { Panel, useWorkroomRows } from "../base/ui"
import { FRONT_SCREEN, type FrontScreen, frontScreenOf, LIBRARY_MAXIMIZED, PICKED_ROOM } from "./control-center"
import { kit } from "./kit"
import { LibraryScreen } from "./LibraryScreen"
import { ParticipantListView } from "./ParticipantListView"
import { pickedRow } from "./rows"
import styles from "./Screen.module.css"
import { ScreenPane } from "./ScreenPane"
import { UserPanel } from "./UserPanel"
import { WorkroomView } from "./WorkroomView"

export function ControlCenterScreen() {
  const screen = frontScreenOf(usePluginState(kit, FRONT_SCREEN))
  const setScreen = useSetPluginState(kit, FRONT_SCREEN)
  const maximized = usePluginState(kit, LIBRARY_MAXIMIZED) === true
  const setMaximized = useSetPluginState(kit, LIBRARY_MAXIMIZED)
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
        <div className={styles.left} data-max={maximized} aria-hidden={maximized} inert={maximized}>
          <UserPanel screen={screen} onShow={show} />
          <ParticipantListView />
        </div>
        <div className={styles.stage} data-max={maximized}>
          <ScreenPane front={screen === "projects"} slideIn={switched}>
            <div className={styles.projectScreen}>
              <Panel recess className={styles.boards} />
              <WorkroomView row={picked} />
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
