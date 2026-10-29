// マスターのブックのビュー: ブックの一覧や設定などを集める、紙の無いただの画面。見た目はテーマで描く。
// 設定（言語・スキン・文字の色の上書き）と、ブックを作るボタンを置く。どれもコマンド（book-new・settings-set）を呼ぶ。
// 文字の色の上書きは見る人のもので、どのブックでもいちばん強い（「なし」は上書きを消し、ブックの色か定義の色に戻る）
import {
  type BookViewProps,
  useCommand,
  useCoreCatalog,
  useMessages,
  useSettings,
  useUserSetting,
} from "../../../../plugin-api/ui"
import { shownLanguagePack, withTextColor } from "../../../base"
import { ColorPicker } from "../../../base/ui"
import { kit } from "../kit"
import styles from "./MasterView.module.css"

const LANG = "@matomezu/base:lang"
const SKIN = "@matomezu/base:skin"
const TEXT_COLORS = "@matomezu/base:text-colors"

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

// 設定の区分: 言語・スキン・文字の色の上書き（利用者の設定の項目）。ホームのタイプが設定を変えるのを許さなければ、選べなくする
function Settings({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const { lang, values } = useSettings()
  const catalog = useCoreCatalog()
  const { languagePacks, skins, textColors, userSettings } = catalog
  const skin = useUserSetting(SKIN) as string
  const own = useUserSetting(TEXT_COLORS) as Readonly<Record<string, string>>
  const set = useCommand(stage, "@matomezu/base:settings-set")
  const title = (id: string) => t(userSettings.get(id)?.title ?? "Settings")
  return (
    <div className={styles.group}>
      <h2 className={styles.heading}>{t("Settings")}</h2>
      <label className={styles.row}>
        <span className={styles.label}>{title(LANG)}</span>
        <select
          className={styles.select}
          value={shownLanguagePack(catalog, values, lang)}
          disabled={!set.enabled}
          onChange={e => set.run({ [LANG]: e.target.value })}
        >
          {[...languagePacks.values()].map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.row}>
        <span className={styles.label}>{title(SKIN)}</span>
        <select
          className={styles.select}
          value={skin}
          disabled={!set.enabled}
          onChange={e => set.run({ [SKIN]: e.target.value })}
        >
          <option value="auto">{t("Auto")}</option>
          {[...skins.values()].map(s => (
            <option key={s.id} value={s.id}>
              {t(s.title)}
            </option>
          ))}
        </select>
      </label>
      {set.shown &&
        [...textColors.values()].map(c => (
          <div key={c.id} className={styles.row}>
            <span className={styles.label}>{t(c.title)}</span>
            <ColorPicker
              label={`${title(TEXT_COLORS)}: ${t(c.title)}`}
              value={own[c.id]}
              palette={[]}
              none={c.color}
              onChange={color => set.run({ [TEXT_COLORS]: withTextColor(own, c.id, color ?? null) })}
            />
          </div>
        ))}
    </div>
  )
}
