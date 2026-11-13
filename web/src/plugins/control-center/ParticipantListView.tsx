// 左の列のワークルーム/参加者の一覧。管理者の行は高く、頭に王冠。空室の行は空の丸と（空室）、準備中は鳥を薄くして（準備中）。
// 下の 1 行は、参加済みでは base のスロット（workroom-row-line）に置かれたウィジェットが出す（今のタスクなど）
import { Slot, useMessages, usePluginState, useScreen, useSetPluginState } from "../../plugin-api/ui"
import { Band, Panel, useWorkroomRows, WORKROOM_ROW_LINE } from "../base/ui"
import { Bird } from "./Bird"
import { CONTROL_CENTER_SCREEN, PICKED_ROOM } from "./control-center"
import { kit } from "./kit"
import styles from "./ParticipantListView.module.css"
import { type RowDetail, rowDetail } from "./rows"
import text from "./text.module.css"

export function ParticipantListView() {
  const t = useMessages(kit)
  const rows = useWorkroomRows()
  const me = useScreen(CONTROL_CENTER_SCREEN).id
  const picked = usePluginState(kit, PICKED_ROOM, me)
  const setPicked = useSetPluginState(kit, PICKED_ROOM)
  const pick = (room: string | undefined) => setPicked(me, room)
  const detailText = (d: RowDetail) => (d === "empty" ? t("(empty)") : d === "preparing" ? t("(preparing)") : null)
  return (
    <Panel className={styles.list}>
      <Band>
        <h2 className={text.heading}>{t("Workrooms")}</h2>
      </Band>
      {rows.length === 0 ? <p className={text.note}>{t("No workrooms")}</p> : null}
      <ul className={styles.rows}>
        {rows.map(row => {
          const kind = rowDetail(row)
          const detail = detailText(kind)
          return (
            <li
              key={row.room.id}
              className={styles.row}
              data-selected={picked === row.room.id}
              data-admin={row.admin}
              data-workroom={row.room.id}
            >
              <button type="button" className={styles.pick} onClick={() => pick(row.room.id)}>
                <span className={styles.lead}>
                  <Bird row={row} />
                </span>
                <span className={styles.who}>
                  <span className={styles.name}>{row.room.name}</span>
                  {detail ? <span className={styles.detail}>{detail}</span> : null}
                  {kind === "slot" ? (
                    <Slot name={WORKROOM_ROW_LINE} props={{ workroom: row.room.id, admin: row.admin }} />
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
