// 文字の色の設定のコンポーネント（設定の項目 book-text-colors と、利用者の設定の項目 text-colors のビュー）: 文字の色ごとに、色を選ぶポップアップ（「なし」は定義の色）
import { useMessages } from "../../../ui/i18n"
import type { UserSettingControlProps } from "../../../ui/plugin"
import { useCatalog } from "../../../ui/store-context"
import { ColorPicker } from "../dialog-host/ColorPicker"
import { rowClass, Section } from "../dialog-host/FormParts"
import { kit } from "../kit"
import { type TextColorValues, withTextColor } from "./text-colors"

export function TextColorsSetting({ label, value, onChange }: UserSettingControlProps<TextColorValues>) {
  const t = useMessages(kit)
  const catalog = useCatalog().core
  return (
    <Section title={label}>
      {[...catalog.textColors.values()].map(c => (
        <div key={c.id} className={rowClass}>
          <span>{t(c.title)}</span>
          <ColorPicker
            label={t(c.title)}
            value={value?.[c.id]}
            palette={[]}
            none={c.color}
            onChange={hex => onChange(withTextColor(value, c.id, hex))}
          />
        </div>
      ))}
    </Section>
  )
}
