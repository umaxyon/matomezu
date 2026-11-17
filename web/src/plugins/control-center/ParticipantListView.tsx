// 左の列のワークルーム/参加者の一覧。管理者の行は高く、頭に王冠。空室の行は空の丸と（空室）、準備中は鳥を薄くして（準備中）。
// 下の 1 行は、参加済みではスロット workroom-row-line に置かれたウィジェットが出す（今のタスクなど）
import { useState } from "react"
import { Slot, useMessages, usePluginState, useSetPluginState } from "../../plugin-api/ui"
import { Band, Panel, useWorkroomRows } from "../base/ui"
import { Bird } from "./Bird"
import { PICKED_ROOM } from "./control-center"
import { kit } from "./kit"
import styles from "./ParticipantListView.module.css"
import { orderHeld, orderRows, type RowDetail, rowDetail } from "./rows"
import { WORKROOM_ROW_LINE } from "./slots"
import text from "./text.module.css"
import { useRowSlide } from "./useRowSlide"
import { useSettledOrder } from "./useSettledOrder"

export function ParticipantListView() {
  const t = useMessages(kit)
  // 組（管理者・作業中・空き・空室）ごとに、変化のあった順。行が途中の様子に入った直後は前の並びで待つ（useSettledOrder）。
  // 列に触れている間は、触れた時の並びで止める（押そうとした行が動かない）
  const ordered = useSettledOrder(orderRows(useWorkroomRows()))
  const [held, setHeld] = useState<readonly string[] | null>(null)
  const rows = held ? orderHeld(ordered, held) : ordered
  const hold = () => setHeld(h => h ?? ordered.map(r => r.room.id))
  const register = useRowSlide(rows.map(r => r.room.id))
  const picked = usePluginState(kit, PICKED_ROOM)
  const setPicked = useSetPluginState(kit, PICKED_ROOM)
  const pick = (room: string | undefined) => setPicked(room)
  const detailText = (d: RowDetail) => (d === "empty" ? t("(empty)") : d === "preparing" ? t("(preparing)") : null)
  return (
    <Panel className={styles.list}>
      <Band>
        <h2 className={text.heading}>{t("Workrooms")}</h2>
      </Band>
      {rows.length === 0 ? <p className={text.note}>{t("No workrooms")}</p> : null}
      <ul className={styles.rows} onPointerEnter={hold} onPointerLeave={() => setHeld(null)}>
        {rows.map(row => {
          const kind = rowDetail(row)
          const detail = detailText(kind)
          return (
            <li
              key={row.room.id}
              ref={register(row.room.id)}
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
