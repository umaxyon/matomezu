// 文字の色の設定のコンポーネント（設定の項目 page-text-colors と、利用者の設定の項目 text-colors のビュー）: 文字の色ごとに、色を選ぶポップアップ（「なし」は定義の色）
import { settingOr } from "../../../core/def/setting"
import { useMessages } from "../../../ui/i18n"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { ColorPicker, NO_COLOR } from "../dialog-host/ColorPicker"
import { rowClass, Section } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { type TextColorValues, withTextColor } from "./text-colors"

export function TextColorsSetting({ label, value, onChange, onReset }: UserSettingControlProps<TextColorValues>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  const own = settingOr(value, undefined)
  return (
    <Section title={label}>
      {[...catalog.textColors.values()].map(c => (
        <div key={c.id} className={rowClass}>
          <span>{t(c.title)}</span>
          <ColorPicker
            label={t(c.title)}
            value={own?.[c.id] ?? NO_COLOR}
            palette={[]}
            none={c.color}
            onChange={hex => {
              const next = withTextColor(own, c.id, hex === NO_COLOR ? undefined : hex)
              if (next === undefined) onReset()
              else onChange(next)
            }}
          />
        </div>
      ))}
    </Section>
  )
}
