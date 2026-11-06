// 設定画面の中身: 左に項目の一覧（SETTINGS_SECTIONS）、右に選んだ項目の中身（全体は利用者の設定の並び、ショートカットキーはキーバインドの一覧）。押した項目に右の中身が切り替わる（選んでいる項目は画面の中で持つ）。
// ダイアログに頼らないので、ほかの置き場にもそのまま置ける（要素の id は置いた所ごとに振る）。設定を書くコマンドは stage で行う
import { type ComponentType, useId, useState } from "react"
import { useMessages } from "../../../ui/i18n"
import { kit } from "../kit"
import { KeysPane } from "./KeysPane"
import styles from "./SettingsScreen.module.css"
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settings-screen"
import { UserSettings } from "./UserSettings"

// 項目の id ごとの、右に出す中身
const PANES: Readonly<Record<SettingsSectionId, ComponentType<{ stage: string }>>> = {
  general: UserSettings,
  keys: KeysPane,
}

export function SettingsScreen({ stage }: { stage: string }) {
  const t = useMessages(kit)
  const [current, setCurrent] = useState<SettingsSectionId>(SETTINGS_SECTIONS[0].id)
  const shown = SETTINGS_SECTIONS.find(s => s.id === current)
  const base = useId()
  const tabId = (section: string) => `${base}-tab-${section}`
  const panelId = `${base}-panel`
  return (
    <div className={styles.screen}>
      <div className={styles.sections} role="tablist" aria-orientation="vertical">
        {SETTINGS_SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={tabId(s.id)}
            aria-selected={s.id === current}
            aria-controls={panelId}
            className={styles.section}
            onClick={() => setCurrent(s.id)}
          >
            {t(s.title)}
          </button>
        ))}
      </div>
      {shown && (
        <section id={panelId} role="tabpanel" aria-labelledby={tabId(shown.id)} className={styles.panel}>
          <h3 className={styles.title}>{t(shown.title)}</h3>
          <SectionPane section={shown.id} stage={stage} />
        </section>
      )}
    </div>
  )
}

// 項目の中身（項目の id で PANES から引く）
function SectionPane({ section, stage }: { section: SettingsSectionId; stage: string }) {
  const Pane = PANES[section]
  return <Pane stage={stage} />
}
