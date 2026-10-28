// マスターのブックのビュー: ブックの一覧や設定などを集める、紙の無いただの画面。見た目はテーマで描く。
// 設定（言語・スキン・文字の色の上書き）と、ブックを作るボタンを置く。どれもコマンド（book-new・settings-lang・settings-skin・settings-text-color）を呼ぶ。
// 文字の色の上書きは見る人のもので、どのブックでもいちばん強い（「なし」は上書きを消し、ブックの色か定義の色に戻る）
import { type BookViewProps, useCommand, useCoreCatalog, useMessages, useSettings } from "../../../../plugin-api/ui"
import { ColorPicker } from "../../../base/ui"
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

// 設定の区分。ホームのタイプが変えるのを許さない設定は、選べなくする
function Settings({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const { lang, skin, textColors: own } = useSettings()
  const { languages, skins, textColors } = useCoreCatalog()
  const setLang = useCommand(stage, "@matomezu/base:settings-lang")
  const setSkin = useCommand(stage, "@matomezu/base:settings-skin")
  const setColor = useCommand(stage, "@matomezu/base:settings-text-color")
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
          {[...skins.values()].map(s => (
            <option key={s.id} value={s.id}>
              {t(s.title)}
            </option>
          ))}
        </select>
      </label>
      {setColor.shown &&
        [...textColors.values()].map(c => (
          <div key={c.id} className={styles.row}>
            <span className={styles.label}>{t(c.title)}</span>
            <ColorPicker
              label={`${t(setColor.title)}: ${t(c.title)}`}
              value={own[c.id]}
              palette={[]}
              none={c.color}
              onChange={color => setColor.run({ id: c.id, color: color ?? null })}
            />
          </div>
        ))}
    </div>
  )
}
