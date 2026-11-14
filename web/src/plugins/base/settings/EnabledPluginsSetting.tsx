// 追加プラグインの有効・無効（利用者の設定の項目 enabled-plugins）のビュー: 入れた追加プラグインごとの行に、有効のスイッチと、プラグインが名乗った名前（無ければ id）・id・概要

import { isBuiltin } from "../../../store/plugin"
import { useMessages } from "../../../ui/i18n"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { useInstance } from "../../../ui/store-context"
import { rowClass, Section } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { withPluginEnabled } from "./enabled-plugins"

export function EnabledPluginsSetting({ label, value, onChange }: UserSettingControlProps<readonly string[]>) {
  const t = useMessages(kit)
  const added = useInstance().plugins.filter(p => !isBuiltin(p))
  const enabled = value ?? []
  return (
    <Section title={label}>
      {added.length === 0 ? <p>{t("No added plugins")}</p> : null}
      {added.map(p => (
        <label key={p.id} className={rowClass}>
          <input
            type="checkbox"
            checked={enabled.includes(p.id)}
            onChange={e => onChange(withPluginEnabled(enabled, p.id, e.target.checked))}
          />
          <span>
            {p.title ? <strong>{t(p.title)} </strong> : null}
            <small>{p.id}</small>
            {p.description ? (
              <>
                <br />
                <small>{t(p.description)}</small>
              </>
            ) : null}
          </span>
        </label>
      ))}
    </Section>
  )
}
