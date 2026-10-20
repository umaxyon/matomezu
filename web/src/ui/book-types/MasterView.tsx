// マスターのブックのビュー: ブックの一覧や設定などを集める、紙の無いただの画面。見た目はテーマで描く。
// 設定（言語・スキン）と、ブックを作るボタンを置く
import { useState } from "react"
import { LANG_NAMES, LANGS, type Lang } from "../../core/i18n/i18n"
import type { Stage } from "../../core/stage"
import { NewBookDialog } from "../dialog/NewBookDialog"
import { useT } from "../i18n"
import { SKINS } from "../skins"
import { useActions, useApp } from "../store-context"
import styles from "./MasterView.module.css"

export function MasterView({ stage }: { stage: Stage }) {
  const t = useT()
  const [creating, setCreating] = useState(false)
  return (
    <section className={styles.master} aria-label={t("マスター")}>
      <h1 className={styles.title}>{t("マスター")}</h1>
      <div className={styles.group}>
        <h2 className={styles.heading}>{t("ブック")}</h2>
        <div>
          <button type="button" className={styles.button} onClick={() => setCreating(true)}>
            {t("新しいブック")}
          </button>
        </div>
      </div>
      <Settings />
      <NewBookDialog stage={stage.id} open={creating} onClose={() => setCreating(false)} />
    </section>
  )
}

function Settings() {
  const t = useT()
  const { lang, skin } = useApp(s => s.settings)
  const { setLang, setSkin } = useActions()
  return (
    <div className={styles.group}>
      <h2 className={styles.heading}>{t("設定")}</h2>
      <label className={styles.row}>
        <span className={styles.label}>{t("言語")}</span>
        <select className={styles.select} value={lang} onChange={e => setLang(e.target.value as Lang)}>
          {LANGS.map(l => (
            <option key={l} value={l}>
              {LANG_NAMES[l]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.row}>
        <span className={styles.label}>{t("スキン")}</span>
        <select className={styles.select} value={skin} onChange={e => setSkin(e.target.value)}>
          <option value="auto">{t("自動")}</option>
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
