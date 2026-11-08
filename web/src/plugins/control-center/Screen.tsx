// コントロールセンターの画面: 題と、参加者リストの枠（中身は参加者を出す物が足す）
import { useId } from "react"
import { useMessages } from "../../plugin-api/ui"
import { kit } from "./kit"
import styles from "./Screen.module.css"

export function ControlCenterScreen() {
  const t = useMessages(kit)
  const heading = useId()
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>{t("Control center")}</h1>
      <section aria-labelledby={heading}>
        <h2 id={heading} className={styles.heading}>
          {t("Participants")}
        </h2>
        <div className={styles.participants} />
      </section>
    </div>
  )
}
