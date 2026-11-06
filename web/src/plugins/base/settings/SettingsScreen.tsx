// 設定画面の中身: 左に項目の一覧（配置がスロット settings-sections に置いたウィジェット。題名は定義の settingsSection.title）、右に選んだ項目のウィジェットの中身。
// 押した項目に右の中身が切り替わる（選んでいる項目は画面の中で持ち、配置から無くなれば先頭の項目）。
// ダイアログに頼らないので、ほかの置き場にもそのまま置ける（要素の id は置いた所ごとに振る）。設定を書くコマンドは stage で行う
import { type ReactNode, useId, useState } from "react"
import { useT } from "../../../ui/i18n"
import { useLayout, useUiCatalog } from "../../../ui/store-context"
import styles from "./SettingsScreen.module.css"
import type { SettingsSectionProps } from "./sections"
import { SETTINGS_SECTIONS } from "./settings-screen"

export function SettingsScreen({ stage }: { stage: string }) {
  const t = useT() // 題名はほかのプラグインの文言の鍵でもある
  const widgets = useUiCatalog().widgets
  const sections = (useLayout().slots[SETTINGS_SECTIONS] ?? []).flatMap(id => {
    const def = widgets.get(id)
    const View = def?.view as ((props: SettingsSectionProps) => ReactNode) | undefined
    return def?.settingsSection && View ? [{ id, title: def.settingsSection.title, View }] : []
  })
  const [current, setCurrent] = useState<string | undefined>(undefined)
  const shown = sections.find(s => s.id === current) ?? sections[0]
  const base = useId()
  const tabId = (section: string) => `${base}-tab-${section}`
  const panelId = `${base}-panel`
  return (
    <div className={styles.screen}>
      <div className={styles.sections} role="tablist" aria-orientation="vertical">
        {sections.map(s => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={tabId(s.id)}
            aria-selected={s.id === shown?.id}
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
          <shown.View stage={stage} />
        </section>
      )}
    </div>
  )
}
