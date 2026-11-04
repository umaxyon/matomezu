// マスターのブックのビュー: ブックの一覧や設定などを集める、紙の無いただの画面。見た目はテーマで描く。
// ブックを作るボタンと、利用者の設定の並び（base の UserSettings）を置く。どれもコマンド（book-new・settings-set）を呼ぶ
import { type BookViewProps, useCommand, useMessages } from "../../../../plugin-api/ui"
import { UserSettings } from "../../../base/ui"
import { kit } from "../kit"
import styles from "./MasterView.module.css"

export function MasterView({ stage }: BookViewProps) {
  const t = useMessages(kit)
  const newBook = useCommand(stage, "@matomezu/base:book-new")
  return (
    <section className={styles.master} aria-label={t("Master")}>
      <h1 className={styles.title}>{t("Master")}</h1>
      <div className={styles.group}>
        <h2 className={styles.heading}>{t("Books")}</h2>
        <div>
          {newBook.shown && (
            <button type="button" className={styles.button} onClick={() => newBook.run()}>
              {t(newBook.title)}
            </button>
          )}
        </div>
      </div>
      <Settings stage={stage} />
    </section>
  )
}

// 設定の区分: 利用者の設定の項目を並べ、設定画面の作りが決まっていないことを伝える文言を書き添える
function Settings({ stage }: { stage: string }) {
  const t = useMessages(kit)
  return (
    <div className={styles.group}>
      <h2 className={styles.heading}>{t("Settings")}</h2>
      <p className={styles.note}>{t("(The settings screen is provisional)")}</p>
      <UserSettings stage={stage} />
    </div>
  )
}
