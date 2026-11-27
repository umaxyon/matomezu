// 左の列のワークルーム/参加者の一覧。管理者の行は高く、頭に王冠。空室の行は空の丸と（空室）、準備中は鳥を薄くして（準備中）。
// 名前の下は、参加済みと空室ではスロット workroom-row-line に置かれたウィジェットが出す（今のタスクなど。空室かも渡す）。行を選ぶボタンは行の全体に敷き、
// その上に見た目を重ねる（スロットの物が自分のボタンを持てるように。見た目のうちボタンだけが押しを受け、ほかの所の押しは下の選ぶボタンへ通す）。
// 行のいちばん下に、参加者の会話の今のコンテキストの量を、行幅の細い棒と数（120k。k は千）で出す（利用者の設定の物差しの 9 割以上で赤。量が分からなければ出さない）。
// ワークルームの下に、ビジター（ワークルームを持たない、読むだけの参加者）の節を出す（いなければ節ごと出さない）。選ぶのは、選んでいる物（PICKED）の 1 つ
import { useState } from "react"
import { NO_STATE } from "../../plugin-api"
import { Slot, useMessages, usePluginState, useSetPluginState } from "../../plugin-api/ui"
import { NO_CONTEXT_USE, NO_OCCUPANT, visitorName, type WorkroomRow } from "../base"
import {
  Band,
  Panel,
  PendingBalloon,
  useContextGauge,
  useRowSlide,
  useVisitorRows,
  useWorkroomRows,
  VisitorIcon,
} from "../base/ui"
import { BIRD_SIZE, Bird } from "./Bird"
import { PARTICIPANT_KIND, PICKED, WORKROOM_KIND } from "./control-center"
import { kit } from "./kit"
import styles from "./ParticipantListView.module.css"
import { orderHeld, orderRows, type RowDetail, rowDetail } from "./rows"
import { WORKROOM_ROW_LINE } from "./slots"
import text from "./text.module.css"
import { useSettledOrder } from "./useSettledOrder"

export function ParticipantListView() {
  const t = useMessages(kit)
  // 組（管理者・作業中・空き・空室）ごとに、変化のあった順。行が途中の様子に入った直後は前の並びで待つ（useSettledOrder）。
  // 列に触れている間は、触れた時の並びで止める（押そうとした行が動かない）
  const ordered = useSettledOrder(orderRows(useWorkroomRows()))
  const [held, setHeld] = useState<readonly string[] | null>(null)
  const rows = held ? orderHeld(ordered, held) : ordered
  const hold = () => setHeld(h => h ?? ordered.map(r => r.room.id))
  const { register } = useRowSlide(rows.map(r => r.room.id))
  const picked = usePluginState(kit, PICKED)
  const setPicked = useSetPluginState(kit, PICKED)
  const visitors = useVisitorRows()
  const isPicked = (kind: string, id: string) => picked !== NO_STATE && picked.kind === kind && picked.id === id
  const detailText = (d: RowDetail) => (d === "preparing" ? t("(preparing)") : null)
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
              data-selected={isPicked(WORKROOM_KIND, row.room.id)}
              data-admin={row.admin}
              data-workroom={row.room.id}
            >
              <button
                type="button"
                className={styles.cover}
                aria-label={row.room.name}
                onClick={() => setPicked({ kind: WORKROOM_KIND, id: row.room.id })}
              />
              <div className={styles.face}>
                <span className={styles.lead}>
                  <Bird row={row} />
                </span>
                <span className={styles.who}>
                  <span className={styles.name}>{row.room.name}</span>
                  {row.participant === NO_OCCUPANT ? null : <PendingBalloon receiver={row.participant.id} />}
                  {detail ? <span className={styles.detail}>{detail}</span> : null}
                  {kind !== "preparing" ? (
                    <Slot
                      name={WORKROOM_ROW_LINE}
                      props={{ workroom: row.room.id, admin: row.admin, empty: kind === "empty" }}
                    />
                  ) : null}
                  <ContextGaugeView use={row.contextUse} />
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      {visitors.length > 0 ? (
        <>
          <h3 className={styles.section}>{t("Visitors")}</h3>
          <ul className={styles.rows}>
            {visitors.map(row => (
              <li
                key={row.participant.id}
                className={styles.row}
                data-selected={isPicked(PARTICIPANT_KIND, row.participant.id)}
                data-visitor={row.participant.id}
              >
                <button
                  type="button"
                  className={styles.pick}
                  onClick={() => setPicked({ kind: PARTICIPANT_KIND, id: row.participant.id })}
                >
                  <span className={styles.lead}>
                    <VisitorIcon size={BIRD_SIZE} />
                  </span>
                  <span className={styles.who}>
                    <span className={styles.name}>{visitorName(row.participant)}</span>
                    {row.state === "preparing" ? <span className={styles.detail}>{t("(preparing)")}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  )
}

// 会話の今のコンテキストの量の、行幅の細い棒と数（量が分からなければ何も出さない）。物差しは利用者の設定で選んだ物
function ContextGaugeView({ use }: { use: WorkroomRow["contextUse"] }) {
  const t = useMessages(kit)
  const gauge = useContextGauge(use)
  if (gauge === NO_CONTEXT_USE) return null
  return (
    <span className={styles.context} data-context-use data-near-full={gauge.nearFull}>
      <span className={styles.bar}>
        <span className={styles.fill} style={{ width: `${gauge.fill * 100}%` }} />
      </span>
      <span className={styles.amount}>{t("{n}k", { n: gauge.thousands })}</span>
    </span>
  )
}
