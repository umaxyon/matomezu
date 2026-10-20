// マスターのブックのビュー: ブックの一覧や設定などを集める、紙の無いただの画面。見た目はテーマで描く
import type { Stage } from "../../core/stage"
import { useT } from "../i18n"
import styles from "./MasterView.module.css"

export function MasterView(_: { stage: Stage }) {
  const t = useT()
  return (
    <section className={styles.master} aria-label={t("マスター")}>
      <h1 className={styles.title}>{t("マスター")}</h1>
    </section>
  )
}
