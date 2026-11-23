// コントロールセンターの画面: 左の列（利用者パネル・ワークルーム/参加者の一覧）と、コンテンツエリア（プロジェクト・書庫の画面を重ねて、出す方を替える）。
// 左の列の利用者パネルと参加者の一覧の間には スロット side、参加者の一覧の下にはスロット below-participants（選んでいる物を渡す）、プロジェクトの画面の上のタスクボードの置き場にはスロット projects に置かれたウィジェットが入る（タスクボードなど）。
// プロジェクトの画面は上にタスクボードの置き場、下にワークルーム。書庫は最大化できる。最大化の間（書庫の最大化と、中身が名乗った最大化）は、枠が出ていく（retreatOf）。
// コンテンツエリアに出す画面は、このスクリーンの値として画面の場所に入る（CONTENT_AREA。値が無ければプロジェクト）。選んでいる物（ワークルーム・ビジター・ほかの種類のどれか 1 つ）も画面の場所に入る（PICKED。履歴には積まない）。書庫の最大化は、このスクリーンの中だけ
import { useState } from "react"
import { NO_RECORD, NO_STATE } from "../../plugin-api"
import {
  NO_KIND,
  NO_KIND_VIEW,
  Slot,
  useKindView,
  usePluginState,
  useRecord,
  useSetPluginState,
} from "../../plugin-api/ui"
import { Panel, useControlCenterMaximized, useVisitorRows, useWorkroomRows } from "../base/ui"
import {
  CONTENT_AREA,
  type ContentArea,
  LIBRARY_MAXIMIZED,
  PARTICIPANT_KIND,
  PICKED,
  type Picked,
  WORKROOM_KIND,
} from "./control-center"
import { kit } from "./kit"
import { LibraryArea } from "./LibraryArea"
import { ParticipantListView } from "./ParticipantListView"
import { pickedRow, retreatOf } from "./rows"
import styles from "./Screen.module.css"
import { ScreenPane } from "./ScreenPane"
import { BELOW_PARTICIPANTS, PICKED_DETAIL, PROJECTS, SIDE } from "./slots"
import { UserPanel } from "./UserPanel"
import { WorkroomView } from "./WorkroomView"

export function ControlCenterScreen() {
  const screen = usePluginState(kit, CONTENT_AREA)
  const setContentArea = useSetPluginState(kit, CONTENT_AREA)
  const setScreen = (to: ContentArea) => setContentArea(to)
  const maximized = usePluginState(kit, LIBRARY_MAXIMIZED) === true
  const retreat = retreatOf(screen, maximized, useControlCenterMaximized())
  const setLibraryMaximized = useSetPluginState(kit, LIBRARY_MAXIMIZED)
  const setMaximized = (on: boolean) => setLibraryMaximized(on)
  const chosen = usePluginState(kit, PICKED)
  const rows = useWorkroomRows()
  const visitors = useVisitorRows()
  const pickedOf = (kind: string) => (chosen !== NO_STATE && chosen.kind === kind ? chosen.id : NO_STATE)
  const picked = pickedRow(rows, pickedOf(WORKROOM_KIND))
  const visitor = visitors.find(v => v.participant.id === pickedOf(PARTICIPANT_KIND))
  const detail = useOtherPicked(chosen)
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
          <Slot name={BELOW_PARTICIPANTS} props={{ picked: chosen }} />
        </div>
        <div className={styles.content} data-max={retreat.left}>
          <ScreenPane shown={screen === "projects"} slideIn={switched}>
            <div className={styles.projectScreen}>
              <Panel recess className={styles.boards} data-max={retreat.workroom} data-boards-area>
                <Slot name={PROJECTS} props={{}} />
              </Panel>
              <WorkroomView row={picked} visitor={visitor} detail={detail} hidden={retreat.workroom} />
            </div>
          </ScreenPane>
          <ScreenPane shown={screen === "library"} slideIn={switched}>
            <LibraryArea maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} />
          </ScreenPane>
        </div>
      </div>
    </div>
  )
}

// ワークルーム・ビジターのほかの種類を選んでいれば、その物。そのレコードが在り、その種類を名乗るウィジェットがスロット picked-detail に在るときだけ（無ければ選んでいないのと同じ）
function useOtherPicked(chosen: Picked | typeof NO_STATE): Picked | undefined {
  const other =
    chosen !== NO_STATE && chosen.kind !== WORKROOM_KIND && chosen.kind !== PARTICIPANT_KIND ? chosen : undefined
  // 種類が無いときも、フックを同じ順で呼ぶため、在る種類（ワークルーム）を空の id で問う
  const record = useRecord((other?.kind ?? WORKROOM_KIND) as Parameters<typeof useRecord>[0], other?.id ?? "")
  const view = useKindView(PICKED_DETAIL, other ? other.kind : NO_KIND)
  return other && record !== NO_RECORD && view !== NO_KIND_VIEW ? other : undefined
}
