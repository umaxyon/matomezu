// 参加者リスト: 受け入れた参加者（joined）を受け入れた順に並べる。1 行は、鳥の絵（配色を反映）・ワークルーム名・AI 名とモデルと環境・生きているか。
// 準備中は、受け入れたあと AI のフックが参加を伝えるまで（常駐が知らせる）。生きているのは、準備中でなく、最後に呼ばれてから参加の有効時間（利用者の設定）以内。保留中の参加要求は出さない（郵便で扱う）
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { BirdFaceView } from "./BirdFaceView"
import { asBird } from "./birds"
import { useIsAlive, useNowMs, useParticipantCalls, useParticipantReady, useParticipants } from "./hooks"
import styles from "./Participant.module.css"

export function ParticipantList() {
  const t = useMessages(kit)
  const joined = useParticipants().filter(p => p.state === "joined")
  const calls = useParticipantCalls()
  const ready = useParticipantReady()
  const isAlive = useIsAlive()
  const nowMs = useNowMs()
  if (joined.length === 0) return <p className={styles.empty}>{t("No participants")}</p>
  return (
    <ul className={styles.list}>
      {joined.map(p => {
        const bird = asBird(p.bird)
        const state = !ready.includes(p.id) ? "preparing" : isAlive(calls[p.id], nowMs) ? "alive" : "quiet"
        return (
          <li key={p.id} className={styles.row} data-participant={p.id}>
            {bird && <BirdFaceView bird={bird} {...(p.palette ? { palette: p.palette } : {})} size={32} />}
            <span className={styles.name}>{p.workroom}</span>
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
