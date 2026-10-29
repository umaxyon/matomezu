// 土台が読む利用者の設定の項目のビュー: 言語（言語パックの名前）・スキン（スキンの名前と自動）・キーの割り当て（準備中と出す）
import { useMessages } from "../../../ui/i18n"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { useSettings } from "../../../ui/view-hooks"
import { kit } from "../kit"
import styles from "./UserSettings.module.css"
import { shownLanguagePack } from "./user-settings"

export function LangSetting({ label, onChange }: UserSettingControlProps<string>) {
  const catalog = useCatalog().core
  const { lang, values } = useSettings()
  return (
    <label className={styles.row}>
      <span className={styles.label}>{label}</span>
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
    </label>
  )
}

export function SkinSetting({ label, value, onChange }: UserSettingControlProps<string>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  return (
    <label className={styles.row}>
      <span className={styles.label}>{label}</span>
      <select className={styles.control} value={value} onChange={e => onChange(e.target.value)}>
        <option value="auto">{t("Auto")}</option>
        {[...catalog.skins.values()].map(s => (
          <option key={s.id} value={s.id}>
            {t(s.title)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function KeysSetting({ label }: UserSettingControlProps) {
  const t = useMessages(kit)
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.hint}>{t("(Coming soon)")}</span>
    </div>
  )
}
