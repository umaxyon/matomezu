// 設定画面の中身: 左に項目の一覧（SETTINGS_SECTIONS）、右に選んだ項目の欄。押した項目に右の欄が切り替わる（選んでいる項目は画面の中で持つ）。
// ダイアログに頼らないので、ほかの置き場にもそのまま置ける。項目の欄の中身はまだ無い
import { useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import styles from "./SettingsScreen.module.css"
import { SETTINGS_SECTIONS } from "./settings-screen"

export function SettingsScreen() {
  const t = useMessages(kit)
  const [current, setCurrent] = useState(SETTINGS_SECTIONS[0]?.id)
  const shown = SETTINGS_SECTIONS.find(s => s.id === current)
  return (
    <div className={styles.screen}>
      <div className={styles.sections} role="tablist" aria-orientation="vertical">
        {SETTINGS_SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`settings-tab-${s.id}`}
            aria-selected={s.id === current}
            aria-controls="settings-panel"
            className={styles.section}
            onClick={() => setCurrent(s.id)}
          >
            {t(s.title)}
          </button>
        ))}
      </div>
      {shown && (
        <section
          id="settings-panel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${shown.id}`}
          className={styles.panel}
        >
          <h3 className={styles.title}>{t(shown.title)}</h3>
        </section>
      )}
    </div>
  )
}
