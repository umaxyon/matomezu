// 参加者リスト: 受け入れた参加者（joined）を受け入れた順に並べる。1 行は、鳥の絵（配色を反映）・ワークルーム名・AI 名とモデルと環境・生きているか。
// 生きているのは、最後に呼ばれてから参加の有効時間（利用者の設定）以内。保留中の参加要求は出さない（郵便で扱う）
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { isAlive } from "./alive"
import { BirdFaceView } from "./BirdFaceView"
import { asBird } from "./birds"
import { useAliveChoice, useNowMs, useParticipantCalls, useParticipants } from "./hooks"
import styles from "./Participant.module.css"

export function ParticipantList() {
  const t = useMessages(kit)
  const joined = useParticipants().filter(p => p.state === "joined")
  const calls = useParticipantCalls()
  const choice = useAliveChoice()
  const nowMs = useNowMs()
  if (joined.length === 0) return <p className={styles.empty}>{t("No participants")}</p>
  return (
    <ul className={styles.list}>
      {joined.map(p => {
        const bird = asBird(p.bird)
        const alive = isAlive(calls[p.id], nowMs, choice)
        return (
          <li key={p.id} className={styles.row} data-participant={p.id}>
            {bird && <BirdFaceView bird={bird} {...(p.palette ? { palette: p.palette } : {})} size={32} />}
            <span className={styles.name}>{p.workroom}</span>
            <span className={styles.detail}>{[p.ai, p.model, p.env].join(" / ")}</span>
            <span className={styles.state} data-alive={alive}>
              {alive ? t("Alive") : t("Quiet")}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
