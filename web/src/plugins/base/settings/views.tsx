// 土台が読む利用者の設定の項目のビュー: 言語（言語パックの名前）・スキン（スキンの名前と自動）
import { useMessages } from "../../../ui/i18n"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { useSettings } from "../../../ui/view-hooks"
import { kit } from "../kit"
import { SettingRow } from "./SettingRow"
import styles from "./UserSettings.module.css"
import { shownLanguagePack } from "./user-settings"

export function LangSetting({ label, onChange }: UserSettingControlProps<string>) {
  const catalog = useCatalog().core
  const { lang, values } = useSettings()
  return (
    <SettingRow label={label} as="label">
      <select
        className={styles.control}
        value={shownLanguagePack(catalog, values, lang)}
        onChange={e => onChange(e.target.value)}
      >
        {[...catalog.languagePacks.values()].map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </SettingRow>
  )
}

export function SkinSetting({ label, value, onChange }: UserSettingControlProps<string>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  return (
    <SettingRow label={label} as="label">
      <select className={styles.control} value={value} onChange={e => onChange(e.target.value)}>
        <option value="auto">{t("Auto")}</option>
        {[...catalog.skins.values()].map(s => (
          <option key={s.id} value={s.id}>
            {t(s.title)}
          </option>
        ))}
      </select>
    </SettingRow>
  )
}
