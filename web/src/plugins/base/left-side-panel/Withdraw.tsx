// 一覧の行の「取消」（送信トレイと郵便箱が共に使う）: 押すと「取り消しますか？」の確かめに替わり、「取消」で onWithdraw、「やめる」で戻る。
// 行えないとき（allowed が false）は押せない。name は、読み上げで何を取り消すかを言う名前
import { useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import styles from "./PanelRows.module.css"

export function Withdraw({ name, allowed, onWithdraw }: { name: string; allowed: boolean; onWithdraw: () => void }) {
  const t = useMessages(kit)
  const [asking, setAsking] = useState(false)
  if (asking)
    return (
      // biome-ignore lint/a11y/useSemanticElements: 確かめの 2 つのボタンを束ねる箱で、入力Formのまとまり（fieldset）ではない
      <span className={styles.ask} role="group" aria-label={t("Withdraw?")}>
        <button
          type="button"
          className={styles.yes}
          onClick={() => {
            setAsking(false)
            onWithdraw()
          }}
        >
          {t("Withdraw")}
        </button>
        <button type="button" className={styles.withdraw} onClick={() => setAsking(false)}>
          {t("Keep")}
        </button>
      </span>
    )
  return (
    <button
      type="button"
      className={styles.withdraw}
      aria-label={t("Withdraw {name}", { name })}
      disabled={!allowed}
      onClick={() => setAsking(true)}
    >
      {t("Withdraw")}
    </button>
  )
}
