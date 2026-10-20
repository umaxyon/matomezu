// マスターのブックのビュー: ブックの一覧や設定などを集める、紙の無いただの画面
import { useT } from "../i18n"
import styles from "./MasterView.module.css"

export function MasterView() {
  const t = useT()
  return (
    <section className={styles.master} aria-label={t("マスター")}>
      <h1 className={styles.title}>{t("マスター")}</h1>
    </section>
  )
}
