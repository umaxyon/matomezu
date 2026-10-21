// マスターのブックのビュー: ブックの一覧や設定などを集める、紙の無いただの画面。見た目はテーマで描く。
// 設定（言語・スキン）と、ブックを作るボタンを置く。どれもコマンド（book.new・settings.lang・settings.skin）を呼ぶ
import type { Stage } from "../../core/stage"
import { useCommand } from "../../ui/commands"
import { useT } from "../../ui/i18n"
import { SKINS } from "../../ui/skins"
import { useApp, useRegistry } from "../../ui/store-context"
import styles from "./MasterView.module.css"

export function MasterView({ stage }: { stage: Stage }) {
  const t = useT()
  const newBook = useCommand(stage.id, "book.new")
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
      <Settings stage={stage.id} />
    </section>
  )
}

// 設定の欄。ホームのタイプが変えるのを許さない設定は、選べなくする
function Settings({ stage }: { stage: string }) {
  const t = useT()
  const { lang, skin } = useApp(s => s.settings)
  const { languages } = useRegistry()
  const setLang = useCommand(stage, "settings.lang")
  const setSkin = useCommand(stage, "settings.skin")
  return (
    <div className={styles.group}>
      <h2 className={styles.heading}>{t("Settings")}</h2>
      <label className={styles.row}>
        <span className={styles.label}>{t(setLang.title)}</span>
        <select
          className={styles.select}
          value={lang}
          disabled={!setLang.enabled}
          onChange={e => setLang.run(e.target.value)}
        >
          {[...languages].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.row}>
        <span className={styles.label}>{t(setSkin.title)}</span>
        <select
          className={styles.select}
          value={skin}
          disabled={!setSkin.enabled}
          onChange={e => setSkin.run(e.target.value)}
        >
          <option value="auto">{t("Auto")}</option>
          {SKINS.map(s => (
            <option key={s.id} value={s.id}>
              {t(s.title)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
