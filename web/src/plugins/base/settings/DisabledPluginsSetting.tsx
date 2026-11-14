// 追加プラグインの有効・無効（利用者の設定の項目 disabled-plugins）のビュー: 入れた追加プラグインごとの行に、有効のスイッチ

import { isBuiltin } from "../../../store/plugin"
import { useMessages } from "../../../ui/i18n"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { useInstance } from "../../../ui/store-context"
import { rowClass, Section } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { withPluginEnabled } from "../utils/disabled-plugins"

export function DisabledPluginsSetting({ label, value, onChange }: UserSettingControlProps<readonly string[]>) {
  const t = useMessages(kit)
  const added = useInstance().plugins.filter(p => !isBuiltin(p))
  const disabled = value ?? []
  return (
    <Section title={label}>
      {added.length === 0 ? <p>{t("No added plugins")}</p> : null}
      {added.map(p => (
        <label key={p.id} className={rowClass}>
          <input
            type="checkbox"
            checked={!disabled.includes(p.id)}
            onChange={e => onChange(withPluginEnabled(disabled, p.id, e.target.checked))}
          />
          <span>{p.id}</span>
        </label>
      ))}
    </Section>
  )
}
