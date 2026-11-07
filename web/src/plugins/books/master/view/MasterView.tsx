// マスターのブックのビュー: タイトルだけの、紙の無い画面。見た目はテーマで描く
import { type BookViewProps, useMessages } from "../../../../plugin-api/ui"
import { kit } from "../kit"
import styles from "./MasterView.module.css"

export function MasterView(_: BookViewProps) {
  const t = useMessages(kit)
  return (
    <section className={styles.master} aria-label={t("Master")}>
      <h1 className={styles.title}>{t("Master")}</h1>
    </section>
  )
}
