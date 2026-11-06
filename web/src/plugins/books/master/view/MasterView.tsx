// マスターのブックのビュー: ブックの一覧や設定などを集める、紙の無いただの画面。見た目はテーマで描く。
// ブックを作るボタンと、設定画面を開くボタンを置く。どちらもコマンド（book-new・settings-open）を呼ぶ
import { type BookViewProps, useCommand, useMessages } from "../../../../plugin-api/ui"
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

// 設定の区分: 設定画面を開くボタン
function Settings({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const open = useCommand(stage, "@matomezu/base:settings-open")
  return (
    <div className={styles.group}>
      <h2 className={styles.heading}>{t("Settings")}</h2>
      {open.shown && (
        <div>
          <button type="button" className={styles.button} onClick={() => open.run()}>
            {t(open.title)}
          </button>
        </div>
      )}
    </div>
  )
}
