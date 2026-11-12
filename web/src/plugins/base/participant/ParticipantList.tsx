// 参加者リスト: 受け入れた参加者（joined）を受け入れた順に並べる。1 行は、鳥の絵（部屋の配色を反映）・ワークルーム名・AI 名とモデルと環境
// 準備中は、受け入れたあと AI のフックが参加を伝えるまで（常駐が知らせる）。生きているのは、準備中でなく、最後に呼ばれてから参加の有効時間以内
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { BirdFaceView } from "./BirdFaceView"
import { asBird } from "./birds"
import { useIsAlive, useNowMs, useParticipantCalls, useParticipantReady, useParticipants, useWorkrooms } from "./hooks"
import styles from "./Participant.module.css"

export function ParticipantList() {
  const t = useMessages(kit)
  const joined = useParticipants().filter(p => p.state === "joined")
  const rooms = useWorkrooms()
  const calls = useParticipantCalls()
  const ready = useParticipantReady()
  const isAlive = useIsAlive()
  const nowMs = useNowMs()
  if (joined.length === 0) return <p className={styles.empty}>{t("No participants")}</p>
  return (
    <ul className={styles.list}>
      {joined.map(p => {
        const room = rooms.find(r => r.id === p.workroom)
        const bird = asBird(room?.bird)
        const state = !ready.includes(p.id) ? "preparing" : isAlive(calls[p.id], nowMs) ? "alive" : "quiet"
        return (
          <li key={p.id} className={styles.row} data-participant={p.id}>
            {bird && <BirdFaceView bird={bird} {...(room?.palette ? { palette: room.palette } : {})} size={32} />}
            <span className={styles.name}>{room?.name}</span>
            <span className={styles.detail}>{[p.ai, p.model, p.env].join(" / ")}</span>
            <span className={styles.state} data-state={state}>
              {state === "preparing" ? t("Preparing") : state === "alive" ? t("Alive") : t("Quiet")}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
